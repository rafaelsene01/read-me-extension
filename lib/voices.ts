import type { Voice } from './types';

function baseLang(lang: string): string {
  return (lang.split('-')[0] ?? lang).toLowerCase();
}

/**
 * Every voice the browser offers: the ones installed on this machine and the
 * online ones (Google in Chrome, Microsoft Natural in Edge). Online voices send
 * the text to the vendor's servers, so they are flagged remote and pickVoice
 * only falls back to them when no local voice fits.
 */
export function listVoices(): Promise<Voice[]> {
  return new Promise((resolve) => {
    chrome.tts.getVoices((voices) => {
      resolve(
        voices
          .filter((voice) => !!voice.voiceName && !!voice.lang)
          .map((voice) => ({
            voiceName: voice.voiceName!,
            lang: voice.lang!,
            remote: voice.remote === true,
          })),
      );
    });
  });
}

/**
 * Voice for a language: a manual choice wins, then an exact language match,
 * then a voice sharing the base language (pt-BR falls back to pt). Local
 * voices win over online ones at each step.
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

  const ordered = [...voices].sort((a, b) => Number(a.remote) - Number(b.remote));
  return (
    ordered.find((voice) => voice.lang === lang) ??
    ordered.find((voice) => baseLang(voice.lang) === base) ??
    null
  );
}
