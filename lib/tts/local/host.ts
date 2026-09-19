import { markModelInstalled } from '../model-cache';
import { getEngineDefinition } from '../registry';
import type { LocalEngineId } from '../types';
import type { WorkerCommand, WorkerEvent } from '../worker-protocol';
import { createKokoroRuntime } from './kokoro';
import { ownedPcm } from './ort-env';
import { createSupertonicRuntime } from './supertonic';
import type { LocalEngineRuntime } from './types';

/** Each runtime owns its model session; only one is loaded at a time. */
const RUNTIMES: Record<LocalEngineId, () => LocalEngineRuntime> = {
  kokoro: createKokoroRuntime,
  supertonic: createSupertonicRuntime,
};

export type EmitWorkerEvent = (event: WorkerEvent, transfer?: Transferable[]) => void;

/**
 * The inference side of local TTS: loads one runtime at a time and turns
 * synthesize commands into PCM events. Normally hosted by the dedicated worker
 * (tts-worker.ts); returns the command handler.
 */
export function createTtsHost(emit: EmitWorkerEvent): (command: WorkerCommand) => void {
  let runtime: LocalEngineRuntime | null = null;
  let backend: 'webgpu' | 'wasm' | null = null;
  /** Newest synthesize received; anything else is stale and gets cancelled. */
  let latestRequestId: string | null = null;

  async function load(engine: LocalEngineId): Promise<void> {
    if (runtime?.engine === engine) return;
    runtime?.unload();
    runtime = null;
    const started = performance.now();
    try {
      const next = RUNTIMES[engine]();
      emit({ type: 'status', engine, status: 'loading' });
      backend = await next.load((progress) =>
        emit({
          type: 'status',
          engine,
          status: progress < 1 ? 'downloading' : 'loading',
          progress,
        }),
      );
      runtime = next;
      await markModelInstalled(engine);
      emit({ type: 'backend', engine, backend });
      emit({ type: 'status', engine, status: 'ready' });
      console.debug('[ReadMe] tts load', {
        engine,
        backend,
        loadMs: Math.round(performance.now() - started),
      });
    } catch (err) {
      const label = getEngineDefinition(engine).label;
      const reason = err instanceof Error ? err.message : String(err);
      emit({
        type: 'status',
        engine,
        status: 'error',
        error: `${label} não pôde ser executado neste dispositivo (${reason})`,
      });
    }
  }

  async function synthesize(
    command: Extract<WorkerCommand, { type: 'synthesize' }>,
  ): Promise<void> {
    const { requestId } = command;
    if (!runtime) {
      emit({ type: 'error', requestId, message: 'Modelo não carregado' });
      return;
    }
    const cancelled = () => latestRequestId !== requestId;
    if (cancelled()) return;
    const started = performance.now();
    let firstAudioMs: number | null = null;
    let audioSeconds = 0;
    try {
      await runtime.synthesize(
        command.text,
        command.options,
        (pcm, sampleRate) => {
          if (cancelled()) return;
          firstAudioMs ??= Math.round(performance.now() - started);
          audioSeconds += pcm.length / sampleRate;
          const owned = ownedPcm(pcm);
          emit({ type: 'audio', requestId, pcm: owned, sampleRate }, [owned.buffer]);
        },
        cancelled,
      );
      if (cancelled()) return;
      emit({ type: 'audio-end', requestId });
      // Dev metrics, local console only.
      const generationMs = Math.round(performance.now() - started);
      console.debug('[ReadMe] tts synth', {
        engine: runtime.engine,
        backend,
        firstAudioMs,
        generationMs,
        audioDurationMs: Math.round(audioSeconds * 1000),
        realTimeFactor: audioSeconds > 0 ? +(generationMs / 1000 / audioSeconds).toFixed(2) : null,
      });
    } catch (err) {
      if (cancelled()) return;
      emit({
        type: 'error',
        requestId,
        message: err instanceof Error ? err.message : 'Falha na síntese',
      });
    }
  }

  // Commands run one at a time: a synthesis never overlaps a load. Stops and
  // new requests update `latestRequestId` on arrival, so a running or queued
  // synthesis sees it is stale at its next chunk.
  let chain = Promise.resolve();

  return (command) => {
    if (command.type === 'stop') {
      if (command.requestId === undefined || command.requestId === latestRequestId)
        latestRequestId = null;
      return;
    }
    if (command.type === 'synthesize') latestRequestId = command.requestId;
    if (command.type === 'unload') latestRequestId = null;
    chain = chain.then(() => {
      switch (command.type) {
        case 'load':
          return load(command.engine);
        case 'synthesize':
          return synthesize(command);
        case 'unload':
          runtime?.unload();
          runtime = null;
          return;
      }
    });
  };
}
