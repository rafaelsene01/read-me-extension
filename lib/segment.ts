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
 * `max` characters, breaking on whitespace so words stay intact.
 */
export function chunkSentence(text: string, max: number): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    // A single word longer than max leaves no break point: cut it hard.
    if (cut <= 0) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
