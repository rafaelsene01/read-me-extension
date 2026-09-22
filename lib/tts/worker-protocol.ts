import type { LocalEngineId, ModelStatus, TtsBackend, TtsSynthesisOptions } from './types';

/** Offscreen document → inference worker. */
export type WorkerCommand =
  | { type: 'load'; engine: LocalEngineId }
  | {
      type: 'synthesize';
      requestId: string;
      text: string;
      options: TtsSynthesisOptions;
    }
  /**
   * Same synthesis as above for a sentence that is not playing yet; `key`
   * identifies it in the audio events. Never cancels the request in the air.
   */
  | { type: 'prefetch'; key: string; text: string; options: TtsSynthesisOptions }
  /** Cancels `requestId` (or the current one) and every prefetch in flight. */
  | { type: 'stop'; requestId?: string }
  | { type: 'unload' };

/** Inference worker → offscreen document. */
export type WorkerEvent =
  | {
      type: 'status';
      engine: LocalEngineId;
      status: ModelStatus;
      progress?: number;
      error?: string;
    }
  | { type: 'backend'; engine: LocalEngineId; backend: TtsBackend }
  | { type: 'audio'; requestId: string; pcm: Float32Array<ArrayBuffer>; sampleRate: number }
  | { type: 'audio-end'; requestId: string }
  | { type: 'error'; requestId: string; message: string };
