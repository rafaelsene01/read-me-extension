import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractFromElement, extractFromSelection, isInaccessible, pageLang } from './extract';

function docWithSelection(text: string | null): Document {
  return {
    getSelection: () => (text === null ? null : { toString: () => text }),
  } as unknown as Document;
}

function element(innerText: string): Element {
  return { innerText } as unknown as Element;
}

/** chrome.dom.openOrClosedShadowRoot is what reveals a closed shadow root. */
function stubClosedShadowRoot(root: unknown): void {
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: () => root } });
}

function iframe(contentDocument: unknown): Element {
  return { tagName: 'IFRAME', contentDocument } as unknown as Element;
}

function host(shadowRoot: unknown): Element {
  return { tagName: 'DIV', shadowRoot } as unknown as Element;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function docWithLang(lang: string): Document {
  return { documentElement: { lang } } as unknown as Document;
}

describe('extractFromSelection', () => {
  it('returns an empty string when nothing is selected', () => {
    expect(extractFromSelection(docWithSelection(null))).toBe('');
    expect(extractFromSelection(docWithSelection(''))).toBe('');
  });

  it('returns the selected text', () => {
    expect(extractFromSelection(docWithSelection('Primeira frase. Segunda frase.'))).toBe(
      'Primeira frase. Segunda frase.',
    );
  });

  it('normalizes a whitespace-only selection to an empty string', () => {
    expect(extractFromSelection(docWithSelection('   \n\t  \n '))).toBe('');
  });

  it('collapses runs of spaces inside a line', () => {
    expect(extractFromSelection(docWithSelection('  Texto    com   espacos  '))).toBe(
      'Texto com espacos',
    );
  });
});

describe('extractFromElement', () => {
  it('reads innerText', () => {
    expect(extractFromElement(element('Titulo do artigo'))).toBe('Titulo do artigo');
  });

  it('keeps the line break between child blocks', () => {
    expect(extractFromElement(element('Titulo\n\nPrimeiro paragrafo.\nSegundo paragrafo.'))).toBe(
      'Titulo\nPrimeiro paragrafo.\nSegundo paragrafo.',
    );
  });

  it('normalizes an element with only whitespace to an empty string', () => {
    expect(extractFromElement(element(' \n \n '))).toBe('');
  });
});

describe('pageLang', () => {
  it('returns the language declared by the page', () => {
    expect(pageLang(docWithLang('pt-BR'))).toBe('pt-BR');
  });

  it('falls back to navigator.language when the page declares no language', () => {
    expect(pageLang(docWithLang(''))).toBe(navigator.language);
    expect(pageLang(docWithLang('   '))).toBe(navigator.language);
  });
});

describe('isInaccessible', () => {
  it('reports an iframe from another origin', () => {
    stubClosedShadowRoot(null);

    expect(isInaccessible(iframe(null))).toBe(true);
  });

  it('reports a closed shadow root the host hides', () => {
    stubClosedShadowRoot({ mode: 'closed' });

    expect(isInaccessible(host(null))).toBe(true);
  });

  it('accepts a same-origin iframe and an open shadow host', () => {
    stubClosedShadowRoot({ mode: 'open' });

    expect(isInaccessible(iframe({ documentElement: {} }))).toBe(false);
    expect(isInaccessible(host({ mode: 'open' }))).toBe(false);
  });

  it('accepts a plain element', () => {
    stubClosedShadowRoot(null);

    expect(isInaccessible(host(null))).toBe(false);
  });
});
