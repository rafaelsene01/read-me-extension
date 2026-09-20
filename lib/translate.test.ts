import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSLATE_CHANNEL,
  availability,
  hashText,
  isStale,
  preparePair,
  requestTranslation,
  serveTranslations,
  translateBlock,
  translationSupport,
} from './translate';
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

/** chrome.i18n.detectLanguage answering `language` with full confidence. */
function stubDetector(language: string): void {
  vi.stubGlobal('chrome', {
    i18n: { detectLanguage: vi.fn(async () => ({ languages: [{ language, percentage: 100 }] })) },
  });
}

/** Fake Translator global; `create` resolves only when the test releases it. */
function fakeTranslator(translated = 'Olá.') {
  const listeners: Array<(event: { loaded: number }) => void> = [];
  const translate = vi.fn(async (_text: string) => translated);
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
    expect((await translateBlock(block(), 'pt', () => {})).text).toBe('Olá a todos.');
  });

  it('translates each paragraph on its own, keeping one line per paragraph', async () => {
    const api = fakeTranslator();
    api.translate.mockImplementation(async (line: string) => `[${line}]`);
    const translated = await translateBlock(
      block({ text: 'Titulo\nPrimeiro.\nSegundo.' }),
      'pt',
      () => {},
    );
    expect(translated.text).toBe('[Titulo]\n[Primeiro.]\n[Segundo.]');
    expect(api.translate).toHaveBeenCalledTimes(3);
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
          paragraphs: [{ id: 'b1#t:p0', sentences: [{ id: 'b1#t:p0:s0', text: 'Olá guardado.' }] }],
          sourceTextHash: hashText(source),
        },
      }),
      'pt',
      () => {},
    );
    expect(translated.text).toBe('Olá guardado.');
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
    expect(translated.text).toBe('Hallo.');
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
    expect(translated.text).toBe('Olá novo.');
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

  it('retries with the language read off the text when the pair is refused', async () => {
    const translate = vi.fn(async () => 'Olá.');
    const create = vi.fn(async ({ sourceLanguage }: { sourceLanguage: string }) => {
      if (sourceLanguage !== 'de') throw new Error('Unable to create translator');
      return { translate };
    });
    vi.stubGlobal('Translator', { create, availability: vi.fn(async () => 'available' as const) });
    stubDetector('de');

    const translated = await translateBlock(
      block({ lang: 'en', text: 'Guten Tag, das ist ein langer Satz.' }),
      'pt',
      () => {},
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]).toMatchObject({ sourceLanguage: 'de' });
    // The caller stores this, so the refusal does not come back on the next run.
    expect(translated.lang).toBe('de');
  });

  it('reports the original refusal when the text reads the declared language', async () => {
    const create = vi.fn(async () => {
      throw new Error('Unable to create translator');
    });
    vi.stubGlobal('Translator', { create, availability: vi.fn(async () => 'available' as const) });
    stubDetector('en');

    await expect(
      translateBlock(block({ lang: 'en', text: 'This is a long enough sentence.' }), 'pt', () => {}),
    ).rejects.toThrow('Unable to create translator');
    expect(create).toHaveBeenCalledTimes(1);
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

type Listener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown;

/** Stubs chrome.runtime/offscreen; `ask` sends a message to the served listener and awaits its answer. */
function stubChrome(sendMessage = vi.fn()) {
  const listeners: Listener[] = [];
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, onMessage: { addListener: (fn: Listener) => listeners.push(fn) } },
    offscreen: { hasDocument: vi.fn(async () => true) },
  });
  const ask = (message: unknown) =>
    new Promise((resolve) => {
      const handled = listeners[0]?.(message, {}, resolve);
      if (!handled) resolve('ignored');
    });
  const request = (text: string, source = 'en', target = 'pt') =>
    ask({ channel: TRANSLATE_CHANNEL, text, source, target });
  return { ask, request, sendMessage };
}

describe('serveTranslations', () => {
  it('answers translate requests and ignores other channels', async () => {
    fakeTranslator('Olá.');
    const chrome = stubChrome();
    serveTranslations();
    expect(await chrome.request('Hello.')).toEqual({ ok: true, text: 'Olá.' });
    expect(await chrome.ask({ channel: 'local-tts', type: 'stop' })).toBe('ignored');
  });

  it('translates the same sentence of the same pair only once', async () => {
    const api = fakeTranslator();
    const chrome = stubChrome();
    serveTranslations();
    await chrome.request('Hello.');
    await chrome.request('Hello.');
    expect(api.translate).toHaveBeenCalledTimes(1);
  });

  it('creates one Translator per language pair', async () => {
    const api = fakeTranslator();
    const chrome = stubChrome();
    serveTranslations();
    await chrome.request('One.');
    await chrome.request('Two.');
    expect(api.create).toHaveBeenCalledTimes(1);
    await chrome.request('One.', 'en', 'de');
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it('answers the failure and retries on the next request', async () => {
    const api = fakeTranslator('Olá.');
    api.translate.mockRejectedValueOnce(new Error('modelo caiu'));
    const chrome = stubChrome();
    serveTranslations();
    expect(await chrome.request('Hello.')).toEqual({ ok: false, error: 'modelo caiu' });
    expect(await chrome.request('Hello.')).toEqual({ ok: true, text: 'Olá.' });
    expect(api.translate).toHaveBeenCalledTimes(2);
  });

  it('retries creating the Translator after create failed', async () => {
    const api = fakeTranslator('Olá.');
    api.create.mockRejectedValueOnce(new Error('download recusado'));
    const chrome = stubChrome();
    serveTranslations();
    expect(await chrome.request('Hello.')).toEqual({ ok: false, error: 'download recusado' });
    expect(await chrome.request('Hello.')).toEqual({ ok: true, text: 'Olá.' });
  });
});

describe('requestTranslation', () => {
  it('sends the request on the translate channel and resolves with the text', async () => {
    const chrome = stubChrome(vi.fn(async () => ({ ok: true, text: 'Olá.' })));
    expect(await requestTranslation('Hello.', 'en', 'pt')).toBe('Olá.');
    expect(chrome.sendMessage).toHaveBeenCalledWith({
      channel: TRANSLATE_CHANNEL,
      text: 'Hello.',
      source: 'en',
      target: 'pt',
    });
  });

  it('rejects with the error message of a failed answer', async () => {
    stubChrome(vi.fn(async () => ({ ok: false, error: 'modelo caiu' })));
    await expect(requestTranslation('Hello.', 'en', 'pt')).rejects.toThrow('modelo caiu');
  });
});

describe('preparePair', () => {
  it('creates the pair synchronously and forwards the download progress', async () => {
    const api = fakeTranslator();
    const progress: number[] = [];
    const preparing = preparePair('en', 'pt-BR', 'Hello there.', (loaded: number) => progress.push(loaded));
    expect(api.create).toHaveBeenCalledTimes(1);
    await preparing;
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({ sourceLanguage: 'en', targetLanguage: 'pt-BR' });
    expect(progress).toEqual([0.5]);
  });
});
