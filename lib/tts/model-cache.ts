import { hfUrl, KOKORO_MODEL, SUPERTONIC_MODEL } from './registry';
import type { LocalEngineId, TtsEngineId } from './types';

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

/** A model untouched for this long is dropped from the cache. */
export const UNUSED_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Which downloaded models have gone cold. A model is dropped only when it has
 * not been used for `UNUSED_DAYS`, is not the engine currently selected, and no
 * voice of it is starred — a favourite is the user saying to keep it, so it is
 * never swept, however long it sits.
 *
 * A model with no recorded use is treated as used now: it was downloaded before
 * this bookkeeping existed, and deleting it on sight would be a nasty surprise.
 */
export function staleModels(now: number, prefs: {
  ttsEngine: TtsEngineId;
  modelUsedAt: Partial<Record<LocalEngineId, number>>;
  favoriteVoices: string[];
}): LocalEngineId[] {
  return LOCAL_ENGINES.filter((engine) => {
    if (engine === prefs.ttsEngine) return false;
    if (prefs.favoriteVoices.some((voice) => voice.startsWith(`${engine}:`))) return false;
    const usedAt = prefs.modelUsedAt[engine];
    return usedAt !== undefined && now - usedAt > UNUSED_DAYS * DAY;
  });
}

export async function deleteModel(engine: LocalEngineId): Promise<void> {
  await caches.delete(MODELS[engine].cacheName);
}

export async function clearAllModels(): Promise<void> {
  await Promise.all(LOCAL_ENGINES.map(deleteModel));
}
