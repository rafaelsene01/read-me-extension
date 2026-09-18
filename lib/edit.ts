import { segmentBlock } from './segment';
import type { Block } from './types';

/**
 * Apply edited text to a block. Returns null when the edit emptied the block,
 * which the caller turns into a removal.
 *
 * The stored translation is carried over untouched: its sourceTextHash no
 * longer matches the new text, so isStale() reports it as out of date.
 */
export function applyEdit(block: Block, newText: string): Block | null {
  const text = newText.trim();
  if (!text) return null;
  if (text === block.text) return block;

  return { ...block, text, paragraphs: segmentBlock(text, block.lang, block.id) };
}

/**
 * Override the source language of a block. Paragraphs are segmented in the
 * block language, so the sentences are rebuilt with the new one.
 */
export function applyLang(block: Block, lang: string): Block {
  if (lang === block.lang) return block;

  return { ...block, lang, paragraphs: segmentBlock(block.text, lang, block.id) };
}
