/** Engines disponíveis: 'system' é o chrome.tts atual; as demais rodam na extensão. */
export type TtsEngineId = 'system' | 'kokoro' | 'supertonic';

export type LocalEngineId = Exclude<TtsEngineId, 'system'>;

export type TtsBackend = 'system' | 'webgpu' | 'wasm';

/**
 * Runtime state of a local model. 'idle' = not in memory (it may still be in
 * the download cache; see model-cache.ts for whether it is installed).
 */
export type ModelStatus = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface TtsVoice {
  id: string;
  name: string;
  /** BCP 47 tag, or '*' for a voice that speaks every language of its engine. */
  lang: string;
  engine: TtsEngineId;
  /** Character image shipped in public/avatars (CC0, see its LICENSE). */
  avatar?: string;
}

export interface TtsSynthesisOptions {
  lang: string;
  rate: number;
  voiceId?: string;
}

/** Live status of one engine's model, broadcast to the panel. */
export interface TtsRuntimeStatus {
  engine: TtsEngineId;
  status: ModelStatus;
  backend: TtsBackend | null;
  progress?: number;
  error?: string;
  /** A sentence was sent for synthesis and its audio has not started yet. */
  generating?: boolean;
}

/**
 * Base language of a locale: pt-BR and pt_BR both map to pt. Each engine
 * declares its own mapping on top of this (Kokoro speaks 'p' for Portuguese).
 */
export function normalizeLanguage(lang: string): string {
  const [base] = lang.split(/[-_]/);
  return (base ?? lang).toLowerCase();
}
