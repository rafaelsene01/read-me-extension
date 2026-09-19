import { stripMarkdown } from './markdown';
import { segmentBlock } from './segment';
import { MAX_BUFFER_CHARS } from './storage';
import type { Block } from './types';

export interface LibraryDocument {
  /** blocks[0].id */
  id: string;
  /** blocks[0].sourceTitle */
  name: string;
  /** Includes the translation, when there is one. */
  blocks: Block[];
  savedAt: number;
}

export type FileFailure = 'unsupported' | 'empty' | 'tooLarge';

export type FileResult = { ok: true; block: Block } | { ok: false; reason: FileFailure };

/** Turns a .txt or .md file into a reader block; Markdown syntax is stripped first. */
export function fileToBlock(name: string, raw: string, lang: string): FileResult {
  const ext = name.toLowerCase().match(/\.(txt|md)$/)?.[1];
  if (!ext) return { ok: false, reason: 'unsupported' };

  const text = ext === 'md' ? stripMarkdown(raw) : raw;
  if (!text.trim()) return { ok: false, reason: 'empty' };
  if (text.length >= MAX_BUFFER_CHARS) return { ok: false, reason: 'tooLarge' };

  const id = crypto.randomUUID();
  return {
    ok: true,
    block: {
      id,
      sourceUrl: name,
      sourceTitle: name,
      lang,
      text,
      paragraphs: segmentBlock(text, lang, id),
      createdAt: Date.now(),
    },
  };
}

/** Words per minute at 1x, the usual read-aloud pace. */
export const WORDS_PER_MINUTE = 180;

/**
 * Time to read the blocks aloud at `rate` (1 = 180 words per minute), as
 * "N min" or "N h M min"; null when there are no words.
 */
export function readingTime(blocks: Block[], rate = 1): string | null {
  const words = blocks.reduce((sum, block) => sum + (block.text.match(/\S+/g)?.length ?? 0), 0);
  if (words === 0) return null;
  const minutes = Math.max(1, Math.round(words / (WORDS_PER_MINUTE * rate)));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** Callers only save a non-empty buffer. */
export function toLibraryDocument(blocks: Block[], now = Date.now()): LibraryDocument {
  const first = blocks[0]!;
  return { id: first.id, name: first.sourceTitle, blocks, savedAt: now };
}
