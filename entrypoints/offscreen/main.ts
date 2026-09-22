import { AudioPlayer } from '../../lib/audio/player';
import { serveTranslations, TRANSLATE_CHANNEL } from '../../lib/translate';
import { isLocalTtsCommand, sendLocalTts, type LocalTtsCommand, type LocalTtsEventBody } from '../../lib/tts/protocol';
import type { LocalEngineId, TtsSynthesisOptions } from '../../lib/tts/types';
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

/** When the last sentence stopped sounding, to measure the silence after it. */
let silentSince: number | null = null;

const player = new AudioPlayer({
  onStarted: (playerId) => {
    // Dev metrics, local console only: the silence heard between sentences and
    // how many are stacked up ready. A gap with nothing stacked means the model
    // cannot generate faster than it speaks.
    if (silentSince !== null) {
      console.debug('[ReadMe] tts gap', {
        silenceMs: Math.round(performance.now() - silentSince),
        readAhead: queued.size - 1,
        generating: prefetched.size,
      });
      silentSince = null;
    }
    emitStarted(playerId);
  },
  onEnded: (playerId) => {
    silentSince = performance.now();
    queued.delete(playerId);
    emitEnded(playerId);
    armIdleClose();
  },
});

/** One engine at a time: loading another unloads the previous one in the worker. */
let loadedEngine: LocalEngineId | null = null;
/** The sentence being synthesized right now, when it was not read ahead. */
let currentRequestId: string | null = null;
/** Speed that synthesis was asked for, so playback can correct it live. */
let liveRate = 1;
/** A model is downloading/initializing: never close under it. */
let loading = false;
/** Last status/backend per engine, replayed when a restarted service worker asks again. */
const lastEvents = new Map<LocalEngineId, LocalTtsEventBody[]>();

interface Prefetched {
  chunks: { pcm: Float32Array<ArrayBuffer>; sampleRate: number }[];
  /** Speed it is being synthesized at; playback corrects it to the current one. */
  rate: number;
  /** The worker reported it fully synthesized. */
  done: boolean;
}
/** Sentences being read ahead, by cache key, until their audio is complete. */
const prefetched = new Map<string, Prefetched>();
/** Enough for the engine's lookahead plus a speed change; oldest goes first. */
const MAX_PREFETCH = 8;

/**
 * Sentences handed to the player, by the id it knows them under: the cache key
 * for one read ahead, the requestId for one synthesized on demand. A sentence
 * read ahead reaches the player before the background asks for it, so it is
 * married to a requestId when the speak arrives, and its events are reported
 * under that.
 */
const queued = new Set<string>();
const adopted = new Map<string, string>();
/** Playback that began (or ended) before the background asked for that sentence. */
const startedEarly = new Set<string>();
const endedEarly = new Set<string>();

/** Same utterance under the same voice and speed produces the same audio. */
function cacheKey(text: string, options: TtsSynthesisOptions): string {
  return JSON.stringify([text, options.lang, options.rate, options.voiceId]);
}

/** Drops everything read ahead: the reading no longer goes that way. */
function clearAhead(): void {
  prefetched.clear();
  queued.clear();
  adopted.clear();
  startedEarly.clear();
  endedEarly.clear();
}

function emitStarted(playerId: string): void {
  const requestId = adopted.get(playerId);
  if (requestId === undefined) startedEarly.add(playerId);
  else sendLocalTts({ type: 'started', requestId });
}

function emitEnded(playerId: string): void {
  if (playerId === currentRequestId) currentRequestId = null;
  const requestId = adopted.get(playerId);
  if (requestId === undefined) {
    endedEarly.add(playerId);
    return;
  }
  adopted.delete(playerId);
  sendLocalTts({ type: 'ended', requestId });
}

/** The background asked for a sentence the player already has: same audio, now named. */
function adopt(playerId: string, requestId: string): void {
  adopted.set(playerId, requestId);
  if (startedEarly.delete(playerId)) sendLocalTts({ type: 'started', requestId });
  if (endedEarly.delete(playerId)) {
    adopted.delete(playerId);
    sendLocalTts({ type: 'ended', requestId });
  }
}

/**
 * Queues a sentence read ahead right behind the one playing, without waiting
 * for the background to ask for it: that round trip is what was heard as a
 * pause between sentences. The worker synthesizes in the order it was asked,
 * so sentences are handed over in reading order.
 */
function handOver(key: string, entry: Prefetched): void {
  prefetched.delete(key);
  queued.add(key);
  for (const chunk of entry.chunks) player.enqueue({ requestId: key, ...chunk, rate: entry.rate });
  if (entry.done) player.markEnded(key);
  // Still being generated: the rest of it arrives as the live synthesis does.
  else currentRequestId = key;
}

let idleTimer: ReturnType<typeof setTimeout> | undefined;
function armIdleClose(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (currentRequestId === null && queued.size === 0 && !loading) window.close();
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
        clearAhead();
      }
      break;
    }
    case 'backend':
      relay(message);
      break;
    case 'audio':
      if (message.requestId === currentRequestId) {
        player.enqueue({ ...message, rate: liveRate });
        return;
      }
      prefetched.get(message.requestId)?.chunks.push({ pcm: message.pcm, sampleRate: message.sampleRate });
      break;
    case 'audio-end': {
      if (message.requestId === currentRequestId) {
        player.markEnded(message.requestId);
        return;
      }
      const entry = prefetched.get(message.requestId);
      if (entry) handOver(message.requestId, { ...entry, done: true });
      break;
    }
    case 'error':
      // A sentence read ahead that failed is forgotten: it is synthesized
      // again when the reading reaches it, and reports the error then.
      if (prefetched.delete(message.requestId)) return;
      if (message.requestId !== currentRequestId) return;
      currentRequestId = null;
      player.stop();
      clearAhead();
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
      clearAhead();
      loadedEngine = command.engine;
      post({ type: 'load', engine: command.engine });
      break;
    }
    case 'speak': {
      const key = cacheKey(command.text, command.options);
      // Already playing (or played) straight from the read-ahead queue: there
      // is nothing to start, only a name to give it.
      if (queued.has(key) || endedEarly.has(key)) {
        adopt(key, command.requestId);
        break;
      }
      const ready = prefetched.get(key);
      if (ready) {
        // Read ahead, but the worker has not finished it: what exists plays
        // now and the rest follows it into the player.
        liveRate = ready.rate;
        handOver(key, ready);
        adopt(key, command.requestId);
        break;
      }
      // Nothing ready for this position: start over, dropping audio read ahead
      // for the sentences that followed another one.
      player.stop();
      clearAhead();
      // Frees the worker from the sentences it was reading ahead of the old
      // position before it takes this one.
      post({ type: 'stop' });
      currentRequestId = command.requestId;
      liveRate = command.options.rate;
      player.setRate(command.options.rate);
      queued.add(command.requestId);
      adopted.set(command.requestId, command.requestId);
      post({ type: 'synthesize', requestId: command.requestId, text: command.text, options: command.options });
      break;
    }
    case 'prefetch': {
      for (const item of command.items) {
        const key = cacheKey(item.text, item.options);
        if (prefetched.has(key) || queued.has(key)) continue;
        const oldest = prefetched.size >= MAX_PREFETCH ? prefetched.keys().next().value : undefined;
        if (oldest !== undefined) prefetched.delete(oldest);
        prefetched.set(key, { chunks: [], rate: item.options.rate, done: false });
        post({ type: 'prefetch', key, text: item.text, options: item.options });
      }
      break;
    }
    case 'stop': {
      // Pause, seek or engine switch: everything read ahead belongs to the
      // position the reader just left.
      currentRequestId = null;
      player.stop();
      clearAhead();
      // Everything, not just the sentence named: the worker is also reading
      // ahead of it, and those sentences no longer come next.
      post({ type: 'stop' });
      break;
    }
    case 'set-rate':
      liveRate = command.rate;
      player.setRate(command.rate);
      break;
    case 'dispose': {
      currentRequestId = null;
      loadedEngine = null;
      lastEvents.clear();
      player.stop();
      clearAhead();
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
