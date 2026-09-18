import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_TYPES, broadcastState, isCommand, onCommand } from './messages';
import type { PlaybackState } from './types';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => unknown;

function stubRuntime(sendMessage = vi.fn().mockResolvedValue(undefined)) {
  const listeners: Listener[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      onMessage: { addListener: (fn: Listener) => listeners.push(fn) },
    },
  });
  return { listeners, sendMessage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Command contract', () => {
  it('covers play, pause, stop, seek, setRate, setVoice, capture and state', () => {
    expect([...COMMAND_TYPES]).toEqual([
      'play',
      'pause',
      'stop',
      'seek',
      'setRate',
      'setVoice',
      'capture',
      'state',
    ]);
    for (const type of COMMAND_TYPES) expect(isCommand({ type })).toBe(true);
  });
});

describe('onCommand', () => {
  it('passes a known command to the handler', async () => {
    const { listeners } = stubRuntime();
    const handler = vi.fn();
    onCommand(handler);

    listeners[0]!({ type: 'setRate', rate: 1.5 }, {}, () => {});

    expect(handler).toHaveBeenCalledWith({ type: 'setRate', rate: 1.5 });
  });

  it('ignores a message of unknown shape without throwing', () => {
    const { listeners } = stubRuntime();
    const handler = vi.fn();
    onCommand(handler);

    expect(listeners[0]!({ type: 'somethingElse' }, {}, () => {})).toBe(false);
    expect(listeners[0]!('not an object', {}, () => {})).toBe(false);
    expect(listeners[0]!(null, {}, () => {})).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('broadcastState', () => {
  const state: PlaybackState = {
    playing: true,
    cursor: { blockId: 'a', paraIndex: 0, sentIndex: 2 },
    error: null,
  };

  it('sends the playback state to the panel', async () => {
    const { sendMessage } = stubRuntime();

    await broadcastState(state);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'playbackState', state });
  });

  it('resolves instead of rejecting when no panel is open to receive it', async () => {
    stubRuntime(vi.fn().mockRejectedValue(new Error('Could not establish connection')));

    await expect(broadcastState(state)).resolves.toBeUndefined();
  });
});
