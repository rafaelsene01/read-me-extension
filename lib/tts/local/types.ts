import type { LocalEngineId, TtsSynthesisOptions } from '../types';

/**
 * A local engine runtime lives entirely inside the inference worker: it owns
 * the model session and turns text into PCM chunks. Playback is the
 * offscreen document's job, never the runtime's.
 */
export interface LocalEngineRuntime {
  readonly engine: LocalEngineId;
  /**
   * Download (if not cached) and initialize the model. onProgress reports
   * 0..1 of the bytes that had to come from the network, and is never called
   * when everything was already cached. Resolves with the backend in use.
   */
  load(onProgress: (progress: number) => void): Promise<'webgpu' | 'wasm'>;
  /** Emits one PCM chunk per text chunk, in order, until done or cancelled. */
  synthesize(
    text: string,
    options: TtsSynthesisOptions,
    onChunk: (pcm: Float32Array, sampleRate: number) => void,
    isCancelled: () => boolean,
  ): Promise<void>;
  unload(): void;
}
