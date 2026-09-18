import type { Voice } from './types';

function baseLang(lang: string): string {
  return (lang.split('-')[0] ?? lang).toLowerCase();
}

/**
 * Voices installed on this machine. Remote voices synthesize on Google servers
 * and would send the captured text off-device, so they are never offered.
 */
export function listLocalVoices(): Promise<Voice[]> {
  return new Promise((resolve) => {
    chrome.tts.getVoices((voices) => {
      resolve(
        voices
          .filter((voice) => voice.remote === false && !!voice.voiceName && !!voice.lang)
          .map((voice) => ({
            voiceName: voice.voiceName!,
            lang: voice.lang!,
            remote: false,
          })),
      );
    });
  });
}

/**
 * Voice for a language: a manual choice wins, then an exact language match,
 * then a voice sharing the base language (pt-BR falls back to pt).
 */
export function pickVoice(
  voices: Voice[],
  lang: string,
  manual: Record<string, string>,
): Voice | null {
  const base = baseLang(lang);

  const manualName = manual[lang] ?? manual[base];
  if (manualName) {
    const chosen = voices.find((voice) => voice.voiceName === manualName);
    if (chosen) return chosen;
  }

  return (
    voices.find((voice) => voice.lang === lang) ??
    voices.find((voice) => baseLang(voice.lang) === base) ??
    null
  );
}
