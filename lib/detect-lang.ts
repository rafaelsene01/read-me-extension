/**
 * Guessing the language of an imported text. The reader needs it to pick the
 * voice and to segment sentences, and an imported file declares nothing, so the
 * alternative is `navigator.language` — the language of the browser, not of the
 * book. Chrome's own detector (CLD) answers from the text itself, offline and
 * without any extra permission.
 */

/** Enough text to recognize a language; more only costs time. */
const SAMPLE = 4000;

/** Below this, the detector is guessing between neighbours: keep the fallback. */
const CONFIDENT = 60;

/**
 * Language of `text` as Chrome sees it (`pt`, `en`, ...), or `fallback` when it
 * is unavailable, unsure, or the text is too short to tell.
 */
export async function detectLang(text: string, fallback: string): Promise<string> {
  const sample = text.trim().slice(0, SAMPLE);
  if (sample.length < 20 || typeof chrome === 'undefined' || !chrome.i18n?.detectLanguage) {
    return fallback;
  }

  try {
    const result = await chrome.i18n.detectLanguage(sample);
    const best = result.languages[0];
    // 'und' is the detector's way of saying it does not know.
    if (!best || best.language === 'und' || best.percentage < CONFIDENT) return fallback;
    return best.language;
  } catch {
    return fallback;
  }
}
