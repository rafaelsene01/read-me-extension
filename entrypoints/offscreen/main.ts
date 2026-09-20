import { AudioPlayer } from '../../lib/audio/player';
import { serveTranslations, TRANSLATE_CHANNEL } from '../../lib/translate';
import { isLocalTtsCommand, sendLocalTts, type LocalTtsCommand, type LocalTtsEventBody } from '../../lib/tts/protocol';
import type { LocalEngineId } from '../../lib/tts/types';
import type { WorkerCommand, WorkerEvent } from '../../lib/tts/worker-protocol';
// Explicit ?worker&url: WXT rewrites import.meta.url, so Vite would not detect
// the `new Worker(new URL(...))` pattern and never emit the worker.
import ttsWorkerUrl from './tts-worker.ts?worker&url';

/** Idle this long (nothing playing or pending) and the document closes, freeing the model. */
const IDLE_CLOSE_MS = 5 * 60_000;

/**
 * Starts the inference host. Normally our own dedicated worker, which imports
 * the runtimes directly — never the ONNX Runtime proxy worker, which cannot
 * carry WebGPU buffers. Under `wxt dev` this page is served from the Vite dev
 * server, and Chrome refuses a worker script from that other origin: the host
 * then runs in this document instead (dev only; audio may stutter while a
 * sentence is generated).
 */
function startInference(onEvent: (event: WorkerEvent) => void): (command: WorkerCommand) => void {
  try {
    const worker = new Worker(ttsWorkerUrl, { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerEvent>) => onEvent(event.data);
    worker.onerror = (event) => failLoad(`Falha ao iniciar o motor neural: ${event.message}`);
    return (command) => worker.postMessage(command);
  } catch (err) {
    if (!import.meta.env.DEV) return () => failLoad(`Falha ao iniciar o motor neural: ${String(err)}`);
    console.warn('[ReadMe] Worker recusado, inferência no documento offscreen', err);
    const host = import('../../lib/tts/local/host').then(({ createTtsHost }) => createTtsHost(onEvent));
    return (command) => {
      host.then((handle) => handle(command)).catch((error: unknown) => failLoad(String(error)));
    };
  }
}

/** Reports a broken inference host as a load error of the engine being loaded. */
function failLoad(error: string): void {
  if (!loadedEngine) return;
  onWorkerEvent({ type: 'status', engine: loadedEngine, status: 'error', error });
}

const player = new AudioPlayer({
  onStarted: (requestId) => sendLocalTts({ type: 'started', requestId }),
  onEnded: (requestId) => {
    if (requestId === currentRequestId) currentRequestId = null;
    sendLocalTts({ type: 'ended', requestId });
    armIdleClose();
  },
});

/** One engine at a time: loading another unloads the previous one in the worker. */
let loadedEngine: LocalEngineId | null = null;
let currentRequestId: string | null = null;
/** Speed each request was synthesized at, so playback can correct it live. */
const synthRates = new Map<string, number>();
/** A model is downloading/initializing: never close under it. */
let loading = false;
/** Last status/backend per engine, replayed when a restarted service worker asks again. */
const lastEvents = new Map<LocalEngineId, LocalTtsEventBody[]>();

let idleTimer: ReturnType<typeof setTimeout> | undefined;
function armIdleClose(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (currentRequestId === null && !loading) window.close();
  }, IDLE_CLOSE_MS);
}

function relay(event: LocalTtsEventBody & { engine: LocalEngineId }): void {
  const kept = (lastEvents.get(event.engine) ?? []).filter((previous) => previous.type !== event.type);
  lastEvents.set(event.engine, [...kept, event]);
  sendLocalTts(event);
}

function onWorkerEvent(message: WorkerEvent): void {
  switch (message.type) {
    case 'status': {
      const { type, engine, status, progress, error } = message;
      loading = status === 'downloading' || status === 'loading';
      if (!loading) armIdleClose();
      relay({ type, engine, status, ...(progress !== undefined ? { progress } : {}), ...(error ? { error } : {}) });
      if (status === 'error') {
        // Let the next ensure-ready try again from scratch.
        loadedEngine = null;
        player.stop();
      }
      break;
    }
    case 'backend':
      relay(message);
      break;
    case 'audio':
      if (message.requestId !== currentRequestId) return;
      player.enqueue({ ...message, rate: synthRates.get(message.requestId) ?? 1 });
      break;
    case 'audio-end':
      if (message.requestId !== currentRequestId) return;
      player.markEnded(message.requestId);
      break;
    case 'error':
      if (message.requestId !== currentRequestId) return;
      currentRequestId = null;
      player.stop();
      sendLocalTts(message);
      break;
  }
}

const post = startInference(onWorkerEvent);

function handleCommand(command: LocalTtsCommand): void {
  armIdleClose();
  switch (command.type) {
    case 'ensure-ready': {
      if (loadedEngine === command.engine) {
        for (const event of lastEvents.get(command.engine) ?? []) sendLocalTts(event);
        return;
      }
      currentRequestId = null;
      player.stop();
      loadedEngine = command.engine;
      post({ type: 'load', engine: command.engine });
      break;
    }
    case 'speak': {
      currentRequestId = command.requestId;
      player.stop();
      synthRates.clear();
      synthRates.set(command.requestId, command.options.rate);
      player.setRate(command.options.rate);
      post({ type: 'synthesize', requestId: command.requestId, text: command.text, options: command.options });
      break;
    }
    case 'stop': {
      if (command.requestId === undefined || command.requestId === currentRequestId) currentRequestId = null;
      post({ type: 'stop', ...(command.requestId ? { requestId: command.requestId } : {}) });
      player.stop(command.requestId);
      break;
    }
    case 'set-rate':
      player.setRate(command.rate);
      break;
    case 'dispose': {
      currentRequestId = null;
      loadedEngine = null;
      lastEvents.clear();
      player.stop();
      post({ type: 'unload' });
      break;
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isLocalTtsCommand(message)) return false;
  handleCommand(message);
  return false;
});

serveTranslations();

// A translated reading with the system voice only talks to this document through
// translation requests: keep it open while they arrive. serveTranslations answers.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if ((message as { channel?: unknown } | null)?.channel === TRANSLATE_CHANNEL) armIdleClose();
  return false;
});
