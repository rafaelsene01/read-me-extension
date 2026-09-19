/** Punctuation Kokoro reads as prosody; it is kept verbatim around the phonemes. */
const PUNCTUATION = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;

export interface TextPiece {
  punctuation: boolean;
  text: string;
}

/** Splits text into word runs (to phonemize) and punctuation runs (kept as is). */
export function splitPunctuation(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(PUNCTUATION)) {
    if (match.index > last) pieces.push({ punctuation: false, text: text.slice(last, match.index) });
    pieces.push({ punctuation: true, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ punctuation: false, text: text.slice(last) });
  return pieces.filter((piece) => piece.text.trim().length > 0 || piece.punctuation);
}

/** misaki EspeakG2P (v1.0) mapping of tied espeak sequences to Kokoro symbols. */
const ESPEAK_TO_KOKORO: [string, string][] = [
  ['a^ɪ', 'I'],
  ['a^ʊ', 'W'],
  ['d^z', 'ʣ'],
  ['d^ʒ', 'ʤ'],
  ['e^ɪ', 'A'],
  ['o^ʊ', 'O'],
  ['s^s', 'S'],
  ['t^s', 'ʦ'],
  ['t^ʃ', 'ʧ'],
  ['ə^ʊ', 'Q'],
  ['ɔ^ɪ', 'Y'],
];

/**
 * Post-processes raw espeak IPA the way Kokoro's reference pipelines do:
 * misaki's EspeakG2P for non-English voices ('p'), kokoro-js for English.
 */
export function espeakToKokoro(ipa: string, voicePrefix: string): string {
  if (voicePrefix === 'a' || voicePrefix === 'b') {
    return ipa.replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l');
  }
  let out = ipa;
  for (const [from, to] of ESPEAK_TO_KOKORO) out = out.replaceAll(from, to);
  return out.replaceAll('^', '').replaceAll('-', '');
}

/**
 * Phoneme string for Kokoro: words go through `ipa` (espeak), punctuation
 * and the spaces around it are kept.
 */
export async function kokoroPhonemes(
  text: string,
  voicePrefix: string,
  ipa: (lines: string[]) => Promise<string[]>,
): Promise<string> {
  const pieces = splitPunctuation(text);
  const words = pieces.filter((piece) => !piece.punctuation).map((piece) => piece.text.trim());
  const phonemes = await ipa(words);
  let next = 0;
  const joined = pieces
    .map((piece) => (piece.punctuation ? piece.text : espeakToKokoro(phonemes[next++]?.trim() ?? '', voicePrefix)))
    .join('');
  return joined.replace(/\s+/g, ' ').trim();
}
