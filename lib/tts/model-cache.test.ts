import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllModels, deleteModel, getModelStatus, isModelCached, markModelInstalled } from './model-cache';
import { KOKORO_MODEL, SUPERTONIC_MODEL } from './registry';

/** In-memory CacheStorage: enough of the Cache API for the manager. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    let store = stores.get(name);
    if (!store) stores.set(name, (store = new Map()));
    return {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, response: Response) => void store.set(key, response),
      keys: async () => [...store.keys()],
    };
  };
  return {
    stores,
    api: {
      open,
      has: async (name: string) => stores.has(name),
      delete: async (name: string) => stores.delete(name),
    },
  };
}

let fake: ReturnType<typeof fakeCaches>;

beforeEach(() => {
  fake = fakeCaches();
  vi.stubGlobal('caches', fake.api);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('model cache', () => {
  it('reports a missing model as not installed without creating its cache', async () => {
    expect(await getModelStatus('kokoro')).toEqual({
      installed: false,
      sizeBytes: 0,
      revision: KOKORO_MODEL.revision,
    });
    expect(fake.stores.size).toBe(0);
  });

  it('a partial download is not installed until the load marks it', async () => {
    const cache = await caches.open(SUPERTONIC_MODEL.cacheName);
    await cache.put('https://x/onnx/a.onnx', new Response('12345', { headers: { 'content-length': '5' } }));
    expect(await isModelCached('supertonic')).toBe(false);

    await markModelInstalled('supertonic');

    const status = await getModelStatus('supertonic');
    expect(status.installed).toBe(true);
    expect(status.sizeBytes).toBe(5);
  });

  it('deletes one model or all of them', async () => {
    await markModelInstalled('kokoro');
    await markModelInstalled('supertonic');

    await deleteModel('kokoro');
    expect(await isModelCached('kokoro')).toBe(false);
    expect(await isModelCached('supertonic')).toBe(true);

    await clearAllModels();
    expect(await isModelCached('supertonic')).toBe(false);
  });
});
