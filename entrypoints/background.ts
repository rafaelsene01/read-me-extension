import { captureTab, isCapturable } from '../lib/capture';
import { firstCursor } from '../lib/cursor';
import { createEngine, type Engine } from '../lib/engine';
import { setLocale, t } from '../lib/i18n';
import { broadcastState, isReaderPage, onCommand } from '../lib/messages';
import * as store from '../lib/storage';
import { requestTranslation } from '../lib/translate';
import { createLocalTtsClient } from '../lib/tts/client';
import { deleteModel, isModelCached, staleModels } from '../lib/tts/model-cache';
import { isLocalTtsEvent } from '../lib/tts/protocol';
import { createTtsRouter, pickLocalVoice } from '../lib/tts/registry';
import { createSystemTts } from '../lib/tts/system';
import type { TtsEngineId } from '../lib/tts/types';
import type { PlaybackState, Prefs } from '../lib/types';

/** Commands that mean the selected voice is being used right now. */
const USES_VOICE = new Set(['play', 'setVoice', 'setTtsEngine', 'downloadTtsModel']);

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Not supported on this browser build; the panel still opens from the menu.
  });

  // The extension's own page is the reader already: the panel would be a second
  // copy of it side by side, so it is disabled on that tab (which also closes it
  // when it is open). The page announces itself instead of the tab URL being
  // matched here: reading `tab.url` needs the broad "tabs" permission, which
  // this extension does not ask for.
  function setPanel(tabId: number | undefined, enabled: boolean): void {
    if (tabId === undefined) return;
    void chrome.sidePanel.setOptions({ tabId, enabled }).catch(() => {});
  }

  // Right-click on a selection sends it to the reader.
  chrome.runtime.onInstalled.addListener(async () => {
    setLocale((await store.getPrefs()).uiLang);
    chrome.contextMenus.create({
      id: 'capture-selection',
      title: t('Enviar para ReadMe'),
      contexts: ['selection'],
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'capture-selection' || tab?.id === undefined) return;
    // sidePanel.open needs the user gesture, so it runs before any await.
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    // The click grants activeTab, so no host permission prompt is needed.
    // ponytail: failures are silent here; surface them in the panel if users miss them.
    if (tab.url && isCapturable(tab.url)) void captureTab(tab.id, 'selection');
  });

  // SPEC_DEVIATION: design.md names `chrome.tts.onEvent`.
  // Reason: no such top-level event exists. chrome.tts delivers events through
  // the onEvent callback in TtsOptions, registered per utterance, which is what
  // wakes the service worker when a sentence ends.
  //
  // Local (neural) engines run in an offscreen document + worker; this client
  // drives them over the requestId-tagged local-tts protocol.
  let selectedEngine: TtsEngineId = 'system';
  void store.getPrefs().then((prefs) => {
    selectedEngine = prefs.ttsEngine;
  });

  let engine: Engine;

  /**
   * The buffer the one engine reads: the page's or the panel's. Playing on the
   * other one pauses this reading and moves the engine over; its cursor stays
   * where it was.
   */
  let scope: store.Scope = 'panel';
  const broadcast = (state: PlaybackState) => broadcastState(state, scope);

  function scopeOf(sender: chrome.runtime.MessageSender): store.Scope {
    return sender.url && new URL(sender.url).pathname === '/documents.html' ? 'page' : 'panel';
  }

  async function use(target: store.Scope): Promise<void> {
    if (target === scope) return;
    if ((await engine.getState()).playing) await engine.pause();
    scope = target;
    // Drops the other buffer the engine kept and settles this one's cursor.
    await engine.blocksChanged();
  }

  /** What a UI of `target` shows: the engine's state, or its own reading at rest. */
  async function stateOf(target: store.Scope): Promise<PlaybackState> {
    const state = await engine.getState();
    if (target === scope) return state;
    return { playing: false, cursor: await store.getCursor(target), error: null, tts: state.tts };
  }

  const localClient = createLocalTtsClient({
    onEvent: (event) => void engine.onTtsEvent(event),
    onStatus: () => void engine.getState().then(broadcast),
    getSelectedEngine: async () => (await store.getPrefs()).ttsEngine,
    getVoice: async (ttsEngine, lang) => {
      const prefs = await store.getPrefs();
      return pickLocalVoice(ttsEngine, lang, prefs.voiceByEngine[ttsEngine])?.id;
    },
  });

  engine = createEngine({
    tts: createTtsRouter({
      system: createSystemTts((event) => {
        void engine.onTtsEvent(event);
      }),
      local: localClient,
      getPrefs: store.getPrefs,
    }),
    storage: {
      ...store,
      getBlocks: () => store.getBlocks(scope),
      getCursor: () => store.getCursor(scope),
      setCursor: (cursor, docId) => store.setCursor(cursor, docId, scope),
    },
    broadcast,
    getTtsStatus: () =>
      selectedEngine === 'system' ? undefined : localClient.getStatus(selectedEngine),
    translate: requestTranslation,
  });

  // Events coming back from the offscreen document, and the reader page
  // reporting whether it is the one in a given tab.
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (isLocalTtsEvent(message)) localClient.handleEvent(message);
    if (isReaderPage(message)) setPanel(sender.tab?.id, !message.open);
    return false;
  });

  onCommand(async (command, sender) => {
    const from = scopeOf(sender);
    switch (command.type) {
      case 'play':
        await use(from);
        await engine.play();
        break;
      case 'pause':
        // The other reading is not playing: there is nothing of it to pause.
        if (from === scope) await engine.pause();
        break;
      case 'stop':
        if (from === scope) await engine.stop();
        else {
          await store.setCursor(firstCursor(await store.getBlocks(from)), undefined, from);
          await broadcastState(await stateOf(from), from);
        }
        break;
      case 'seek':
        await use(from);
        await engine.seek(command.cursor);
        break;
      case 'setRate':
        await engine.setRate(command.rate, command.commit);
        break;
      case 'setVoice':
        await engine.setVoice(command.lang, command.voiceName, command.engine);
        // A neural voice is unusable until its model is there: picking one
        // starts the download instead of waiting for a second click.
        if (command.engine && command.engine !== 'system') {
          void localClient.prepare(command.engine);
        }
        break;
      case 'setTtsEngine':
        await engine.setTtsEngine(command.engine);
        break;
      case 'downloadTtsModel':
        // Not awaited: the panel follows the download through status broadcasts.
        void localClient.prepare(command.engine);
        break;
      default:
        // 'capture' goes to the content script, not here; 'state' only needs the reply below.
        break;
    }

    // The commands that mean "this voice is in use": the sweep below reads this.
    if (USES_VOICE.has(command.type)) {
      const { ttsEngine } = await store.getPrefs();
      if (ttsEngine !== 'system') await store.touchModel(ttsEngine);
    }
    return stateOf(from);
  });

  /**
   * Models nobody has used for a fortnight are dropped, so the cache does not
   * grow by hundreds of megabytes per engine that was tried once. Starred
   * voices and the selected engine are never swept. Runs once per wake of the
   * service worker, which is often enough for a fortnightly rule.
   */
  void (async () => {
    const prefs = await store.getPrefs();
    for (const engine of staleModels(Date.now(), prefs)) {
      if (await isModelCached(engine)) await deleteModel(engine);
    }
  })();

  // A removed or edited block can leave the cursor dangling.
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes[store.blocksKey(scope)]) void engine.blocksChanged();

    // The menu title is the only text of the background shown as it is.
    const uiLang = (changes.prefs?.newValue as Partial<Prefs> | undefined)?.uiLang;
    if (uiLang && uiLang !== (changes.prefs?.oldValue as Partial<Prefs> | undefined)?.uiLang) {
      setLocale(uiLang);
      void chrome.contextMenus.update('capture-selection', { title: t('Enviar para ReadMe') });
    }

    // The selected engine follows the pref instead of one command: picking a
    // voice in the panel switches engine too, and a mirror that only
    // setTtsEngine updated left the status of the running download unreported.
    const next = (changes.prefs?.newValue as Partial<Prefs> | undefined)?.ttsEngine;
    if (!next || next === selectedEngine) return;
    selectedEngine = next;
    // Back on the system voice: free the neural model's RAM/VRAM.
    if (next === 'system') localClient.dispose();
    // setPrefs already published a state; that one carried the old engine.
    void engine.getState().then(broadcast);
  });
});
