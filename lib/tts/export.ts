import { createMp3Encoder } from '../audio/mp3';
import type { LocalEngineId, TtsSynthesisOptions } from './types';
import type { WorkerCommand, WorkerEvent } from './worker-protocol';

/** A Worker (postMessage + message listener) or a direct createTtsHost in dev. */
export interface TtsHostPort {
  post(command: WorkerCommand): void;
  subscribe(listener: (event: WorkerEvent) => void): () => void;
}

/** One paragraph to synthesize. */
export interface ExportJob {
  text: string;
  options: TtsSynthesisOptions;
}

const NOTHING_TO_EXPORT = 'Nada para exportar';

/**
 * Loads `engine`, synthesizes the jobs one after another and encodes all their
 * audio into a single file. `onProgress` gets the fraction of jobs finished.
 * Rejects with the worker's message when loading or a synthesis fails, and
 * with 'Nada para exportar' when there are no jobs or no audio came back.
 */
export function exportAudio(
  { post, subscribe }: TtsHostPort,
  engine: LocalEngineId,
  jobs: ExportJob[],
  onProgress: (fraction: number) => void,
  createEncoder: typeof createMp3Encoder = createMp3Encoder,
): Promise<Blob> {
  if (jobs.length === 0) return Promise.reject(new Error(NOTHING_TO_EXPORT));

  return new Promise((resolve, reject) => {
    let encoder: ReturnType<typeof createMp3Encoder> | null = null;
    let index = -1;
    let requestId: string | null = null;

    const fail = (message: string) => {
      unsubscribe();
      reject(new Error(message));
    };

    const next = () => {
      index++;
      if (index === jobs.length) {
        unsubscribe();
        if (encoder) resolve(encoder.finish());
        else reject(new Error(NOTHING_TO_EXPORT));
        return;
      }
      const { text, options } = jobs[index]!;
      requestId = crypto.randomUUID();
      post({ type: 'synthesize', requestId, text, options });
    };

    const unsubscribe = subscribe((event) => {
      if (event.type === 'status') {
        if (event.engine !== engine) return;
        if (event.status === 'error') fail(event.error ?? 'Falha ao carregar o modelo');
        else if (event.status === 'ready' && index === -1) next();
        return;
      }
      if (event.type === 'backend' || event.requestId !== requestId) return;
      if (event.type === 'audio') {
        encoder ??= createEncoder(event.sampleRate);
        encoder.encode(event.pcm);
      } else if (event.type === 'audio-end') {
        onProgress((index + 1) / jobs.length);
        next();
      } else {
        fail(event.message);
      }
    });

    post({ type: 'load', engine });
  });
}
