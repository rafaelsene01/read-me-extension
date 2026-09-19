import type { EngineTts, TtsEvent } from '../engine';
import { ensureOffscreen } from './offscreen';
import { sendLocalTts, type LocalTtsCommandBody, type LocalTtsEvent } from './protocol';
import { getEngineDefinition } from './registry';
import type { LocalEngineId, TtsEngineId, TtsRuntimeStatus } from './types';

export interface LocalTtsClientDeps {
  /** Same event sink the system adapter uses (end/error). */
  onEvent: (event: TtsEvent) => void;
  /** A model status changed; the background republishes its state. */
  onStatus: () => void;
  getSelectedEngine: () => Promise<TtsEngineId>;
  /** Voice id to read `lang` with, or undefined when the engine cannot read it. */
  getVoice: (engine: LocalEngineId, lang: string) => Promise<string | undefined>;
  /** Injectable for tests. */
  ensureOffscreen?: () => Promise<boolean>;
  send?: (command: LocalTtsCommandBody) => void;
  newRequestId?: () => string;
  /** How often ensure-ready is resent until the offscreen document answers. */
  retryMs?: number;
}

/** Resends before giving up: a document still booting can miss the first message. */
const MAX_LOAD_ATTEMPTS = 15;

export interface LocalTtsClient extends EngineTts {
  handleEvent(event: LocalTtsEvent): void;
  getStatus(engine: LocalEngineId): TtsRuntimeStatus | undefined;
  /** Stops and frees the loaded model (used when switching to the system voice). */
  dispose(): void;
  /** Downloads (if needed) and loads a model without speaking; progress arrives as status events. */
  prepare(engine: LocalEngineId): Promise<void>;
}

interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * EngineTts implementation that drives the offscreen document. speak()
 * resolves once playback of the request actually started; completion arrives
 * later through the same onEvent('end') path chrome.tts uses. Every speak has
 * a fresh requestId, and only events of the current one reach the engine, so
 * stale audio from a seek/stop/engine switch never advances the cursor.
 */
export function createLocalTtsClient(deps: LocalTtsClientDeps): LocalTtsClient {
  const send = deps.send ?? sendLocalTts;
  const openOffscreen = deps.ensureOffscreen ?? ensureOffscreen;
  const newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());

  const statuses = new Map<LocalEngineId, TtsRuntimeStatus>();
  const readyWaiters = new Map<LocalEngineId, Waiter[]>();
  const startWaiters = new Map<string, Waiter>();
  let currentRequestId: string | null = null;
  let generating = false;
  const retryMs = deps.retryMs ?? 1_000;
  /** Engines that sent at least one status since their last load request. */
  const answered = new Set<LocalEngineId>();

  /**
   * Asks the offscreen document to load `engine`, showing 'loading' right away
   * so the panel reacts to the click. Resent until any status of the engine
   * comes back; silence means the document or its worker failed to start.
   */
  function requestLoad(engine: LocalEngineId): void {
    statuses.set(engine, { engine, status: 'loading', backend: null });
    deps.onStatus();
    answered.delete(engine);
    let attempts = 0;
    const attempt = () => {
      if (answered.has(engine) || !readyWaiters.has(engine)) return;
      if (++attempts > MAX_LOAD_ATTEMPTS) {
        handleStatus(engine, 'error', undefined, 'O motor neural não respondeu. Recarregue a extensão.');
        return;
      }
      send({ type: 'ensure-ready', engine });
      setTimeout(attempt, retryMs);
    };
    attempt();
  }

  function setGenerating(value: boolean): void {
    if (generating === value) return;
    generating = value;
    deps.onStatus();
  }

  async function ensureReady(engine: LocalEngineId): Promise<void> {
    let created: boolean;
    try {
      created = await openOffscreen();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      handleStatus(engine, 'error', undefined, `Não foi possível abrir o motor neural (${reason})`);
      throw err;
    }
    // A fresh document has nothing loaded, whatever we remember.
    if (created) statuses.clear();
    const status = statuses.get(engine)?.status;
    if (status === 'ready') return;
    const ready = new Promise<void>((resolve, reject) => {
      readyWaiters.set(engine, [...(readyWaiters.get(engine) ?? []), { resolve, reject }]);
    });
    if (status !== 'downloading' && status !== 'loading') requestLoad(engine);
    await ready;
  }

  function handleStatus(
    engine: LocalEngineId,
    status: TtsRuntimeStatus['status'],
    progress?: number,
    error?: string,
  ): void {
    statuses.set(engine, {
      engine,
      status,
      backend: statuses.get(engine)?.backend ?? null,
      ...(progress !== undefined ? { progress } : {}),
      ...(error !== undefined ? { error } : {}),
    });
    if (status === 'ready') settleReady(engine);
    if (status === 'error') settleReady(engine, error ?? 'Falha ao carregar o modelo');
    deps.onStatus();
  }

  function settleReady(engine: LocalEngineId, error?: string): void {
    const waiters = readyWaiters.get(engine) ?? [];
    readyWaiters.delete(engine);
    for (const waiter of waiters) {
      if (error === undefined) waiter.resolve();
      else waiter.reject(new Error(error));
    }
  }

  return {
    async speak(text, options) {
      const engine = await deps.getSelectedEngine();
      if (engine === 'system') throw new Error('Motor local não selecionado');
      const label = getEngineDefinition(engine).label;
      const voiceId = await deps.getVoice(engine, options.lang);
      if (!voiceId) throw new Error(`${label} não tem voz para o idioma ${options.lang}`);

      const requestId = newRequestId();
      currentRequestId = requestId;
      await ensureReady(engine);
      // Stopped (pause, seek, engine switch) while the model was loading.
      if (currentRequestId !== requestId) return;

      const started = new Promise<void>((resolve, reject) => {
        startWaiters.set(requestId, { resolve, reject });
      });
      setGenerating(true);
      send({ type: 'speak', requestId, text, options: { lang: options.lang, rate: options.rate, voiceId } });
      await started;
    },

    stop() {
      const requestId = currentRequestId;
      currentRequestId = null;
      if (requestId) {
        send({ type: 'stop', requestId });
        // Mirrors chrome.tts: stopping an utterance in flight reports 'interrupted',
        // which the engine expects after its own pause/seek/stop.
        deps.onEvent({ type: 'interrupted' });
      }
      // A stopped speak resolves silently: pause/seek must not surface as an error.
      for (const waiter of startWaiters.values()) waiter.resolve();
      startWaiters.clear();
      setGenerating(false);
    },

    setRate(rate) {
      // Already-generated audio is sped up in place; the next sentences are
      // synthesized at the new rate (it comes from prefs).
      if (currentRequestId) send({ type: 'set-rate', rate });
      return true;
    },

    prepare(engine) {
      // A failure is already reported through the 'error' status.
      return ensureReady(engine).catch(() => {});
    },

    dispose() {
      currentRequestId = null;
      statuses.clear();
      send({ type: 'dispose' });
      deps.onStatus();
    },

    handleEvent(event) {
      switch (event.type) {
        case 'status':
          answered.add(event.engine);
          handleStatus(event.engine, event.status, event.progress, event.error);
          return;
        case 'backend': {
          answered.add(event.engine);
          const previous = statuses.get(event.engine);
          statuses.set(event.engine, {
            engine: event.engine,
            status: previous?.status ?? 'loading',
            backend: event.backend,
          });
          deps.onStatus();
          return;
        }
        case 'started': {
          startWaiters.get(event.requestId)?.resolve();
          startWaiters.delete(event.requestId);
          if (event.requestId === currentRequestId) setGenerating(false);
          return;
        }
        case 'ended': {
          if (event.requestId !== currentRequestId) return;
          currentRequestId = null;
          deps.onEvent({ type: 'end' });
          return;
        }
        case 'error': {
          if (event.requestId !== currentRequestId) return;
          currentRequestId = null;
          setGenerating(false);
          const waiter = startWaiters.get(event.requestId);
          startWaiters.delete(event.requestId);
          // Before playback started the pending speak() carries the error;
          // afterwards it arrives like a chrome.tts error event. Never both.
          if (waiter) waiter.reject(new Error(event.message));
          else deps.onEvent({ type: 'error', errorMessage: event.message });
          return;
        }
      }
    },

    getStatus(engine) {
      const status = statuses.get(engine);
      if (!status) return undefined;
      return generating ? { ...status, generating } : status;
    },
  };
}
