import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isCapturable, needsPermission, requestAndCapture } from './capture';
import { getBlocks, setBlocks } from './storage';
import type { Block } from './types';

const PAGE = 'https://example.com/artigo';

const PAYLOAD = {
  text: 'Primeira frase. Segunda frase.',
  url: PAGE,
  title: 'Artigo',
  lang: 'pt-BR',
};

function stubChrome(options: {
  granted?: boolean;
  executeScript?: () => Promise<unknown>;
  payload?: unknown;
} = {}) {
  const request = vi.fn().mockResolvedValue(options.granted ?? true);
  const executeScript = vi.fn(options.executeScript ?? (() => Promise.resolve([])));
  const sendMessage = vi.fn().mockResolvedValue('payload' in options ? options.payload : PAYLOAD);
  vi.stubGlobal('chrome', {
    permissions: { request },
    scripting: { executeScript },
    tabs: { sendMessage },
  });
  return { request, executeScript, sendMessage };
}

function block(id: string, text: string): Block {
  return {
    id,
    sourceUrl: 'https://example.org/antigo',
    sourceTitle: id,
    lang: 'pt-BR',
    text,
    paragraphs: [],
    createdAt: 0,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCapturable', () => {
  it('refuses the browser internal pages', () => {
    expect(isCapturable('chrome://settings')).toBe(false);
    expect(isCapturable('edge://extensions')).toBe(false);
    expect(isCapturable('about:blank')).toBe(false);
  });

  it('refuses the extension stores', () => {
    expect(isCapturable('https://chromewebstore.google.com/detail/abc')).toBe(false);
    expect(isCapturable('https://chrome.google.com/webstore/category/extensions')).toBe(false);
  });

  it('accepts an http or https page', () => {
    expect(isCapturable(PAGE)).toBe(true);
    expect(isCapturable('http://localhost:3000/')).toBe(true);
  });
});

describe('needsPermission', () => {
  it('is false when the origin is already granted', () => {
    expect(needsPermission(PAGE, ['https://example.com/*'])).toBe(false);
    expect(needsPermission(PAGE, ['<all_urls>'])).toBe(false);
  });

  it('is true when no granted pattern covers the url', () => {
    expect(needsPermission(PAGE, [])).toBe(true);
    expect(needsPermission(PAGE, ['https://outro.com/*'])).toBe(true);
  });
});

describe('requestAndCapture', () => {
  it('asks for the host permission before anything else, keeping the user gesture', () => {
    const { request, executeScript } = stubChrome();

    const running = requestAndCapture(7, PAGE, 'selection');

    expect(request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    expect(executeScript).not.toHaveBeenCalled();
    return running;
  });

  it('appends a block with the captured text, url, title and language', async () => {
    stubChrome();

    const result = await requestAndCapture(7, PAGE, 'selection');

    expect(result).toEqual({ ok: true, block: expect.objectContaining({ text: PAYLOAD.text }) });
    const blocks = await getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks.map((b) => [b.sourceUrl, b.sourceTitle, b.lang])).toEqual([
      [PAGE, 'Artigo', 'pt-BR'],
    ]);
    expect(blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.sentences.map((s) => s.text)))).toEqual(
      ['Primeira frase.', 'Segunda frase.'],
    );
  });

  it('keeps the blocks already in the buffer and appends at the end', async () => {
    stubChrome();
    await setBlocks([block('a', 'antigo')]);

    await requestAndCapture(7, PAGE, 'selection');

    const blocks = await getBlocks();
    expect(blocks.map((b) => b.text)).toEqual(['antigo', PAYLOAD.text]);
  });

  it('returns reason "denied" and leaves the buffer untouched when permission is refused', async () => {
    const { executeScript } = stubChrome({ granted: false });
    await setBlocks([block('a', 'antigo')]);

    const result = await requestAndCapture(7, PAGE, 'selection');

    expect(result).toEqual({ ok: false, reason: 'denied' });
    expect(executeScript).not.toHaveBeenCalled();
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('returns reason "inaccessible" when the injection fails', async () => {
    stubChrome({ executeScript: () => Promise.reject(new Error('Cannot access contents')) });

    const result = await requestAndCapture(7, PAGE, 'picker');

    expect(result).toEqual({ ok: false, reason: 'inaccessible' });
    expect(await getBlocks()).toEqual([]);
  });

  it('returns reason "inaccessible" when the picked element is in a region the page hides', async () => {
    stubChrome({ payload: { ...PAYLOAD, text: '', inaccessible: true } });
    await setBlocks([block('a', 'antigo')]);

    const result = await requestAndCapture(7, PAGE, 'picker');

    expect(result).toEqual({ ok: false, reason: 'inaccessible' });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('returns reason "empty" when the captured text has no content', async () => {
    stubChrome({ payload: { ...PAYLOAD, text: '' } });
    await setBlocks([block('a', 'antigo')]);

    const result = await requestAndCapture(7, PAGE, 'selection');

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('returns reason "cancelled" when the picker is closed with Escape', async () => {
    stubChrome({ payload: null });

    const result = await requestAndCapture(7, PAGE, 'picker');

    expect(result).toEqual({ ok: false, reason: 'cancelled' });
    expect(await getBlocks()).toEqual([]);
  });

  it('returns reason "full" when the buffer is at the character limit', async () => {
    stubChrome();
    await setBlocks([block('a', 'x'.repeat(500_000))]);

    const result = await requestAndCapture(7, PAGE, 'selection');

    expect(result).toEqual({ ok: false, reason: 'full' });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('returns reason "unsupported" and never injects into an internal page', async () => {
    const { request, executeScript } = stubChrome();

    const result = await requestAndCapture(7, 'chrome://settings', 'selection');

    expect(result).toEqual({ ok: false, reason: 'unsupported' });
    expect(request).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });
});
