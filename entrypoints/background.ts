import { captureTab, isCapturable } from '../lib/capture';
import { createEngine } from '../lib/engine';
import { broadcastState, onCommand } from '../lib/messages';
import * as store from '../lib/storage';

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
  const engine = createEngine({
    tts: {
      speak: (text, { lang, rate, voiceName }) =>
        chrome.tts.speak(text, {
          lang,
          rate,
          voiceName,
          enqueue: false,
          onEvent: (event) => {
            void engine.onTtsEvent(event);
          },
        }),
      stop: () => chrome.tts.stop(),
    },
    storage: store,
    broadcast: broadcastState,
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
        await engine.setRate(command.rate);
        break;
      case 'setVoice':
        await engine.setVoice(command.lang, command.voiceName);
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
