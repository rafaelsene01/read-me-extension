import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSystemTts } from './system';
import type { TtsEvent } from '../engine';

interface SpeakCall {
  text: string;
  options: chrome.tts.TtsOptions;
}

function stubChromeTts() {
  const calls: SpeakCall[] = [];
  const speak = vi.fn((text: string, options: chrome.tts.TtsOptions) => {
    calls.push({ text, options });
  });
  const stop = vi.fn();
  vi.stubGlobal('chrome', { tts: { speak, stop } });
  return { calls, speak, stop };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSystemTts', () => {
  it('speaks through chrome.tts without enqueueing', async () => {
    const { calls } = stubChromeTts();
    const tts = createSystemTts(() => {});

    await tts.speak('Olá.', { lang: 'pt-BR', rate: 1.5, voiceName: 'Luciana' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toBe('Olá.');
    expect(calls[0]!.options).toMatchObject({
      lang: 'pt-BR',
      rate: 1.5,
      voiceName: 'Luciana',
      enqueue: false,
    });
  });

  it('forwards chrome.tts events to the registered handler', async () => {
    stubChromeTts();
    const events: TtsEvent[] = [];
    const tts = createSystemTts((event) => events.push(event));

    await tts.speak('Olá.', { lang: 'pt-BR', rate: 1 });
    // Reach the callback through the recorded chrome.tts options.
    const options = (chrome.tts.speak as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      onEvent: (event: TtsEvent) => void;
    };
    options.onEvent({ type: 'end' });

    expect(events).toEqual([{ type: 'end' }]);
  });

  it('stops through chrome.tts', () => {
    const { stop } = stubChromeTts();
    const tts = createSystemTts(() => {});

    void tts.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
