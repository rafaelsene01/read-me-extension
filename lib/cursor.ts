import type { Block, Cursor, Sentence } from './types';

/** First sentence position at or after block index `start`, skipping empty paragraphs. */
function firstCursorFrom(blocks: Block[], start: number): Cursor | null {
  for (let b = start; b < blocks.length; b++) {
    const block = blocks[b];
    if (!block) continue;
    for (let p = 0; p < block.paragraphs.length; p++) {
      if ((block.paragraphs[p]?.sentences.length ?? 0) > 0) {
        return { blockId: block.id, paraIndex: p, sentIndex: 0 };
      }
    }
  }
  return null;
}

export function firstCursor(blocks: Block[]): Cursor | null {
  return firstCursorFrom(blocks, 0);
}

export function sentenceAt(blocks: Block[], cursor: Cursor): Sentence | null {
  const block = blocks.find((b) => b.id === cursor.blockId);
  return block?.paragraphs[cursor.paraIndex]?.sentences[cursor.sentIndex] ?? null;
}

/** Next sentence, crossing paragraph and block boundaries. Null at the end of the buffer. */
export function nextCursor(blocks: Block[], cursor: Cursor): Cursor | null {
  const blockIndex = blocks.findIndex((b) => b.id === cursor.blockId);
  if (blockIndex < 0) return null;
  const block = blocks[blockIndex]!;

  const paragraph = block.paragraphs[cursor.paraIndex];
  if (paragraph && cursor.sentIndex + 1 < paragraph.sentences.length) {
    return { blockId: cursor.blockId, paraIndex: cursor.paraIndex, sentIndex: cursor.sentIndex + 1 };
  }

  for (let p = cursor.paraIndex + 1; p < block.paragraphs.length; p++) {
    if ((block.paragraphs[p]?.sentences.length ?? 0) > 0) {
      return { blockId: cursor.blockId, paraIndex: p, sentIndex: 0 };
    }
  }

  return firstCursorFrom(blocks, blockIndex + 1);
}

// SPEC_DEVIATION: design.md declares reconcile(blocks, cursor). A third optional
// `previousBlocks` argument was added.
// Reason: spec P1-B AC17 requires moving to the START OF THE FOLLOWING BLOCK when
// the cursor's block is removed. The removed block's position cannot be derived
// from the new list alone. Without `previousBlocks` the function still works and
// falls back to the first sentence of the buffer.
export function reconcile(
  blocks: Block[],
  cursor: Cursor | null,
  previousBlocks?: Block[],
): Cursor | null {
  if (blocks.length === 0) return null;
  if (!cursor) return firstCursor(blocks);
  if (sentenceAt(blocks, cursor)) return cursor;

  // The block survived but shrank (edited): go back to its first sentence.
  const blockIndex = blocks.findIndex((b) => b.id === cursor.blockId);
  if (blockIndex >= 0) return firstCursorFrom(blocks, blockIndex);

  const previousIndex = previousBlocks?.findIndex((b) => b.id === cursor.blockId) ?? -1;
  if (previousIndex >= 0) {
    const followingId = previousBlocks?.[previousIndex + 1]?.id;
    const at = followingId ? blocks.findIndex((b) => b.id === followingId) : -1;
    if (at >= 0) return firstCursorFrom(blocks, at);
  }

  return firstCursor(blocks);
}
