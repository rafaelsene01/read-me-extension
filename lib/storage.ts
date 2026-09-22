import { storage } from 'wxt/utils/storage';
import type { LibraryDocument } from './document';
import { DEFAULT_UI_LANG } from './i18n';
import type { LocalEngineId } from './tts/types';
import type { Block, Cursor, Prefs } from './types';

/**
 * Capture is refused once the buffer would reach this many characters. Spec
 * P1-A AC10 reads "atingiu 500.000": the limit is inclusive, so a capture that
 * lands the buffer on exactly 500000 is already refused.
 */
export const MAX_BUFFER_CHARS = 500_000;

/** Fastest reading speed offered, in the slider and in what is stored. */
export const MAX_RATE = 2;

export type SetResult = { ok: true } | { ok: false; reason: 'quota' };
export type AppendResult = SetResult | { ok: false; reason: 'full' };

/**
 * Which reading a buffer belongs to. The extension's page and the side panel
 * each keep their own buffer and cursor: what is opened on the page never shows
 * up in the panel, and what is captured from a site never replaces the page's.
 */
export type Scope = 'page' | 'panel';

/** The scope of this context: the extension's page, or everything else (panel, background). */
export const SCOPE: Scope = globalThis.location?.pathname === '/documents.html' ? 'page' : 'panel';

/** The storage key of a scope's buffer, as chrome.storage.onChanged names it. */
export function blocksKey(scope: Scope = SCOPE): string {
  return scope === 'page' ? 'blocks' : 'panelBlocks';
}

// The page keeps the original keys, so what it was reading survives the split.
const blocksItems = {
  page: storage.defineItem<Block[]>('local:blocks', { fallback: [] }),
  panel: storage.defineItem<Block[]>('local:panelBlocks', { fallback: [] }),
};
const cursorItems = {
  page: storage.defineItem<Cursor | null>('local:cursor', { fallback: null }),
  panel: storage.defineItem<Cursor | null>('local:panelCursor', { fallback: null }),
};
const prefsItem = storage.defineItem<Partial<Prefs>>('local:prefs', { fallback: {} });
const documentsItem = storage.defineItem<LibraryDocument[]>('local:documents', { fallback: [] });
/** Folder names of the library; a folder exists even while it holds nothing. */
const foldersItem = storage.defineItem<string[]>('local:folders', { fallback: [] });
/** Where the reading of each document stopped, by document id. */
const progressItem = storage.defineItem<Record<string, Cursor>>('local:progress', { fallback: {} });
/** Zoom step each document was last read at, by document id. */
const zoomItem = storage.defineItem<Record<string, number>>('local:zoom', { fallback: {} });

function defaultVoiceByEngine(): Prefs['voiceByEngine'] {
  return { system: {}, kokoro: {}, supertonic: {} };
}

function defaultPrefs(): Prefs {
  return {
    rate: 1.0,
    targetLang: navigator.language,
    uiLang: DEFAULT_UI_LANG,
    ttsEngine: 'system',
    voiceByLang: {},
    voiceByEngine: defaultVoiceByEngine(),
    activeTab: 'original',
    favoriteVoices: [],
    modelUsedAt: {},
    libraryView: 'list',
  };
}

export function getBlocks(scope: Scope = SCOPE): Promise<Block[]> {
  return blocksItems[scope].getValue();
}

/**
 * Single write point for the buffer, so every caller gets the same quota
 * handling instead of each one guarding its own setBlocks.
 *
 * A buffer that came from the library is written back to it: the language of a
 * document, its translation and its edits belong to the document, not to this
 * reading of it, so reopening it never has to work them out again. A buffer
 * that was never saved (a captured page) is not filed on its own.
 */
export async function setBlocks(blocks: Block[], scope: Scope = SCOPE): Promise<SetResult> {
  try {
    await blocksItems[scope].setValue(blocks);
  } catch {
    // Quota error: nothing was written, so the previous buffer still stands.
    return { ok: false, reason: 'quota' };
  }

  const id = blocks[0]?.id;
  const docs = await documentsItem.getValue();
  const stored = id ? docs.find((doc) => doc.id === id) : undefined;
  // savedAt is kept: following the buffer is not the user saving the document,
  // and it must not jump to the top of the library on every edit.
  if (stored) await saveDocument({ ...stored, name: blocks[0]!.sourceTitle, blocks, savedAt: stored.savedAt });
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

/**
 * Replaces the document with the same id, or adds it. The cover and the folder
 * of the stored one are kept when the incoming document carries none: saving
 * the buffer again must not send a filed document back to the top level.
 */
export async function saveDocument(doc: LibraryDocument): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  const existing = docs.find((d) => d.id === doc.id);
  const saved = {
    ...doc,
    cover: doc.cover ?? existing?.cover,
    folder: doc.folder ?? existing?.folder,
  };
  try {
    await documentsItem.setValue([...docs.filter((d) => d.id !== doc.id), saved]);
  } catch {
    // Quota error: nothing was written, so the previous library still stands.
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

/**
 * Marks a document as just opened. savedAt is what orders the library, so the
 * one being read goes to the top; an id that is not stored changes nothing.
 */
export async function touchDocument(id: string): Promise<void> {
  const docs = await documentsItem.getValue();
  if (!docs.some((doc) => doc.id === id)) return;
  try {
    await documentsItem.setValue(
      docs.map((doc) => (doc.id === id ? { ...doc, savedAt: Date.now() } : doc)),
    );
  } catch {
    // Quota: the order of the library is a nicety, never worth failing an open.
  }
}

/** Removing an id that is not stored is not an error. */
export async function deleteDocument(id: string): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  const { [id]: _gone, ...progress } = await progressItem.getValue();
  const { [id]: _zoom, ...zoom } = await zoomItem.getValue();
  try {
    await documentsItem.setValue(docs.filter((d) => d.id !== id));
    await progressItem.setValue(progress);
    await zoomItem.setValue(zoom);
  } catch {
    // Quota error: nothing was written, so the previous library still stands.
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

/** Folder names, in alphabetical order. */
export async function getFolders(): Promise<string[]> {
  return [...(await foldersItem.getValue())].sort((a, b) => a.localeCompare(b));
}

/** Adds a folder; a blank name, or one already taken, changes nothing. */
export async function createFolder(name: string): Promise<SetResult> {
  const folder = name.trim();
  const folders = await foldersItem.getValue();
  if (!folder || folders.some((other) => other.toLowerCase() === folder.toLowerCase())) {
    return { ok: true };
  }
  try {
    await foldersItem.setValue([...folders, folder]);
  } catch {
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

/** Removes a folder; the documents it held go back to the top level, never away. */
export async function deleteFolder(name: string): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  try {
    await foldersItem.setValue((await foldersItem.getValue()).filter((other) => other !== name));
    await documentsItem.setValue(
      docs.map((doc) => (doc.folder === name ? { ...doc, folder: undefined } : doc)),
    );
  } catch {
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

/** Files a document under `folder`, or back at the top level with null. */
export async function moveDocument(id: string, folder: string | null): Promise<SetResult> {
  const docs = await documentsItem.getValue();
  try {
    await documentsItem.setValue(
      docs.map((doc) => (doc.id === id ? { ...doc, folder: folder ?? undefined } : doc)),
    );
  } catch {
    return { ok: false, reason: 'quota' };
  }
  return { ok: true };
}

export async function getPrefs(): Promise<Prefs> {
  const stored = await prefsItem.getValue();
  const prefs = {
    ...defaultPrefs(),
    ...stored,
    // Stored prefs from before voiceByEngine existed (or a partial update)
    // must not leave any engine slot undefined.
    voiceByEngine: { ...defaultVoiceByEngine(), ...(stored.voiceByEngine ?? {}) },
  };
  // The speed used to go up to 3x: a rate stored back then stays in range.
  return { ...prefs, rate: Math.min(prefs.rate, MAX_RATE) };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<void> {
  await prefsItem.setValue({ ...(await prefsItem.getValue()), ...patch });
}

/**
 * Records that a neural model was used now, which is what keeps it from being
 * swept out of the cache. Called when a voice is picked and when a reading
 * starts, not per sentence: a write per sentence would buy nothing.
 */
export async function touchModel(engine: LocalEngineId): Promise<void> {
  const prefs = await getPrefs();
  await setPrefs({ modelUsedAt: { ...prefs.modelUsedAt, [engine]: Date.now() } });
}

export function getCursor(scope: Scope = SCOPE): Promise<Cursor | null> {
  return cursorItems[scope].getValue();
}

/**
 * Also records where the current document is being read, so reopening it from
 * the library resumes at the same page and block instead of at the beginning.
 *
 * `docId` is the buffer's document, for callers that already hold it: reading
 * the whole buffer back only to take its first id is the most expensive thing
 * in the path between one sentence and the next.
 */
export async function setCursor(
  cursor: Cursor | null,
  docId?: string,
  scope: Scope = SCOPE,
): Promise<void> {
  await cursorItems[scope].setValue(cursor);
  const id = docId ?? (await getBlocks(scope))[0]?.id;
  // A cleared cursor is not progress: the stored one stays as it was.
  if (!id || !cursor) return;
  await setProgress(id, cursor);
}

/** The zoom step `id` was last read at, or null when it was never changed. */
export async function getZoom(id: string): Promise<number | null> {
  return (await zoomItem.getValue())[id] ?? null;
}

export async function setZoom(id: string, zoom: number): Promise<void> {
  await zoomItem.setValue({ ...(await zoomItem.getValue()), [id]: zoom });
}

/** Where `id` was left, or null when it was never read. */
export async function getProgress(id: string): Promise<Cursor | null> {
  return (await progressItem.getValue())[id] ?? null;
}

/**
 * Records where a document is being read without moving the reading there:
 * turning the page by hand is where the user is, but it must not restart the
 * sentence in the air.
 */
export async function setProgress(id: string, cursor: Cursor): Promise<void> {
  await progressItem.setValue({ ...(await progressItem.getValue()), [id]: cursor });
}
