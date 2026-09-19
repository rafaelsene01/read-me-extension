import type { Paragraph, Sentence } from './types';

/**
 * Split raw text into paragraphs (one per non-empty line) and each paragraph
 * into sentences with Intl.Segmenter. Ids derive from blockId plus positional
 * indices, so the same text always yields the same ids.
 */
export function segmentBlock(text: string, lang: string, blockId: string): Paragraph[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  const paragraphs: Paragraph[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const paraId = `${blockId}:p${paragraphs.length}`;
    const sentences: Sentence[] = [];
    for (const { segment } of segmenter.segment(trimmed)) {
      const sentence = segment.trim();
      if (!sentence) continue;
      sentences.push({ id: `${paraId}:s${sentences.length}`, text: sentence });
    }

    if (sentences.length > 0) paragraphs.push({ id: paraId, sentences });
  }

  return paragraphs;
}

/**
 * Split a sentence longer than the speech engine limit into chunks of at most
 * `max` characters. Engine-agnostic: chrome.tts passes its hard limit, the
 * neural runtimes their per-inference size. Cuts after punctuation followed by
 * a space when one sits in the last two thirds of the window, else on
 * whitespace, so words, numbers ("1,5") and URLs stay intact.
 */
export function chunkSentence(text: string, max: number): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > max) {
    const cut = cutPoint(rest, max);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

function cutPoint(text: string, max: number): number {
  const window = text.slice(0, max + 1);
  let afterPunctuation = -1;
  for (const match of window.matchAll(/[.!?…:;,](?=\s)/g)) afterPunctuation = match.index + 1;
  if (afterPunctuation > max / 3) return afterPunctuation;
  const space = window.lastIndexOf(' ');
  // A single word longer than max leaves no break point: cut it hard.
  return space > 0 ? space : max;
}
