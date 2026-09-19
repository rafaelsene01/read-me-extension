/**
 * Text front-end of Supertonic 3, ported from the official web demo
 * (supertone-oss-archive/supertonic@1e9799e, web/helper.js UnicodeProcessor).
 * The model reads raw characters, so no phonemizer is involved.
 */
const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

const CHAR_REPLACEMENTS: [string, string][] = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
];

const EXPRESSIONS: [string, string][] = [
  ['@', ' at '],
  ['e.g.,', 'for example, '],
  ['i.e.,', 'that is, '],
];

export function preprocessSupertonic(input: string, lang: string): string {
  let text = input.normalize('NFKD').replace(EMOJI, '');
  for (const [from, to] of CHAR_REPLACEMENTS) text = text.replaceAll(from, to);
  text = text.replace(/[♥☆♡©\\]/g, '');
  for (const [from, to] of EXPRESSIONS) text = text.replaceAll(from, to);
  text = text
    .replace(/ ,/g, ',')
    .replace(/ \./g, '.')
    .replace(/ !/g, '!')
    .replace(/ \?/g, '?')
    .replace(/ ;/g, ';')
    .replace(/ :/g, ':')
    .replace(/ '/g, "'")
    .replace(/"{2,}/g, '"')
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
  return `<${lang}>${text}</${lang}>`;
}

/** Character ids the text encoder expects (UTF-16 indexed, as the demo does). */
export function supertonicIds(text: string, indexer: number[]): number[] {
  const ids: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    ids.push(code < indexer.length ? indexer[code]! : -1);
  }
  return ids;
}
