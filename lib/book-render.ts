import { strFromU8, unzipSync } from 'fflate';
import { collapse, paragraphElements } from './epub';
import type { Block } from './types';

/** A slice `[start, end)` of the raw text of `texts[node]`. */
export interface TextRange {
  node: number;
  start: number;
  end: number;
}

/**
 * Map the collapsed text of one paragraph back to its raw text nodes: for each
 * collapsed character, where it came from. Whitespace runs become a single
 * space that keeps the whole run of the node it started in, so a range never
 * splits around the spaces inside a sentence.
 */
function collapsedMap(texts: string[]): { text: string; chars: TextRange[] } {
  const chars: TextRange[] = [];
  let text = '';
  let space: TextRange | null = null;

  for (let node = 0; node < texts.length; node++) {
    const raw = texts[node]!;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i]!;
      if (/\s/.test(char)) {
        if (space && space.node === node && space.end === i) space.end = i + 1;
        else if (!space) space = { node, start: i, end: i + 1 };
        continue;
      }
      // Leading whitespace is dropped, like the trim in `collapse`.
      if (space && text) {
        text += ' ';
        chars.push(space);
      }
      space = null;
      text += char;
      chars.push({ node, start: i, end: i + 1 });
    }
  }

  return { text, chars };
}

/**
 * The raw ranges of each sentence of a paragraph, per text node.
 * `texts` is the raw `data` of the text nodes of one leaf paragraph element in
 * document order; `sentences` the texts of `block.paragraphs[i].sentences`,
 * which were segmented from `collapse(el.textContent)`. Sentences are matched
 * in order; one that is not found yields an empty list and does not move the
 * search forward.
 */
export function sentenceRanges(texts: string[], sentences: string[]): TextRange[][] {
  const { text, chars } = collapsedMap(texts);
  let from = 0;

  return sentences.map((sentence) => {
    const found = sentence ? text.indexOf(sentence, from) : -1;
    if (found < 0) return [];
    from = found + sentence.length;

    const ranges: TextRange[] = [];
    for (const char of chars.slice(found, from)) {
      const last = ranges[ranges.length - 1];
      if (last && last.node === char.node && last.end === char.start) last.end = char.end;
      else ranges.push({ ...char });
    }
    return ranges;
  });
}

const URL_CALL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
// Case-insensitive: element selectors are ASCII case-insensitive in HTML, and books
// in the wild ship `BODY { ... }`. The leading separator keeps `tbody` out.
const ELEMENT_SELECTOR = /(^|[\s,>+~(])(?:html|body)\b(?![-_])/gi;

/**
 * Make a stylesheet of the book safe to inject: no `@import`, no remote or
 * missing resources, and `html`/`body` scoped to the `.rm-book` wrapper.
 * `resolve` turns a raw `url()` into a usable one (null → drop the declaration).
 *
 * ponytail: regex over `;{}` chunks, not a parser — a `url(` or a `}` inside a
 * string literal or a comment fools it. Move to a real CSS parser (postcss) if
 * books in the wild need it.
 */
export function sanitizeCss(css: string, resolve: (url: string) => string | null): string {
  return css
    .replace(/@import\b[^;}]*;?/gi, '')
    .split(/(?<=[{};])/)
    .map((part) => {
      if (part.trimEnd().endsWith('{')) {
        return part
          .replace(ELEMENT_SELECTOR, '$1.rm-book')
          .replace(/\.rm-book(?:\s*>?\s*\.rm-book)+/g, '.rm-book');
      }
      if (!/url\(/i.test(part)) return part;

      let dropped = false;
      const resolved = part.replace(URL_CALL, (_match, _quote, raw: string) => {
        const url = resolve(collapse(raw));
        if (url === null) dropped = true;
        return url === null ? '' : `url("${url}")`;
      });
      // Dropping the declaration must not drop the block it closes.
      return dropped ? (part.match(/\}\s*$/)?.[0] ?? '') : resolved;
    })
    .join('');
}

/** Any scheme (`http:`, `javascript:`, `data:`) or protocol-relative URL: not a zip entry. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** The zip path a href/src points at, relative to `base`; null when it is not one. */
function entryPath(href: string, base: string): string | null {
  const url = collapse(href);
  if (!url || url.startsWith('#') || EXTERNAL.test(url)) return null;
  try {
    return decodeURIComponent(new URL(url, 'http://x/' + base).pathname.slice(1));
  } catch {
    return null;
  }
}

function rawUrlsIn(css: string): string[] {
  const urls: string[] = [];
  css.replace(URL_CALL, (_match, _quote, raw: string) => {
    urls.push(collapse(raw));
    return '';
  });
  return urls;
}

/** The text nodes inside a paragraph element, in document order. */
function textNodesOf(el: Element): Text[] {
  const nodes: Text[] = [];
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) nodes.push(child as Text);
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  return nodes;
}

/**
 * Wrap each sentence of `paragraphs` in `<span class="rm-s" data-s="p:s">`, matching the
 * leaf paragraph elements of the chapter with the extracted ones. Different counts → no
 * spans at all (P1-E AC11). The visible text never changes: only text nodes are split.
 */
function wrapSentences(doc: Document, block: Block): void {
  const elements = paragraphElements(doc);
  if (elements.length !== block.paragraphs.length) return;

  elements.forEach((el, paraIndex) => {
    const nodes = textNodesOf(el);
    const sentences = block.paragraphs[paraIndex]!.sentences;
    const pieces = sentenceRanges(
      nodes.map((node) => node.data),
      sentences.map((sentence) => sentence.text),
    ).flatMap((ranges, sentIndex) => ranges.map((range) => ({ ...range, sentIndex })));

    // Split from the end of each node so the offsets of the earlier pieces stay valid.
    for (const piece of pieces.sort((a, b) => b.node - a.node || b.start - a.start)) {
      const node = nodes[piece.node]!;
      if (piece.end < node.data.length) node.splitText(piece.end);
      const middle = node.splitText(piece.start);
      const span = doc.createElement('span');
      span.setAttribute('class', 'rm-s');
      span.setAttribute('data-s', `${paraIndex}:${piece.sentIndex}`);
      middle.replaceWith(span);
      span.appendChild(middle);
    }
  });
}

/**
 * Render a book chapter from the original zip: its own HTML and CSS, made safe to inject,
 * with the resources of the book as blob URLs and each sentence of `block` wrapped in a
 * `span.rm-s[data-s]`. Returns null when the chapter is not in the zip.
 * `urls` must be revoked by the caller when the chapter goes away.
 *
 * ponytail: two `unzipSync` passes per chapter, the first inflating every `.css` of the
 * book; cache the rendered chapters if switching chapters gets slow.
 */
export function renderChapter(
  bytes: Uint8Array,
  block: Block,
): { html: DocumentFragment; css: string; urls: string[] } | null {
  const path = block.epub?.path;
  if (!path) return null;

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (file) => file.name === path || /\.css$/i.test(file.name) });
  } catch {
    return null;
  }
  const src = entries[path];
  if (!src) return null;

  let doc = new DOMParser().parseFromString(strFromU8(src), 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) {
    doc = new DOMParser().parseFromString(strFromU8(src), 'text/html');
  }

  // Each piece of CSS with the path its url() are relative to.
  const sheets: { css: string; base: string }[] = [];
  for (const el of doc.querySelectorAll('link,style')) {
    if (el.localName === 'style') {
      sheets.push({ css: el.textContent ?? '', base: path });
      continue;
    }
    if (!/\bstylesheet\b/i.test(el.getAttribute('rel') ?? '')) continue;
    const sheet = entryPath(el.getAttribute('href') ?? '', path);
    const data = sheet ? entries[sheet] : undefined;
    if (sheet && data) sheets.push({ css: strFromU8(data), base: sheet });
  }

  const media = [...doc.querySelectorAll('img,image')];
  const wanted = new Set<string>();
  for (const { css, base } of sheets) {
    for (const raw of rawUrlsIn(css)) {
      const resource = entryPath(raw, base);
      if (resource) wanted.add(resource);
    }
  }
  for (const el of media) {
    const resource = entryPath(mediaHref(el) ?? '', path);
    if (resource) wanted.add(resource);
  }

  const assets = wanted.size > 0 ? unzipSync(bytes, { filter: (file) => wanted.has(file.name) }) : {};
  const urls: string[] = [];
  const made = new Map<string, string>();
  const blobFor = (resource: string | null): string | null => {
    if (!resource) return null;
    const known = made.get(resource);
    if (known) return known;
    const data = assets[resource];
    if (!data) return null;
    const ext = resource.split('.').pop()?.toLowerCase() ?? '';
    const url = URL.createObjectURL(
      new Blob([data as BlobPart], { type: MEDIA_TYPES[ext] ?? 'application/octet-stream' }),
    );
    made.set(resource, url);
    urls.push(url);
    return url;
  };

  const css = sheets
    .map(({ css: text, base }) =>
      sanitizeCss(text, (raw) => (raw.startsWith('data:') ? raw : blobFor(entryPath(raw, base)))),
    )
    .join('\n');

  doc.querySelectorAll('script,iframe,object,embed,link,style').forEach((el) => el.remove());

  const images = new Set(media);
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name !== 'src' && name !== 'href' && name !== 'xlink:href') continue;
      const value = collapse(attr.value);

      if (images.has(el)) {
        // Images only ever come from the zip: anything else loads from the network.
        const url = blobFor(entryPath(value, path));
        if (url) el.setAttribute(attr.name, url);
        else el.removeAttribute(attr.name);
      } else if (name === 'src' || /^javascript:/i.test(value)) {
        // `href` of a link stays: P1-E AC9 opens a remote one in a new tab instead of navigating.
        el.removeAttribute(attr.name);
      }
    }
  }

  wrapSentences(doc, block);

  const book = doc.createElement('div');
  book.setAttribute('class', 'rm-book');
  const body = doc.body ?? doc.documentElement;
  while (body.firstChild) book.appendChild(body.firstChild);
  const html = doc.createDocumentFragment();
  html.appendChild(book);

  return { html, css, urls };
}

function mediaHref(el: Element): string | null {
  return el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttribute('xlink:href');
}
