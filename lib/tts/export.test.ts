import { describe, expect, it, vi } from 'vitest';
import { exportAudio, type ExportJob } from './export';
import type { WorkerCommand, WorkerEvent } from './worker-protocol';

function harness() {
  const sent: WorkerCommand[] = [];
  const listeners = new Set<(event: WorkerEvent) => void>();
  const host = {
    post: (command: WorkerCommand) => sent.push(command),
    subscribe: (listener: (event: WorkerEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const emit = (event: WorkerEvent) => listeners.forEach((listener) => listener(event));
  const encoded: Float32Array[] = [];
  const createEncoder = vi.fn((_sampleRate: number) => ({
    encode: (pcm: Float32Array) => encoded.push(pcm),
    finish: () => new Blob(['mp3'], { type: 'audio/mpeg' }),
  }));
  const synths = () =>
    sent.filter((c): c is Extract<WorkerCommand, { type: 'synthesize' }> => c.type === 'synthesize');
  const ready = () => emit({ type: 'status', engine: 'kokoro', status: 'ready' });
  /** Emits one chunk and the end for the newest synthesize. */
  const finishCurrent = (sample = 0.5) => {
    const { requestId } = synths().at(-1)!;
    emit({ type: 'audio', requestId, pcm: new Float32Array([sample]), sampleRate: 24000 });
    emit({ type: 'audio-end', requestId });
  };
  return { host, sent, emit, listeners, encoded, createEncoder, synths, ready, finishCurrent };
}

const options = { lang: 'pt-BR', rate: 1 };
const jobs: ExportJob[] = ['Um.', 'Dois.', 'Três.'].map((text) => ({ text, options }));

describe('exportAudio', () => {
  it('synthesizes each job in order after ready, reports progress and resolves with the file', async () => {
    const h = harness();
    const onProgress = vi.fn();
    const result = exportAudio(h.host, 'kokoro', jobs, onProgress, h.createEncoder);

    expect(h.sent).toEqual([{ type: 'load', engine: 'kokoro' }]);
    h.emit({ type: 'status', engine: 'kokoro', status: 'downloading', progress: 0.5 });
    h.emit({ type: 'backend', engine: 'kokoro', backend: 'wasm' });
    expect(h.synths()).toHaveLength(0);

    h.ready();
    for (let i = 0; i < 3; i++) {
      expect(h.synths()).toHaveLength(i + 1);
      h.finishCurrent(i / 10);
    }

    expect(h.synths().map((c) => c.text)).toEqual(['Um.', 'Dois.', 'Três.']);
    expect(new Set(h.synths().map((c) => c.requestId)).size).toBe(3);
    expect(onProgress.mock.calls.map(([f]) => f)).toEqual([1 / 3, 2 / 3, 1]);
    expect(h.createEncoder).toHaveBeenCalledTimes(1);
    expect(h.createEncoder).toHaveBeenCalledWith(24000);
    expect(h.encoded.map((pcm) => pcm[0])).toEqual([0, 0.1, 0.2].map(Math.fround));
    expect((await result).type).toBe('audio/mpeg');
    expect(h.listeners.size).toBe(0);
  });

  it('rejects with the status message when the model fails to load', async () => {
    const h = harness();
    const result = exportAudio(h.host, 'kokoro', jobs, () => {}, h.createEncoder);
    h.emit({ type: 'status', engine: 'kokoro', status: 'error', error: 'Kokoro falhou' });
    await expect(result).rejects.toThrow('Kokoro falhou');
    expect(h.synths()).toHaveLength(0);
    expect(h.listeners.size).toBe(0);
  });

  it('ignores status events of another engine while loading', async () => {
    const h = harness();
    const onProgress = vi.fn();
    const result = exportAudio(h.host, 'kokoro', jobs.slice(0, 1), onProgress, h.createEncoder);
    h.emit({ type: 'status', engine: 'supertonic', status: 'error', error: 'x' });
    h.ready();
    h.finishCurrent();
    expect((await result).type).toBe('audio/mpeg');
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(h.listeners.size).toBe(0);
  });

  it('rejects on a synthesis error and sends no further job', async () => {
    const h = harness();
    const result = exportAudio(h.host, 'kokoro', jobs, () => {}, h.createEncoder);
    h.ready();
    h.finishCurrent();
    h.emit({ type: 'error', requestId: h.synths()[1]!.requestId, message: 'Falha na síntese' });
    await expect(result).rejects.toThrow('Falha na síntese');
    h.ready();
    expect(h.synths()).toHaveLength(2);
    expect(h.listeners.size).toBe(0);
  });

  it('ignores events from older requests and repeated ready', async () => {
    const h = harness();
    const onProgress = vi.fn();
    void exportAudio(h.host, 'kokoro', jobs, onProgress, h.createEncoder);
    h.ready();
    const first = h.synths()[0]!.requestId;
    h.finishCurrent();
    h.ready();
    h.emit({ type: 'audio', requestId: first, pcm: new Float32Array([1]), sampleRate: 24000 });
    h.emit({ type: 'audio-end', requestId: first });
    h.emit({ type: 'error', requestId: first, message: 'velho' });
    h.emit({ type: 'audio', requestId: 'other', pcm: new Float32Array([1]), sampleRate: 24000 });
    expect(h.synths()).toHaveLength(2);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(h.encoded).toHaveLength(1);
  });

  it('rejects when there is nothing to export', async () => {
    await expect(exportAudio(harness().host, 'kokoro', [], () => {})).rejects.toThrow(
      'Nada para exportar',
    );

    const h = harness();
    const result = exportAudio(h.host, 'kokoro', jobs.slice(0, 1), () => {}, h.createEncoder);
    h.ready();
    h.emit({ type: 'audio-end', requestId: h.synths()[0]!.requestId });
    await expect(result).rejects.toThrow('Nada para exportar');
  });
});
