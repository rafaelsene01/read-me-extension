import { describe, expect, it, vi } from 'vitest';
import type { TtsEvent } from '../engine';
import { createLocalTtsClient } from './client';
import { LOCAL_TTS_CHANNEL, type LocalTtsCommandBody, type LocalTtsEventBody } from './protocol';
import type { TtsEngineId } from './types';

function harness({
  engine = 'kokoro' as TtsEngineId,
  voice = 'pf_dora' as string | null,
  retryMs = 60_000,
} = {}) {
  const sent: LocalTtsCommandBody[] = [];
  const events: TtsEvent[] = [];
  let ids = 0;
  const ensureOffscreen = vi.fn(async () => false);
  const client = createLocalTtsClient({
    onEvent: (event) => events.push(event),
    onStatus: () => {},
    getSelectedEngine: async () => engine,
    getVoice: async () => voice ?? undefined,
    ensureOffscreen,
    send: (command) => sent.push(command),
    newRequestId: () => `r${++ids}`,
    retryMs,
  });
  const emit = (event: LocalTtsEventBody) => client.handleEvent({ channel: LOCAL_TTS_CHANNEL, ...event });
  const ready = () => emit({ type: 'status', engine: 'kokoro', status: 'ready' });
  /** Lets pending promise chains (ensureReady, speak) advance. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { client, sent, events, emit, ready, flush, ensureOffscreen };
}

describe('createLocalTtsClient', () => {
  it('loads the model once, then speaks with the resolved voice and resolves on start', async () => {
    const h = harness();
    const speaking = h.client.speak('Olá.', { lang: 'pt-BR', rate: 1.2 });
    await h.flush();
    expect(h.sent).toEqual([{ type: 'ensure-ready', engine: 'kokoro' }]);

    h.ready();
    await h.flush();
    expect(h.sent[1]).toEqual({
      type: 'speak',
      requestId: 'r1',
      text: 'Olá.',
      options: { lang: 'pt-BR', rate: 1.2, voiceId: 'pf_dora' },
    });
    expect(h.client.getStatus('kokoro')?.generating).toBe(true);

    h.emit({ type: 'started', requestId: 'r1' });
    await speaking;
    expect(h.client.getStatus('kokoro')?.generating).toBeUndefined();

    h.emit({ type: 'ended', requestId: 'r1' });
    expect(h.events).toEqual([{ type: 'end' }]);

    // Second sentence: already ready, no new ensure-ready.
    void h.client.speak('Tudo bem?', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    expect(h.sent.filter((command) => command.type === 'ensure-ready')).toHaveLength(1);
  });

  it('ignores events of a stale request (seek/stop/engine switch)', async () => {
    const h = harness();
    h.ready();
    const first = h.client.speak('Um.', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    h.client.stop();
    await first;
    void h.client.speak('Dois.', { lang: 'pt-BR', rate: 1 });
    await h.flush();

    h.emit({ type: 'ended', requestId: 'r1' });
    h.emit({ type: 'error', requestId: 'r1', message: 'velho' });
    // Only the interrupted of the stop reached the engine.
    expect(h.events).toEqual([{ type: 'interrupted' }]);

    h.emit({ type: 'started', requestId: 'r2' });
    h.emit({ type: 'ended', requestId: 'r2' });
    expect(h.events).toEqual([{ type: 'interrupted' }, { type: 'end' }]);
  });

  it('stop() cancels the request in the offscreen and reports interrupted', async () => {
    const h = harness();
    h.ready();
    const speaking = h.client.speak('Olá.', { lang: 'pt-BR', rate: 1 });
    await h.flush();

    h.client.stop();

    await expect(speaking).resolves.toBeUndefined();
    expect(h.sent.at(-1)).toEqual({ type: 'stop', requestId: 'r1' });
    expect(h.events).toEqual([{ type: 'interrupted' }]);
  });

  it('never speaks a sentence stopped while the model was loading', async () => {
    const h = harness();
    const speaking = h.client.speak('Olá.', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    h.client.stop();
    h.ready();
    await speaking;

    expect(h.sent.some((command) => command.type === 'speak')).toBe(false);
  });

  it('rejects speak() with the load error, without a duplicate error event', async () => {
    const h = harness();
    const speaking = h.client.speak('Olá.', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    h.emit({ type: 'status', engine: 'kokoro', status: 'error', error: 'Kokoro não pôde ser executado' });

    await expect(speaking).rejects.toThrow('Kokoro não pôde ser executado');
    expect(h.client.getStatus('kokoro')?.status).toBe('error');
  });

  it('a synthesis error before playback rejects speak(); after playback it is an error event', async () => {
    const h = harness();
    h.ready();
    const first = h.client.speak('Um.', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    h.emit({ type: 'error', requestId: 'r1', message: 'falhou' });
    await expect(first).rejects.toThrow('falhou');
    expect(h.events).toEqual([]);

    const second = h.client.speak('Dois.', { lang: 'pt-BR', rate: 1 });
    await h.flush();
    h.emit({ type: 'started', requestId: 'r2' });
    await second;
    h.emit({ type: 'error', requestId: 'r2', message: 'caiu' });
    expect(h.events).toEqual([{ type: 'error', errorMessage: 'caiu' }]);
  });

  it('refuses a language the engine has no voice for', async () => {
    const h = harness({ voice: null });

    await expect(h.client.speak('Hola.', { lang: 'es', rate: 1 })).rejects.toThrow('Kokoro 82M não tem voz');
    expect(h.sent).toEqual([]);
  });

  it('shows loading as soon as a download is requested', async () => {
    const h = harness();
    void h.client.prepare('kokoro');
    await h.flush();

    expect(h.client.getStatus('kokoro')?.status).toBe('loading');
  });

  it('resends ensure-ready until the offscreen answers, then gives up with an error', async () => {
    const h = harness({ retryMs: 1 });
    const speaking = h.client.speak('Olá.', { lang: 'pt-BR', rate: 1 });

    await expect(speaking).rejects.toThrow('não respondeu');
    expect(h.sent.filter((command) => command.type === 'ensure-ready').length).toBeGreaterThan(1);
    expect(h.client.getStatus('kokoro')?.status).toBe('error');
  });

  it('stops resending once the offscreen answers', async () => {
    const h = harness({ retryMs: 1 });
    void h.client.prepare('kokoro');
    await h.flush();
    h.emit({ type: 'status', engine: 'kokoro', status: 'downloading', progress: 0.1 });
    const sentAfterAnswer = h.sent.length;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.sent.length).toBe(sentAfterAnswer);
  });

  it('forgets model statuses when the offscreen document had to be recreated', async () => {
    const h = harness();
    h.ready();
    h.ensureOffscreen.mockResolvedValueOnce(true);

    void h.client.speak('Olá.', { lang: 'pt-BR', rate: 1 });
    await h.flush();

    expect(h.sent).toEqual([{ type: 'ensure-ready', engine: 'kokoro' }]);
  });
});
