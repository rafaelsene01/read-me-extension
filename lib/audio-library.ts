/**
 * The MP3s generated from documents. The bytes live in Cache Storage, next to
 * the imported books; `local:audios` only holds what the list needs, since an
 * hour of speech is far too big for storage.local.
 */

import { storage } from 'wxt/utils/storage';

export interface AudioTrack {
  id: string;
  /** Name of the document it was generated from. */
  name: string;
  /** Bytes of the MP3, for the list. */
  size: number;
  createdAt: number;
}

const CACHE = 'readme-audio';

const audiosItem = storage.defineItem<AudioTrack[]>('local:audios', { fallback: [] });

function keyOf(id: string): string {
  return `https://audio.invalid/${encodeURIComponent(id)}`;
}

/** Cache Storage is missing in the test environment; callers degrade instead of throwing. */
function open(): Promise<Cache> | null {
  return typeof caches === 'undefined' ? null : caches.open(CACHE);
}

/** Most recently generated first. */
export async function getAudios(): Promise<AudioTrack[]> {
  return [...(await audiosItem.getValue())].sort((a, b) => b.createdAt - a.createdAt);
}

/** Keeps a copy of a generated MP3. False when it could not be stored. */
export async function saveAudio(name: string, blob: Blob): Promise<boolean> {
  const cache = open();
  if (!cache) return false;
  const id = crypto.randomUUID();
  try {
    await (await cache).put(keyOf(id), new Response(blob));
    await audiosItem.setValue([
      ...(await audiosItem.getValue()),
      { id, name, size: blob.size, createdAt: Date.now() },
    ]);
  } catch {
    return false;
  }
  return true;
}

/** The stored MP3, or null when it is no longer in the cache. */
export async function loadAudio(id: string): Promise<Blob | null> {
  const cache = open();
  if (!cache) return null;
  const response = await (await cache).match(keyOf(id));
  return response ? await response.blob() : null;
}

/** Removing an id that is not stored is not an error. */
export async function deleteAudio(id: string): Promise<void> {
  const cache = open();
  if (cache) await (await cache).delete(keyOf(id));
  await audiosItem.setValue((await audiosItem.getValue()).filter((track) => track.id !== id));
}
