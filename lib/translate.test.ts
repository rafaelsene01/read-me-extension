import { afterEach, describe, expect, it, vi } from 'vitest';
import { availability, hashText, isStale, translateBlock, translationSupport } from './translate';
import type { Block } from './types';

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    sourceUrl: 'https://example.com/a',
    sourceTitle: 'A',
    lang: 'en',
    text: 'Hello there.',
    paragraphs: [{ id: 'b1:p0', sentences: [{ id: 'b1:p0:s0', text: 'Hello there.' }] }],
    createdAt: 0,
    ...overrides,
  };
}

/** Fake Translator global; `create` resolves only when the test releases it. */
function fakeTranslator(translated = 'Olá.') {
  const listeners: Array<(event: { loaded: number }) => void> = [];
  const translate = vi.fn(async () => translated);
  const create = vi.fn(async (options: { monitor?: (m: unknown) => void }) => {
    options.monitor?.({
      addEventListener: (_type: string, listener: (event: { loaded: number }) => void) => {
        listeners.push(listener);
      },
    });
    // The real API reports download progress while create is pending.
    listeners.forEach((listener) => listener({ loaded: 0.5 }));
    return { translate };
  });
  const availabilityFn = vi.fn(async () => 'available' as const);

  vi.stubGlobal('Translator', { create, availability: availabilityFn, translate });
  return { create, translate, availability: availabilityFn, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('translationSupport', () => {
  it('reports unsupported when the Translator global is absent', () => {
    vi.stubGlobal('Translator', undefined);
    expect(translationSupport()).toBe('unsupported');
  });

  it('reports ok when the Translator global is present', () => {
    fakeTranslator();
    expect(translationSupport()).toBe('ok');
  });
});

describe('availability', () => {
  it('returns unavailable without the Translator global', async () => {
    vi.stubGlobal('Translator', undefined);
    expect(await availability('en', 'pt')).toBe('unavailable');
  });

  it('asks the API for the chosen language pair', async () => {
    const api = fakeTranslator();
    expect(await availability('en', 'pt-BR')).toBe('available');
    expect(api.availability).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'pt-BR',
    });
  });
});

describe('translateBlock', () => {
  it('calls create synchronously, before any await, keeping the user gesture', () => {
    const api = fakeTranslator();
    void translateBlock(block(), 'pt', () => {});
    // No await has run yet: the click task is still on the stack.
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('creates the translator for the block language and the chosen target', async () => {
    const api = fakeTranslator();
    await translateBlock(block({ lang: 'en-US' }), 'pt-BR', () => {});
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      sourceLanguage: 'en-US',
      targetLanguage: 'pt-BR',
    });
  });

  it('returns the translated text', async () => {
    fakeTranslator('Olá a todos.');
    expect(await translateBlock(block(), 'pt', () => {})).toBe('Olá a todos.');
  });

  it('forwards download progress reported by the monitor', async () => {
    fakeTranslator();
    const progress: number[] = [];
    await translateBlock(block(), 'pt', (loaded) => progress.push(loaded));
    expect(progress).toEqual([0.5]);
  });

  it('reuses the stored translation for the same target and unchanged text', async () => {
    const api = fakeTranslator();
    const source = 'Hello there.';
    const translated = await translateBlock(
      block({
        text: source,
        translation: {
          target: 'pt',
          text: 'Olá guardado.',
          paragraphs: [],
          sourceTextHash: hashText(source),
        },
      }),
      'pt',
      () => {},
    );
    expect(translated).toBe('Olá guardado.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('translates again when the target language changed', async () => {
    const api = fakeTranslator('Hallo.');
    const source = 'Hello there.';
    const translated = await translateBlock(
      block({
        text: source,
        translation: {
          target: 'pt',
          text: 'Olá guardado.',
          paragraphs: [],
          sourceTextHash: hashText(source),
        },
      }),
      'de',
      () => {},
    );
    expect(translated).toBe('Hallo.');
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('translates again when the block text changed after the translation', async () => {
    const api = fakeTranslator('Olá novo.');
    const translated = await translateBlock(
      block({
        text: 'Hello there, again.',
        translation: {
          target: 'pt',
          text: 'Olá guardado.',
          paragraphs: [],
          sourceTextHash: hashText('Hello there.'),
        },
      }),
      'pt',
      () => {},
    );
    expect(translated).toBe('Olá novo.');
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('rejects and leaves the block untouched when create fails', async () => {
    vi.stubGlobal('Translator', {
      create: vi.fn(async () => {
        throw new Error('download recusado');
      }),
      availability: vi.fn(async () => 'downloadable' as const),
    });
    const target = block();
    await expect(translateBlock(target, 'pt', () => {})).rejects.toThrow('download recusado');
    expect(target.text).toBe('Hello there.');
    expect(target.translation).toBeUndefined();
  });

  it('rejects and leaves the block untouched when translate fails', async () => {
    vi.stubGlobal('Translator', {
      create: vi.fn(async () => ({
        translate: async () => {
          throw new Error('falha na tradução');
        },
      })),
      availability: vi.fn(async () => 'available' as const),
    });
    const target = block();
    await expect(translateBlock(target, 'pt', () => {})).rejects.toThrow('falha na tradução');
    expect(target.text).toBe('Hello there.');
    expect(target.translation).toBeUndefined();
  });

  it('rejects without the Translator global instead of throwing synchronously', async () => {
    vi.stubGlobal('Translator', undefined);
    await expect(translateBlock(block(), 'pt', () => {})).rejects.toThrow(
      'Tradução não suportada neste navegador',
    );
  });
});

describe('isStale', () => {
  it('is false for a block that was never translated', () => {
    expect(isStale(block())).toBe(false);
  });

  it('is false while the text still matches the stored hash', () => {
    const source = 'Hello there.';
    expect(
      isStale(
        block({
          text: source,
          translation: {
            target: 'pt',
            text: 'Olá.',
            paragraphs: [],
            sourceTextHash: hashText(source),
          },
        }),
      ),
    ).toBe(false);
  });

  it('is true once the text changed after the translation', () => {
    expect(
      isStale(
        block({
          text: 'Hello there, edited.',
          translation: {
            target: 'pt',
            text: 'Olá.',
            paragraphs: [],
            sourceTextHash: hashText('Hello there.'),
          },
        }),
      ),
    ).toBe(true);
  });
});
