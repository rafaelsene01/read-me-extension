import type { Block } from './types';

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
 * matches the text and the target.
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
  if (cached && cached.target === target && cached.sourceTextHash === hashText(block.text)) {
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
    .then((instance) => instance.translate(block.text));
}
