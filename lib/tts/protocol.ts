import type { LocalEngineId, ModelStatus, TtsBackend, TtsSynthesisOptions } from './types';

/**
 * Channel tag that keeps local-TTS traffic apart from the commands the side
 * panel sends. Every message in either direction carries it.
 */
export const LOCAL_TTS_CHANNEL = 'local-tts' as const;

type Channel = { channel: typeof LOCAL_TTS_CHANNEL };

/** Background → offscreen document. */
export type LocalTtsCommandBody =
  | { type: 'ensure-ready'; engine: LocalEngineId }
  | { type: 'speak'; requestId: string; text: string; options: TtsSynthesisOptions }
  | { type: 'stop'; requestId?: string }
  | { type: 'set-rate'; rate: number }
  | { type: 'dispose' };

/** Offscreen document → background. */
export type LocalTtsEventBody =
  | { type: 'status'; engine: LocalEngineId; status: ModelStatus; progress?: number; error?: string }
  | { type: 'backend'; engine: LocalEngineId; backend: TtsBackend }
  | { type: 'started'; requestId: string }
  | { type: 'ended'; requestId: string }
  | { type: 'error'; requestId: string; message: string };

export type LocalTtsCommand = LocalTtsCommandBody & Channel;
export type LocalTtsEvent = LocalTtsEventBody & Channel;

const EVENT_TYPES = ['status', 'backend', 'started', 'ended', 'error'];

function onChannel(value: unknown): value is { type: string } {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { channel?: unknown; type?: unknown };
  return message.channel === LOCAL_TTS_CHANNEL && typeof message.type === 'string';
}

export function isLocalTtsCommand(value: unknown): value is LocalTtsCommand {
  return onChannel(value) && !EVENT_TYPES.includes(value.type);
}

export function isLocalTtsEvent(value: unknown): value is LocalTtsEvent {
  return onChannel(value) && EVENT_TYPES.includes(value.type);
}

/** runtime.sendMessage rejects when nobody listens (offscreen closed, panel shut); that is fine. */
export function sendLocalTts(message: LocalTtsCommandBody | LocalTtsEventBody): void {
  chrome.runtime.sendMessage({ channel: LOCAL_TTS_CHANNEL, ...message }).catch(() => {});
}
