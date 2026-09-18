import { describe, expect, it } from 'vitest';
import { chunkSentence, segmentBlock } from './segment';

describe('segmentBlock', () => {
  it('splits text into one paragraph per line break', () => {
    const paragraphs = segmentBlock('Primeira linha.\nSegunda linha.', 'pt-BR', 'b1');

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map((p) => p.sentences.map((s) => s.text))).toEqual([
      ['Primeira linha.'],
      ['Segunda linha.'],
    ]);
  });

  it('discards empty and whitespace-only lines', () => {
    const paragraphs = segmentBlock('Um.\n\n   \nDois.', 'pt-BR', 'b1');

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.flatMap((p) => p.sentences.map((s) => s.text))).toEqual(['Um.', 'Dois.']);
  });

  it('splits a paragraph into sentences in the block language', () => {
    const paragraphs = segmentBlock('Bom dia. Como vai? Tudo bem!', 'pt-BR', 'b1');

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs.flatMap((p) => p.sentences.map((s) => s.text))).toEqual([
      'Bom dia.',
      'Como vai?',
      'Tudo bem!',
    ]);
  });

  it('derives paragraph and sentence ids from the block id', () => {
    const paragraphs = segmentBlock('Uma. Duas.\nTres.', 'pt-BR', 'block-42');

    expect(paragraphs.map((p) => p.id)).toEqual(['block-42:p0', 'block-42:p1']);
    expect(paragraphs.flatMap((p) => p.sentences.map((s) => s.id))).toEqual([
      'block-42:p0:s0',
      'block-42:p0:s1',
      'block-42:p1:s0',
    ]);
  });

  it('produces the same ids for the same text on repeated calls', () => {
    const text = 'Uma frase. Outra frase.\nOutro paragrafo.';
    const first = segmentBlock(text, 'pt-BR', 'b1');
    const second = segmentBlock(text, 'pt-BR', 'b1');

    expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
    expect(second.flatMap((p) => p.sentences.map((s) => s.id))).toEqual(
      first.flatMap((p) => p.sentences.map((s) => s.id)),
    );
  });

  it('returns no paragraphs for text with only whitespace', () => {
    expect(segmentBlock('   \n\n  \n', 'pt-BR', 'b1')).toEqual([]);
  });
});

describe('chunkSentence', () => {
  it('returns the sentence unchanged when it fits the limit', () => {
    expect(chunkSentence('Frase curta.', 32_000)).toEqual(['Frase curta.']);
  });

  it('splits a sentence above 32000 characters into chunks within the limit', () => {
    const sentence = 'palavra '.repeat(5_000).trim(); // 39.999 characters

    const chunks = chunkSentence(sentence, 32_000);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(32_000);
    expect(chunks.join(' ')).toBe(sentence);
  });

  it('breaks on whitespace so no word is cut in half', () => {
    const chunks = chunkSentence('alpha bravo charlie delta', 12);

    expect(chunks).toEqual(['alpha bravo', 'charlie', 'delta']);
  });
});
