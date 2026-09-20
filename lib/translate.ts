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
 * Not an async function: `create` must run in the same task as the click that
 * asked for the translation, or the browser refuses the language-pack download.
 * Nothing is awaited before it.
 */
export function translateBlock(
  block: Block,
  target: string,
  onProgress: (loaded: number) => void,
): Promise<string> {
  const cached = block.translation;
  if (
    cached &&
    cached.target === target &&
    cached.sourceTextHash === hashText(block.text) &&
    // Translations stored before per-paragraph translation may have merged lines.
    cached.paragraphs.length === block.paragraphs.length
  ) {
    return Promise.resolve(cached.text);
  }

  const translator = factory();
  if (!translator) return Promise.reject(new Error('Tradução não suportada neste navegador'));

  return translator
    .create({
      sourceLanguage: block.lang,
      targetLanguage: target,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
      },
    })
    .then((instance) =>
      Promise.all(
        block.text.split('\n').map((line) =>
          // A line break inside a translated line would shift every paragraph after it.
          line.trim() ? instance.translate(line).then((text) => text.replace(/\s*\n\s*/g, ' ')) : line,
        ),
      ),
    )
    .then((lines) => lines.join('\n'));
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
        return translator.create({ sourceLanguage: source, targetLanguage: target });
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
 * discards the instance. Not async for the same reason as translateBlock:
 * `create` must run in the click's task.
 */
export function preparePair(
  source: string,
  target: string,
  onProgress: (loaded: number) => void,
): Promise<void> {
  const translator = factory();
  if (!translator) return Promise.reject(new Error('Tradução não suportada neste navegador'));
  return translator
    .create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
      },
    })
    .then(() => undefined);
}
