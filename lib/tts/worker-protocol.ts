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
