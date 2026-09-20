/**
 * The bytes of imported books, kept in the extension's Cache Storage so a
 * chapter can be re-rendered from the original zip. `local:documents` only
 * holds the extracted text; the file itself is too big for storage.local.
 */

const CACHE = 'readme-books';

/** Loaded books, so switching chapters does not re-read the cache every time. */
const memory = new Map<string, Uint8Array<ArrayBuffer>>();

function keyOf(id: string): string {
  return `https://books.invalid/${encodeURIComponent(id)}`;
}

/** Cache Storage is missing in the test environment; callers degrade instead of throwing. */
function open(): Promise<Cache> | null {
  return typeof caches === 'undefined' ? null : caches.open(CACHE);
}

/** False when the write failed (no quota, no Cache Storage): nothing was stored. */
export async function saveBook(id: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const cache = open();
  if (!cache) return false;
  try {
    await (await cache).put(keyOf(id), new Response(new Blob([bytes])));
  } catch {
    return false;
  }
  memory.set(id, bytes);
  return true;
}

export async function loadBook(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  const cache = open();
  if (!cache) return null;
  const response = await (await cache).match(keyOf(id));
  if (!response) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  memory.set(id, bytes);
  return bytes;
}

/** A book that was never stored is not an error. */
export async function deleteBook(id: string): Promise<void> {
  memory.delete(id);
  const cache = open();
  if (cache) await (await cache).delete(keyOf(id));
}
