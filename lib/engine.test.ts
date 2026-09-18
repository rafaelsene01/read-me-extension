import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from './engine';
import type { Engine, EngineStorage, SpeakOptions } from './engine';
import type { Block, Cursor, PlaybackState, Prefs } from './types';

function block(id: string, paragraphs: string[][], lang = 'pt-BR'): Block {
  return {
    id,
    sourceUrl: `https://example.com/${id}`,
    sourceTitle: id,
    lang,
    text: paragraphs.map((p) => p.join(' ')).join('\n'),
    paragraphs: paragraphs.map((sentences, p) => ({
      id: `${id}:p${p}`,
      sentences: sentences.map((text, s) => ({ id: `${id}:p${p}:s${s}`, text })),
    })),
    createdAt: 0,
  };
}

/** Two blocks, four sentences total: a0, a1, a2, b0. */
function sampleBlocks(): Block[] {
  return [block('a', [['a0.', 'a1.'], ['a2.']]), block('b', [['b0.']])];
}

interface SpeakCall {
  text: string;
  options: SpeakOptions;
  /** Cursor stored at the moment speak was called, proving persistence order. */
  cursorAtSpeak: Cursor | null;
}

function harness(blocks: Block[] = sampleBlocks()) {
  const store = {
    blocks,
    cursor: null as Cursor | null,
    prefs: {
      rate: 1.0,
      targetLang: 'pt-BR',
      voiceByLang: {} as Record<string, string>,
      activeTab: 'original',
    } as Prefs,
  };

  const speakCalls: SpeakCall[] = [];
  const stop = vi.fn();
  const states: PlaybackState[] = [];

  const storage: EngineStorage = {
    getBlocks: async () => store.blocks,
    getCursor: async () => store.cursor,
    setCursor: async (cursor) => {
      store.cursor = cursor;
    },
    getPrefs: async () => store.prefs,
    setPrefs: async (patch) => {
      store.prefs = { ...store.prefs, ...patch };
    },
  };

  const engine: Engine = createEngine({
    tts: {
      speak: (text, options) => {
        speakCalls.push({ text, options, cursorAtSpeak: store.cursor });
      },
      stop,
    },
    storage,
    broadcast: (state) => {
      states.push(state);
    },
  });

  return { engine, store, speakCalls, stop, states };
}

const cursorOf = (blockId: string, paraIndex: number, sentIndex: number): Cursor => ({
  blockId,
  paraIndex,
  sentIndex,
});

let h: ReturnType<typeof harness>;

beforeEach(() => {
  h = harness();
});

describe('play', () => {
  it('speaks exactly one sentence per speak call', async () => {
    await h.engine.play();

    expect(h.speakCalls).toHaveLength(1);
    expect(h.speakCalls[0]!.text).toBe('a0.');
  });

  it('persists the cursor before calling speak', async () => {
    await h.engine.play();

    expect(h.speakCalls[0]!.cursorAtSpeak).toEqual(cursorOf('a', 0, 0));
  });

  it('speaks with the language of the block being read', async () => {
    h.store.blocks = [block('a', [['Hello.']], 'en-US')];

    await h.engine.play();

    expect(h.speakCalls[0]!.options.lang).toBe('en-US');
  });

  it('does nothing and reports not playing when the buffer is empty', async () => {
    h.store.blocks = [];

    await h.engine.play();

    expect(h.speakCalls).toEqual([]);
    expect((await h.engine.getState()).playing).toBe(false);
  });
});

describe('advancing through the buffer', () => {
  it('moves the cursor to the next sentence and speaks it on end', async () => {
    await h.engine.play();

    await h.engine.onTtsEvent({ type: 'end' });

    expect(h.speakCalls.map((c) => c.text)).toEqual(['a0.', 'a1.']);
    expect(h.store.cursor).toEqual(cursorOf('a', 0, 1));
  });

  it('persists each cursor before speaking the sentence that follows', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });
    await h.engine.onTtsEvent({ type: 'end' });

    expect(h.speakCalls.map((c) => c.cursorAtSpeak)).toEqual([
      cursorOf('a', 0, 0),
      cursorOf('a', 0, 1),
      cursorOf('a', 1, 0),
    ]);
  });

  it('stops and returns the cursor to the first sentence at the end of the buffer', async () => {
    h.store.cursor = cursorOf('b', 0, 0);
    await h.engine.play();

    await h.engine.onTtsEvent({ type: 'end' });

    expect(await h.engine.getState()).toEqual({
      playing: false,
      cursor: cursorOf('a', 0, 0),
      error: null,
    });
  });
});

describe('pause, play and stop', () => {
  it('keeps the cursor on pause', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });

    await h.engine.pause();

    expect(h.stop).toHaveBeenCalled();
    expect(h.store.cursor).toEqual(cursorOf('a', 0, 1));
    expect((await h.engine.getState()).playing).toBe(false);
  });

  it('resumes from the same sentence on the next play', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });
    await h.engine.pause();

    await h.engine.play();

    expect(h.speakCalls.at(-1)!.text).toBe('a1.');
  });

  it('moves the cursor to the first sentence of the buffer on stop', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });

    await h.engine.stop();

    expect(h.store.cursor).toEqual(cursorOf('a', 0, 0));
    expect((await h.engine.getState()).playing).toBe(false);
  });
});

describe('tts failures', () => {
  it('stops the queue, keeps the failing cursor and publishes the error message', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });

    await h.engine.onTtsEvent({ type: 'error', errorMessage: 'engine busy' });

    expect(await h.engine.getState()).toEqual({
      playing: false,
      cursor: cursorOf('a', 0, 1),
      error: 'engine busy',
    });
    expect(h.states.at(-1)!.error).toBe('engine busy');
  });

  it('reports an unsolicited interrupted event as an error', async () => {
    await h.engine.play();

    await h.engine.onTtsEvent({ type: 'interrupted' });

    const state = await h.engine.getState();
    expect(state.playing).toBe(false);
    expect(state.error).toBe('Falha na leitura');
  });

  it('ignores the interrupted event caused by our own pause', async () => {
    await h.engine.play();
    await h.engine.pause();

    await h.engine.onTtsEvent({ type: 'interrupted' });

    expect((await h.engine.getState()).error).toBeNull();
  });
});

describe('preferences', () => {
  it('persists the rate', async () => {
    await h.engine.setRate(1.75);

    expect(h.store.prefs.rate).toBe(1.75);
  });

  it('applies a new rate from the next sentence on, not the current one', async () => {
    await h.engine.play();

    await h.engine.setRate(2.0);
    await h.engine.onTtsEvent({ type: 'end' });

    expect(h.speakCalls.map((c) => c.options.rate)).toEqual([1.0, 2.0]);
  });

  it('persists a manual voice choice per language', async () => {
    await h.engine.setVoice('pt-BR', 'Luciana');

    expect(h.store.prefs.voiceByLang).toEqual({ 'pt-BR': 'Luciana' });
  });

  it('speaks with the manual voice stored for the block language', async () => {
    await h.engine.setVoice('pt-BR', 'Luciana');

    await h.engine.play();

    expect(h.speakCalls[0]!.options.voiceName).toBe('Luciana');
  });
});

describe('seek', () => {
  it('moves the cursor and continues from there while playing', async () => {
    await h.engine.play();

    await h.engine.seek(cursorOf('b', 0, 0));

    expect(h.store.cursor).toEqual(cursorOf('b', 0, 0));
    expect(h.speakCalls.at(-1)!.text).toBe('b0.');
  });

  it('moves the cursor without speaking while paused', async () => {
    await h.engine.seek(cursorOf('b', 0, 0));

    expect(h.store.cursor).toEqual(cursorOf('b', 0, 0));
    expect(h.speakCalls).toEqual([]);
  });
});

describe('buffer changes', () => {
  it('stops and reconciles the cursor when the block being read is removed', async () => {
    h.store.cursor = cursorOf('b', 0, 0);
    await h.engine.play();
    const spoken = h.speakCalls.length;

    h.store.blocks = [block('a', [['a0.', 'a1.'], ['a2.']])];
    await h.engine.blocksChanged();

    expect(h.stop).toHaveBeenCalled();
    expect(h.store.cursor).toEqual(cursorOf('a', 0, 0));
    expect((await h.engine.getState()).playing).toBe(false);
    expect(h.speakCalls).toHaveLength(spoken);
  });

  it('leaves a still valid cursor alone when another block is removed', async () => {
    await h.engine.play();

    h.store.blocks = [h.store.blocks[0]!];
    await h.engine.blocksChanged();

    expect(h.store.cursor).toEqual(cursorOf('a', 0, 0));
  });
});

describe('service worker restart', () => {
  it('rebuilds from storage and continues from the stored cursor on end', async () => {
    await h.engine.play();
    await h.engine.onTtsEvent({ type: 'end' });

    // A fresh engine over the same storage stands for the restarted worker.
    const revived = harness(h.store.blocks);
    revived.store.cursor = h.store.cursor;
    revived.store.prefs = h.store.prefs;

    await revived.engine.onTtsEvent({ type: 'end' });

    expect(revived.speakCalls.map((c) => c.text)).toEqual(['a2.']);
    expect((await revived.engine.getState()).playing).toBe(true);
  });
});

describe('active tab', () => {
  /** Block "a" translated into pt-BR, keeping its id so the cursor stays valid. */
  function translated(): Block[] {
    const [original] = sampleBlocks();
    if (!original) throw new Error('sample block missing');
    return [
      {
        ...original,
        lang: 'en',
        translation: {
          target: 'pt-BR',
          text: 'Traduzido zero. Traduzido um.',
          paragraphs: [
            {
              id: 'a#t:p0',
              sentences: [
                { id: 'a#t:p0:s0', text: 'Traduzido zero.' },
                { id: 'a#t:p0:s1', text: 'Traduzido um.' },
              ],
            },
          ],
          sourceTextHash: 'hash',
        },
      },
    ];
  }

  it('speaks the translation while the translation tab is active', async () => {
    const t = harness(translated());
    t.store.prefs = { ...t.store.prefs, activeTab: 'translation' };

    await t.engine.play();

    expect(t.speakCalls.map((c) => c.text)).toEqual(['Traduzido zero.']);
  });

  it('speaks the translation in the target language', async () => {
    const t = harness(translated());
    t.store.prefs = { ...t.store.prefs, activeTab: 'translation' };

    await t.engine.play();

    expect(t.speakCalls[0]?.options.lang).toBe('pt-BR');
  });

  it('speaks the original in its own language while the original tab is active', async () => {
    const t = harness(translated());

    await t.engine.play();

    expect(t.speakCalls[0]?.text).toBe('a0.');
    expect(t.speakCalls[0]?.options.lang).toBe('en');
  });

  it('keeps the original for a block that has no translation yet', async () => {
    const t = harness();
    t.store.prefs = { ...t.store.prefs, activeTab: 'translation' };

    await t.engine.play();

    expect(t.speakCalls[0]?.text).toBe('a0.');
    expect(t.speakCalls[0]?.options.lang).toBe('pt-BR');
  });
});

describe('oversized sentences', () => {
  /** 80000 characters of whole words: three chunks at the 32000 limit. */
  const LONG = 'palavra '.repeat(10_000).trim();

  function longHarness() {
    return harness([block('a', [[LONG, 'depois.']])]);
  }

  it('splits a sentence above the engine limit into several speak calls', async () => {
    const t = longHarness();

    await t.engine.play();
    await t.engine.onTtsEvent({ type: 'end' });
    await t.engine.onTtsEvent({ type: 'end' });

    expect(t.speakCalls).toHaveLength(3);
    expect(t.speakCalls.every((call) => call.text.length <= 32_000)).toBe(true);
    expect(t.speakCalls.map((call) => call.text).join(' ')).toBe(LONG);
  });

  it('advances the cursor only after the last chunk', async () => {
    const t = longHarness();

    await t.engine.play();
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 0));

    await t.engine.onTtsEvent({ type: 'end' });
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 0));

    await t.engine.onTtsEvent({ type: 'end' });
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 0));

    await t.engine.onTtsEvent({ type: 'end' });
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 1));
    expect(t.speakCalls[3]?.text).toBe('depois.');
  });

  it('keeps every chunk in the language and rate of its sentence', async () => {
    const t = longHarness();

    await t.engine.play();
    await t.engine.onTtsEvent({ type: 'end' });

    expect(t.speakCalls[1]?.options).toEqual(t.speakCalls[0]?.options);
  });

  it('pause between chunks stops without advancing the cursor', async () => {
    const t = longHarness();

    await t.engine.play();
    await t.engine.onTtsEvent({ type: 'end' });
    await t.engine.pause();
    await t.engine.onTtsEvent({ type: 'interrupted' });

    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(t.speakCalls).toHaveLength(2);
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 0));
    expect((await t.engine.getState()).playing).toBe(false);
  });

  it('stop between chunks returns the cursor to the first sentence', async () => {
    const t = longHarness();

    await t.engine.play();
    await t.engine.onTtsEvent({ type: 'end' });
    await t.engine.stop();
    await t.engine.onTtsEvent({ type: 'interrupted' });

    expect(t.speakCalls).toHaveLength(2);
    expect(t.store.cursor).toEqual(cursorOf('a', 0, 0));
    expect((await t.engine.getState()).playing).toBe(false);
  });

  it('play after a pause between chunks restarts the sentence from its first chunk', async () => {
    const t = longHarness();

    await t.engine.play();
    await t.engine.onTtsEvent({ type: 'end' });
    await t.engine.pause();
    await t.engine.onTtsEvent({ type: 'interrupted' });
    await t.engine.play();

    expect(t.speakCalls[2]?.text).toBe(t.speakCalls[0]?.text);
  });

  it('keeps one speak call and one cursor advance for a sentence within the limit', async () => {
    await h.engine.play();

    expect(h.speakCalls).toHaveLength(1);
    expect(h.speakCalls[0]?.text).toBe('a0.');
    expect(h.store.cursor).toEqual(cursorOf('a', 0, 0));

    await h.engine.onTtsEvent({ type: 'end' });

    expect(h.speakCalls).toHaveLength(2);
    expect(h.store.cursor).toEqual(cursorOf('a', 0, 1));
  });
});
