import { captureTab, isCapturable } from '../lib/capture';
import { createEngine, type Engine } from '../lib/engine';
import { broadcastState, onCommand } from '../lib/messages';
import * as store from '../lib/storage';
import { createLocalTtsClient } from '../lib/tts/client';
import { isLocalTtsEvent } from '../lib/tts/protocol';
import { createTtsRouter, pickLocalVoice } from '../lib/tts/registry';
import { createSystemTts } from '../lib/tts/system';
import type { TtsEngineId } from '../lib/tts/types';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Not supported on this browser build; the panel still opens from the menu.
  });

  // Right-click on a selection sends it to the reader.
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'capture-selection',
      title: 'Enviar para ReadMe',
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

  const localClient = createLocalTtsClient({
    onEvent: (event) => void engine.onTtsEvent(event),
    onStatus: () => void engine.getState().then(broadcastState),
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
    storage: store,
    broadcast: broadcastState,
    getTtsStatus: () =>
      selectedEngine === 'system' ? undefined : localClient.getStatus(selectedEngine),
  });

  // Events coming back from the offscreen document.
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isLocalTtsEvent(message)) localClient.handleEvent(message);
    return false;
  });

  onCommand(async (command) => {
    switch (command.type) {
      case 'play':
        await engine.play();
        break;
      case 'pause':
        await engine.pause();
        break;
      case 'stop':
        await engine.stop();
        break;
      case 'seek':
        await engine.seek(command.cursor);
        break;
      case 'setRate':
        await engine.setRate(command.rate, command.commit);
        break;
      case 'setVoice':
        await engine.setVoice(command.lang, command.voiceName);
        break;
      case 'setTtsEngine':
        selectedEngine = command.engine;
        await engine.setTtsEngine(command.engine);
        // Back on the system voice: free the neural model's RAM/VRAM.
        if (command.engine === 'system') localClient.dispose();
        break;
      case 'downloadTtsModel':
        // Not awaited: the panel follows the download through status broadcasts.
        void localClient.prepare(command.engine);
        break;
      default:
        // 'capture' is wired in T12; 'state' only needs the reply below.
        break;
    }
    return engine.getState();
  });

  // A removed or edited block can leave the cursor dangling.
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.blocks) void engine.blocksChanged();
  });
});
