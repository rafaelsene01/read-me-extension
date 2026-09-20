// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderChapter, sanitizeCss, sentenceRanges } from './book-render';
import { segmentBlock } from './segment';
import type { Block } from './types';

describe('sentenceRanges', () => {
  it('maps a sentence inside a single node', () => {
    expect(sentenceRanges(['Uma frase. Outra frase.'], ['Uma frase.', 'Outra frase.'])).toEqual([
      [{ node: 0, start: 0, end: 10 }],
      [{ node: 0, start: 11, end: 23 }],
    ]);
  });

  it('maps a sentence crossing nodes (<i>, <a>)', () => {
    // <p>Uma frase. Outra <i>com itálico</i><a> no meio.</a></p>
    const texts = ['Uma frase. Outra ', 'com itálico', ' no meio.'];
    expect(sentenceRanges(texts, ['Uma frase.', 'Outra com itálico no meio.'])).toEqual([
      [{ node: 0, start: 0, end: 10 }],
      [
        { node: 0, start: 11, end: 17 },
        { node: 1, start: 0, end: 11 },
        { node: 2, start: 0, end: 9 },
      ],
    ]);
  });

  it('keeps the ranges aligned despite runs of spaces, newlines and edge spaces', () => {
    const texts = ['  Frase um.\n  ', 'Frase\n\tdois.  '];
    expect(sentenceRanges(texts, ['Frase um.', 'Frase dois.'])).toEqual([
      [{ node: 0, start: 2, end: 11 }],
      [{ node: 1, start: 0, end: 12 }],
    ]);
  });

  it('returns an empty list for a missing sentence without shifting the next ones', () => {
    expect(sentenceRanges(['A um. B dois. C tres.'], ['A um.', 'X.', 'C tres.'])).toEqual([
      [{ node: 0, start: 0, end: 5 }],
      [],
      [{ node: 0, start: 14, end: 21 }],
    ]);
  });

  it('matches repeated sentences in order', () => {
    expect(sentenceRanges(['Sim. Sim.'], ['Sim.', 'Sim.'])).toEqual([
      [{ node: 0, start: 0, end: 4 }],
      [{ node: 0, start: 5, end: 9 }],
    ]);
  });

  it('survives empty text nodes and empty sentences', () => {
    expect(sentenceRanges(['', 'Oi.', ''], ['', 'Oi.'])).toEqual([[], [{ node: 1, start: 0, end: 3 }]]);
  });
});

const resolve = (url: string): string | null =>
  /^(https?:)?\/\//.test(url) || url.startsWith('javascript:') || url === 'sumiu.png'
    ? null
    : `blob:${url}`;

describe('sanitizeCss', () => {
  it('removes @import rules', () => {
    expect(sanitizeCss('@import url("outra.css");\np{color:red}', resolve)).toBe('\np{color:red}');
    expect(sanitizeCss('@import "outra.css"', resolve)).toBe('');
  });

  it('resolves relative url() and keeps the declaration', () => {
    expect(sanitizeCss("p{background:url('img/a.png') no-repeat}", resolve)).toBe(
      'p{background:url("blob:img/a.png") no-repeat}',
    );
  });

  it('drops the declaration when the url cannot be resolved', () => {
    expect(sanitizeCss('p{background:url(http://x/a.png);color:red}', resolve)).toBe('p{color:red}');
    expect(sanitizeCss('p{color:red;background:url(sumiu.png)}', resolve)).toBe('p{color:red;}');
    expect(sanitizeCss('a{background:url(javascript:1)}', resolve)).toBe('a{}');
  });

  it('rewrites html and body selectors to .rm-book', () => {
    expect(sanitizeCss('html{margin:0}', resolve)).toBe('.rm-book{margin:0}');
    expect(sanitizeCss('html body > p, body.calibre {margin:0}', resolve)).toBe(
      '.rm-book > p, .rm-book.calibre {margin:0}',
    );
  });

  it('does not touch .body-text, #body, tbody or [data-body]', () => {
    const css = '.body-text, #body, tbody, [data-body] {color:red}';
    expect(sanitizeCss(css, resolve)).toBe(css);
  });

  it('rewrites uppercase HTML and BODY selectors too (books in the wild use them)', () => {
    expect(sanitizeCss('BODY\n{\n  background-color: white;\n  font-family: Verdana;\n}', resolve)).toBe(
      '.rm-book\n{\n  background-color: white;\n  font-family: Verdana;\n}',
    );
    expect(sanitizeCss('HTML BODY p, Body.calibre {margin:0}', resolve)).toBe(
      '.rm-book p, .rm-book.calibre {margin:0}',
    );
  });

  it('does not touch TBODY or .BODY-TEXT when matching case-insensitively', () => {
    const css = '.BODY-TEXT, #BODY, TBODY, [data-BODY] {color:red}';
    expect(sanitizeCss(css, resolve)).toBe(css);
  });

  it('handles uppercase @IMPORT and URL()', () => {
    expect(sanitizeCss('@IMPORT url("outra.css");\np{color:red}', resolve)).toBe('\np{color:red}');
    expect(sanitizeCss('p{background:URL(img.png)}', resolve)).toBe('p{background:url("blob:img.png")}');
  });
});

const CHAPTER_PATH = 'OEBPS/Text/cap 1.xhtml';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Every blob handed to createObjectURL, so a `blob:mock/N` url can be traced back to its bytes. */
let blobs: Blob[] = [];

beforeEach(() => {
  blobs = [];
  // jsdom has no object URLs.
  URL.createObjectURL = (object: Blob | MediaSource) => `blob:mock/${blobs.push(object as Blob)}`;
});

function sizeOf(url: string): number {
  return blobs[Number(url.replace('blob:mock/', '')) - 1]!.size;
}

function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, body]) => [
        path,
        typeof body === 'string' ? strToU8(body) : body,
      ]),
    ),
  );
}

function makeBlock(text: string, path = CHAPTER_PATH): Block {
  const id = 'bloco';
  return {
    id,
    sourceUrl: 'Cap um',
    sourceTitle: 'Livro',
    lang: 'pt-BR',
    text,
    paragraphs: segmentBlock(text, 'pt-BR', id),
    epub: { book: 'livro', path },
    createdAt: 0,
  };
}

function render(chapter: string, extra: Record<string, string | Uint8Array> = {}, text = 'Oi.') {
  return renderChapter(makeZip({ [CHAPTER_PATH]: chapter, ...extra }), makeBlock(text));
}

function html(result: { html: DocumentFragment } | null): string {
  const host = document.createElement('div');
  host.appendChild(result!.html.cloneNode(true));
  return host.innerHTML;
}

describe('renderChapter', () => {
  it('joins the chapter <style> and the linked stylesheets, resolving url() per sheet (P1-E AC2, AC3)', () => {
    const result = render(
      `<html xmlns="http://www.w3.org/1999/xhtml"><head>
        <link rel="stylesheet" type="text/css" href="../Styles/livro.css"/>
        <style>body { color: red; background: url(../Images/fundo.png); }</style>
      </head><body><p>Oi.</p></body></html>`,
      {
        'OEBPS/Styles/livro.css': 'p { font-family: Livro; src: url("fonte.woff"); }',
        'OEBPS/Styles/fonte.woff': strToU8('font!'),
        'OEBPS/Images/fundo.png': PNG_BYTES,
      },
    )!;

    const [font, background] = [...result.css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(result.css).toContain('font-family: Livro');
    // `body` scoped, and each url() resolved against its own sheet's folder.
    expect(result.css).toContain('.rm-book {');
    expect(sizeOf(font!)).toBe(5);
    expect(sizeOf(background!)).toBe(PNG_BYTES.length);
    expect(result.urls).toEqual([font, background]);
  });

  it('turns a relative img src into a blob listed in urls and drops a remote one (P1-E AC3, AC4)', () => {
    const result = render(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>
        <p>Oi.</p>
        <img src="../Images/fig.png" alt="fig"/>
        <img src="https://tracker.example/pixel.png" alt="pixel"/>
        <img src="../Images/sumiu.png" alt="sumiu"/>
      </body></html>`,
      { 'OEBPS/Images/fig.png': PNG_BYTES },
    )!;

    expect(result.urls).toHaveLength(1);
    expect(sizeOf(result.urls[0]!)).toBe(PNG_BYTES.length);
    expect(html(result)).toContain(`<img src="${result.urls[0]}" alt="fig">`);
    expect(html(result)).toContain('<img alt="pixel">');
    expect(html(result)).toContain('<img alt="sumiu">');
    expect(html(result)).not.toContain('tracker.example');
  });

  it('removes script, iframe, on* handlers and javascript: hrefs (P1-E AC4)', () => {
    const result = render(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>
        <p onclick="roubar()">Oi.</p>
        <script>var roubado = 1;</script>
        <iframe src="https://x.example/"></iframe>
        <a href="javascript:roubar()">mau</a>
        <a href="https://exemplo.com/p">bom</a>
      </body></html>`,
    )!;

    const out = html(result);
    expect(out).not.toContain('roubar');
    expect(out).not.toContain('roubado');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('onclick');
    // P1-E AC9: the remote link survives so the viewer can open it in a new tab.
    expect(out).toContain('href="https://exemplo.com/p"');
  });

  it('wraps every sentence in span.rm-s[data-s] without changing the visible text (P1-E AC6)', () => {
    const result = render(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body>
        <h1>Capítulo um</h1>
        <p>Uma frase. Outra <i>com itálico</i> no meio.</p>
      </body></html>`,
      {},
      'Capítulo um\nUma frase. Outra com itálico no meio.',
    )!;

    const host = document.createElement('div');
    host.appendChild(result.html);
    expect([...host.querySelectorAll('.rm-s')].map((el) => el.getAttribute('data-s'))).toEqual([
      '0:0',
      '1:0',
      '1:1',
      '1:1',
      '1:1',
    ]);
    expect(host.querySelector('h1')!.textContent).toBe('Capítulo um');
    expect(host.querySelector('p')!.textContent).toBe('Uma frase. Outra com itálico no meio.');
    expect(host.querySelector('[data-s="1:0"]')!.textContent).toBe('Uma frase.');
    expect(
      [...host.querySelectorAll('[data-s="1:1"]')].map((el) => el.textContent).join(''),
    ).toBe('Outra com itálico no meio.');
  });

  it('renders without sentence spans when the paragraph counts differ (P1-E AC11)', () => {
    const result = render(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Uma.</p><p>Outra.</p></body></html>`,
      {},
      'Uma.',
    )!;

    const out = html(result);
    expect(out).not.toContain('rm-s');
    expect(out).toContain('<p>Uma.</p>');
    expect(out).toContain('<p>Outra.</p>');
  });

  it('wraps the body in div.rm-book and reads a malformed chapter as HTML', () => {
    const result = render(`<html><body><p>Oi.<p>Tchau.</body></html>`, {}, 'Oi.\nTchau.')!;
    expect(html(result)).toMatch(/^<div class="rm-book">/);
    expect(html(result)).toContain('data-s="1:0"');
  });

  it('returns null without epub.path or when the chapter is missing from the zip', () => {
    const block = makeBlock('Oi.');
    expect(renderChapter(makeZip({ 'OEBPS/outro.xhtml': '<html/>' }), block)).toBeNull();
    expect(renderChapter(makeZip({ [CHAPTER_PATH]: '<html/>' }), { ...block, epub: undefined })).toBeNull();
    expect(renderChapter(strToU8('isto não é um zip'), block)).toBeNull();
  });
});
