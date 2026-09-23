import { detectLang } from './detect-lang';
import type { Block } from './types';
import { ensureOffscreen } from './tts/offscreen';

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface DownloadProgressEvent {
  loaded: number;
}

interface CreateMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (event: DownloadProgressEvent) => void,
  ): void;
}

interface TranslatorPair {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorInstance {
  translate(text: string): Promise<string>;
}

interface TranslatorFactory {
  availability(pair: TranslatorPair): Promise<Availability>;
  create(options: TranslatorPair & { monitor?: (monitor: CreateMonitor) => void }): Promise<
    TranslatorInstance
  >;
}

declare global {
  // Chrome 138+ only; absent everywhere else, including the test runner.
  // eslint-disable-next-line no-var
  var Translator: TranslatorFactory | undefined;
}

function factory(): TranslatorFactory | undefined {
  return globalThis.Translator;
}

/** FNV-1a over the block text. Synchronous on purpose: see translateBlock. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export function translationSupport(): 'ok' | 'unsupported' {
  return factory() ? 'ok' : 'unsupported';
}

export async function availability(source: string, target: string): Promise<Availability> {
  const translator = factory();
  if (!translator) return 'unavailable';
  return translator.availability({ sourceLanguage: source, targetLanguage: target });
}

/** A created translator, plus the source language it ended up being created for. */
interface Created {
  instance: TranslatorInstance;
  source: string;
}

/**
 * Create a translator for `source`, and when the browser refuses the pair
 * ("Unable to create translator for the given source and target language"),
 * read the language off the text and try that one instead: an imported file
 * often declares the wrong language, and the refusal is where it first shows.
 * The original failure is what surfaces when the text reads the same language,
 * so the caller still reports a pair that genuinely does not exist.
 *
 * The first create is not behind any await, so the click that asked for the
 * translation still authorizes a language-pack download; the detection takes
 * milliseconds, which leaves the retry inside the same activation window.
 */
function createFor(
  translator: TranslatorFactory,
  source: string,
  target: string,
  text: string,
  monitor?: (monitor: CreateMonitor) => void,
): Promise<Created> {
  const create = (from: string): Promise<TranslatorInstance> =>
    translator.create({ sourceLanguage: from, targetLanguage: target, monitor });

  return create(source)
    .then((instance) => ({ instance, source }))
    .catch(async (error: unknown) => {
      const detected = await detectLang(text, source);
      if (detected === source) throw error;
      return { instance: await create(detected), source: detected };
    });
}

/** True once the block text changed after its translation was stored. */
export function isStale(block: Block): boolean {
  if (!block.translation) return false;
  return block.translation.sourceTextHash !== hashText(block.text);
}

/**
 * Translated text for a block, reusing the stored translation when it still
 * matches the text, the target and the paragraph count.
 *
 * Each line (one paragraph) is translated on its own and the lines are joined
 * back, so the translation keeps the original structure paragraph for
 * paragraph. Translating the whole text at once lets the model merge lines.
 *
 * The lines go one after the other, in order, and `onLines` gets the lines done
 * so far after each one, so the caller can show the translation growing.
 * `after` holds the lines back until it resolves (the previous block), so
 * several blocks fill in top to bottom; the translator is still created now.
 *
 * Not an async function: `create` must run in the same task as the click that
 * asked for the translation, or the browser refuses the language-pack download.
 * Nothing is awaited before it.
 */
export function translateBlock(
  block: Block,
  target: string,
  onProgress: (loaded: number) => void,
  {
    onLines,
    after = Promise.resolve(),
  }: { onLines?: (lines: string[]) => void; after?: Promise<unknown> } = {},
): Promise<{ text: string; lang: string }> {
  const cached = block.translation;
  if (
    cached &&
    cached.target === target &&
    cached.sourceTextHash === hashText(block.text) &&
    // Translations stored before per-paragraph translation may have merged lines.
    cached.paragraphs.length === block.paragraphs.length
  ) {
    return Promise.resolve({ text: cached.text, lang: block.lang });
  }

  const translator = factory();
  if (!translator) return Promise.reject(new Error('Tradução não suportada neste navegador'));

  const created = createFor(translator, block.lang, target, block.text, (monitor) => {
    monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
  });
  return Promise.all([created, after]).then(async ([{ instance, source }]) => {
    const lines: string[] = [];
    for (const line of block.text.split('\n')) {
      // A line break inside a translated line would shift every paragraph after it.
      lines.push(line.trim() ? (await instance.translate(line)).replace(/\s*\n\s*/g, ' ') : line);
      onLines?.(lines);
    }
    // `source` is the language the text actually reads as: the caller stores it.
    return { text: lines.join('\n'), lang: source };
  });
}

/** Message tag for translation requests answered by the offscreen document. */
export const TRANSLATE_CHANNEL = 'translate' as const;

interface TranslateMessage {
  channel: typeof TRANSLATE_CHANNEL;
  text: string;
  source: string;
  target: string;
}

type TranslateResponse = { ok: true; text: string } | { ok: false; error: string };

/**
 * Service-worker side: the Translator API does not exist in workers, so the
 * offscreen document translates and answers through TRANSLATE_CHANNEL.
 */
export async function requestTranslation(
  text: string,
  source: string,
  target: string,
): Promise<string> {
  await ensureOffscreen();
  const message: TranslateMessage = { channel: TRANSLATE_CHANNEL, text, source, target };
  const response = (await chrome.runtime.sendMessage(message)) as TranslateResponse | undefined;
  if (!response) throw new Error('O tradutor não respondeu');
  if (!response.ok) throw new Error(response.error);
  return response.text;
}

/** Offscreen side: answers TRANSLATE_CHANNEL requests, one Translator per language pair. */
export function serveTranslations(): void {
  const translators = new Map<string, Promise<TranslatorInstance>>();
  // ponytail: unbounded cache, lives until the offscreen document closes when idle; cap it if memory becomes a problem.
  const texts = new Map<string, Promise<string>>();

  // A rejected promise leaves its map, so the next request tries again.
  function remember<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>) {
    let promise = map.get(key);
    if (!promise) {
      promise = make();
      map.set(key, promise);
      promise.catch(() => map.delete(key));
    }
    return promise;
  }

  function translate({ text, source, target }: TranslateMessage): Promise<string> {
    const pair = `${source}>${target}`;
    return remember(texts, `${pair}|${text}`, () =>
      remember(translators, pair, () => {
        const translator = factory();
        if (!translator) return Promise.reject(new Error('Tradução não suportada neste navegador'));
        return createFor(translator, source, target, text).then(({ instance }) => instance);
      }).then((instance) => instance.translate(text)),
    );
  }

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if ((message as { channel?: unknown } | null)?.channel !== TRANSLATE_CHANNEL) return false;
    translate(message as TranslateMessage).then(
      (text) => sendResponse({ ok: true, text } satisfies TranslateResponse),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies TranslateResponse),
    );
    return true;
  });
}

/**
 * Page side: downloads the language pack of a pair, reporting progress, and
 * discards the instance. Resolves with the source language it worked with,
 * which `text` can correct when the declared one is refused. Not async for the
 * same reason as translateBlock: `create` must run in the click's task.
 */
export function preparePair(
  source: string,
  target: string,
  text: string,
  onProgress: (loaded: number) => void,
): Promise<string> {
  const translator = factory();
  if (!translator) return Promise.reject(new Error('Tradução não suportada neste navegador'));
  return createFor(translator, source, target, text, (monitor) => {
    monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
  }).then((created) => created.source);
}
