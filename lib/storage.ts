import { storage } from 'wxt/utils/storage';
import type { LibraryDocument } from './document';
import type { Block, Cursor, Prefs } from './types';

/**
 * Capture is refused once the buffer would reach this many characters. Spec
 * P1-A AC10 reads "atingiu 500.000": the limit is inclusive, so a capture that
 * lands the buffer on exactly 500000 is already refused.
 */
export const MAX_BUFFER_CHARS = 500_000;

export type SetResult = { ok: true } | { ok: false; reason: 'quota' };
export type AppendResult = SetResult | { ok: false; reason: 'full' };

const blocksItem = storage.defineItem<Block[]>('local:blocks', { fallback: [] });
const cursorItem = storage.defineItem<Cursor | null>('local:cursor', { fallback: null });
const prefsItem = storage.defineItem<Partial<Prefs>>('local:prefs', { fallback: {} });
const documentsItem = storage.defineItem<LibraryDocument[]>('local:documents', { fallback: [] });

function defaultVoiceByEngine(): Prefs['voiceByEngine'] {
  return { system: {}, kokoro: {}, supertonic: {} };
}

function defaultPrefs(): Prefs {
  return {
    rate: 1.0,
    targetLang: navigator.language,
    ttsEngine: 'system',
    voiceByLang: {},
    voiceByEngine: defaultVoiceByEngine(),
    activeTab: 'original',
    favoriteVoices: [],
  };
}

export function getBlocks(): Promise<Block[]> {
  return blocksItem.getValue();
}

/**
 * Single write point for the buffer, so every caller gets the same quota
 * handling instead of each one guarding its own setBlocks.
 */
export async function setBlocks(blocks: Block[]): Promise<SetResult> {
  try {
    await blocksItem.setValue(blocks);
  } catch {
    // Quota error: nothing was written, so the previous buffer still stands.
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

export async function appendBlock(block: Block): Promise<AppendResult> {
  const blocks = await getBlocks();
  const total = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (total + block.text.length >= MAX_BUFFER_CHARS) return { ok: false, reason: 'full' };

  return setBlocks([...blocks, block]);
}

export async function removeBlock(id: string): Promise<SetResult> {
  const blocks = await getBlocks();
  return setBlocks(blocks.filter((block) => block.id !== id));
}

export function clearBlocks(): Promise<SetResult> {
  return setBlocks([]);
}

/** Most recently saved first. */
export async function getDocuments(): Promise<LibraryDocument[]> {
  return (await documentsItem.getValue()).sort((a, b) => b.savedAt - a.savedAt);
}

/** Replaces the document with the same id, or adds it. Keeps the stored cover when the incoming document has none. */
export async function saveDocument(doc: LibraryDocument): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  const existing = docs.find((d) => d.id === doc.id);
  const saved =
    doc.cover === undefined && existing?.cover !== undefined
      ? { ...doc, cover: existing.cover }
      : doc;
  try {
    await documentsItem.setValue([...docs.filter((d) => d.id !== doc.id), saved]);
  } catch {
    // Quota error: nothing was written, so the previous library still stands.
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

/** Removing an id that is not stored is not an error. */
export async function deleteDocument(id: string): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  try {
    await documentsItem.setValue(docs.filter((d) => d.id !== id));
  } catch {
    // Quota error: nothing was written, so the previous library still stands.
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

export async function getPrefs(): Promise<Prefs> {
  const stored = await prefsItem.getValue();
  return {
    ...defaultPrefs(),
    ...stored,
    // Stored prefs from before voiceByEngine existed (or a partial update)
    // must not leave any engine slot undefined.
    voiceByEngine: { ...defaultVoiceByEngine(), ...(stored.voiceByEngine ?? {}) },
  };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<void> {
  await prefsItem.setValue({ ...(await prefsItem.getValue()), ...patch });
}

export function getCursor(): Promise<Cursor | null> {
  return cursorItem.getValue();
}

export function setCursor(cursor: Cursor | null): Promise<void> {
  return cursorItem.setValue(cursor);
}
