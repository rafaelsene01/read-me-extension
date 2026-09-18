import { describe, expect, it } from 'vitest';
import { firstCursor, nextCursor, reconcile, sentenceAt } from './cursor';
import type { Block } from './types';

/** Builds a block whose paragraphs are given as arrays of sentence texts. */
function block(id: string, paragraphs: string[][]): Block {
  return {
    id,
    sourceUrl: `https://example.com/${id}`,
    sourceTitle: id,
    lang: 'pt-BR',
    text: paragraphs.map((p) => p.join(' ')).join('\n'),
    paragraphs: paragraphs.map((sentences, p) => ({
      id: `${id}:p${p}`,
      sentences: sentences.map((text, s) => ({ id: `${id}:p${p}:s${s}`, text })),
    })),
    createdAt: 0,
  };
}

const blocks: Block[] = [
  block('a', [['a0.', 'a1.'], ['a2.']]),
  block('b', [['b0.']]),
];

describe('firstCursor', () => {
  it('points at the first sentence of the first block', () => {
    expect(firstCursor(blocks)).toEqual({ blockId: 'a', paraIndex: 0, sentIndex: 0 });
  });

  it('returns null for an empty buffer', () => {
    expect(firstCursor([])).toBeNull();
  });
});

describe('nextCursor', () => {
  it('advances to the next sentence inside the paragraph', () => {
    expect(nextCursor(blocks, { blockId: 'a', paraIndex: 0, sentIndex: 0 })).toEqual({
      blockId: 'a',
      paraIndex: 0,
      sentIndex: 1,
    });
  });

  it('crosses the end of a paragraph into the next one', () => {
    expect(nextCursor(blocks, { blockId: 'a', paraIndex: 0, sentIndex: 1 })).toEqual({
      blockId: 'a',
      paraIndex: 1,
      sentIndex: 0,
    });
  });

  it('crosses the end of a block into the next block', () => {
    expect(nextCursor(blocks, { blockId: 'a', paraIndex: 1, sentIndex: 0 })).toEqual({
      blockId: 'b',
      paraIndex: 0,
      sentIndex: 0,
    });
  });

  it('returns null at the end of the buffer', () => {
    expect(nextCursor(blocks, { blockId: 'b', paraIndex: 0, sentIndex: 0 })).toBeNull();
  });
});

describe('sentenceAt', () => {
  it('returns the sentence the cursor points at', () => {
    expect(sentenceAt(blocks, { blockId: 'a', paraIndex: 0, sentIndex: 1 })).toEqual({
      id: 'a:p0:s1',
      text: 'a1.',
    });
  });

  it('returns null for an out of range cursor instead of throwing', () => {
    expect(sentenceAt(blocks, { blockId: 'a', paraIndex: 9, sentIndex: 0 })).toBeNull();
    expect(sentenceAt(blocks, { blockId: 'a', paraIndex: 0, sentIndex: 9 })).toBeNull();
    expect(sentenceAt(blocks, { blockId: 'zzz', paraIndex: 0, sentIndex: 0 })).toBeNull();
  });
});

describe('reconcile', () => {
  it('keeps a cursor that is still valid', () => {
    const cursor = { blockId: 'a', paraIndex: 1, sentIndex: 0 };

    expect(reconcile(blocks, cursor, blocks)).toEqual(cursor);
  });

  it('moves to the start of the following block when the cursor block was removed', () => {
    const remaining = [blocks[0]!, block('c', [['c0.']])];
    const previous = [blocks[0]!, blocks[1]!, block('c', [['c0.']])];

    expect(reconcile(remaining, { blockId: 'b', paraIndex: 0, sentIndex: 0 }, previous)).toEqual({
      blockId: 'c',
      paraIndex: 0,
      sentIndex: 0,
    });
  });

  it('falls back to the first sentence when the removed block was the last one', () => {
    const remaining = [blocks[0]!];

    expect(reconcile(remaining, { blockId: 'b', paraIndex: 0, sentIndex: 0 }, blocks)).toEqual({
      blockId: 'a',
      paraIndex: 0,
      sentIndex: 0,
    });
  });

  it('returns null when the buffer became empty', () => {
    expect(reconcile([], { blockId: 'a', paraIndex: 0, sentIndex: 0 }, blocks)).toBeNull();
  });
});
