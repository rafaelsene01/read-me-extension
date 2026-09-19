import type { EngineTts, TtsEvent } from '../engine';

/**
 * Adapter that keeps the current chrome.tts behavior behind the EngineTts
 * interface: speak resolves once the utterance is handed to the browser and
 * every engine event (end/error/interrupted) is forwarded to the playback
 * engine, exactly as the inline adapter in background.ts used to do.
 */
export function createSystemTts(onEvent: (event: TtsEvent) => void): EngineTts {
  return {
    speak(text, { lang, rate, voiceName }) {
      return new Promise<void>((resolve) => {
        chrome.tts.speak(text, {
          lang,
          rate,
          voiceName,
          enqueue: false,
          onEvent: (event) => onEvent(event),
        });
        resolve();
      });
    },
    stop() {
      chrome.tts.stop();
    },
  };
}
