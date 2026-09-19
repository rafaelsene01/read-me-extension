import { hfUrl, KOKORO_MODEL, SUPERTONIC_MODEL } from './registry';
import type { LocalEngineId } from './types';

export const MODELS = { kokoro: KOKORO_MODEL, supertonic: SUPERTONIC_MODEL } as const;

export const LOCAL_ENGINES = Object.keys(MODELS) as LocalEngineId[];

export interface ModelInstallStatus {
  installed: boolean;
  sizeBytes: number;
  revision: string;
}

/**
 * Written only after a load fully succeeded, so a download interrupted
 * halfway never reads as installed. Keyed by revision: bumping the pin makes
 * the old files read as not installed.
 */
function markerUrl(engine: LocalEngineId): string {
  return hfUrl(MODELS[engine], '.readme-installed');
}

export async function markModelInstalled(engine: LocalEngineId): Promise<void> {
  const cache = await caches.open(MODELS[engine].cacheName);
  await cache.put(markerUrl(engine), new Response(''));
}

export async function isModelCached(engine: LocalEngineId): Promise<boolean> {
  // caches.open() would create an empty cache; check first.
  if (!(await caches.has(MODELS[engine].cacheName))) return false;
  const cache = await caches.open(MODELS[engine].cacheName);
  return (await cache.match(markerUrl(engine))) !== undefined;
}

export async function getModelSize(engine: LocalEngineId): Promise<number> {
  if (!(await caches.has(MODELS[engine].cacheName))) return 0;
  const cache = await caches.open(MODELS[engine].cacheName);
  let size = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get('content-length'));
    size += Number.isFinite(length) && length > 0 ? length : ((await response?.blob())?.size ?? 0);
  }
  return size;
}

export async function getModelStatus(engine: LocalEngineId): Promise<ModelInstallStatus> {
  return {
    installed: await isModelCached(engine),
    sizeBytes: await getModelSize(engine),
    revision: MODELS[engine].revision,
  };
}

export async function deleteModel(engine: LocalEngineId): Promise<void> {
  await caches.delete(MODELS[engine].cacheName);
}

export async function clearAllModels(): Promise<void> {
  await Promise.all(LOCAL_ENGINES.map(deleteModel));
}
