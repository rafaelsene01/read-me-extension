/**
 * Model files live in the Cache API of the extension origin, one cache per
 * engine (see model-cache.ts). Downloads stream straight into the cache, so a
 * 250 MB graph is never held in memory just to be stored.
 */
export async function ensureCached(
  cache: Cache,
  url: string,
  onBytes: (bytes: number) => void,
): Promise<void> {
  if (await cache.match(url)) return;

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar o modelo (HTTP ${response.status})`);
  }

  const [store, count] = response.body.tee();
  const length = response.headers.get('content-length');
  const counting = (async () => {
    const reader = count.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      onBytes(value.byteLength);
    }
  })();
  await Promise.all([
    cache.put(url, new Response(store, length ? { headers: { 'content-length': length } } : {})),
    counting,
  ]);
}

export async function readCached(cache: Cache, url: string): Promise<ArrayBuffer> {
  await ensureCached(cache, url, () => {});
  const response = await cache.match(url);
  if (!response) throw new Error('Modelo ausente do cache');
  return response.arrayBuffer();
}
