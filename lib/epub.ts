import { strFromU8, unzipSync } from 'fflate';
import type { LibraryDocument } from './document';
import { segmentBlock } from './segment';
import type { Block, ParagraphKind } from './types';

export type EpubFailure = 'invalid' | 'drm' | 'empty';
export type EpubResult = { ok: true; doc: LibraryDocument } | { ok: false; reason: EpubFailure };

const TEXT_EXT = /\.(xml|opf|xhtml|html|htm)$/i;
export const PARA_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div,dt,dd,figcaption,td,th';

interface ManifestItem {
  path: string;
  mediaType: string;
  properties: string;
}

/** Resolve a package-relative href (decoding %XX) against the OPF folder. */
function resolvePath(href: string, opfPath: string): string {
  return decodeURIComponent(new URL(href, 'http://x/' + opfPath).pathname.replace(/^\//, ''));
}

function firstByLocalName(root: Document | Element, local: string): Element | null {
  for (const el of root.getElementsByTagName('*')) {
    if (el.localName === local) return el;
  }
  return null;
}

/** Match by localName so namespace-prefixed tags (`opf:item`, `enc:CipherReference`) are found. */
function allByLocalName(root: Document | Element, local: string): Element[] {
  return [...root.getElementsByTagName('*')].filter((el) => el.localName === local);
}

function textByLocalName(root: Document | Element, local: string): string | null {
  return firstByLocalName(root, local)?.textContent?.trim() ?? null;
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Leaf paragraph elements (PARA_SELECTOR with no other inside) whose collapsed text is
 * non-empty, in document order: one per extracted paragraph. Remove script/style first.
 */
export function paragraphElements(doc: Document): Element[] {
  return [...doc.querySelectorAll(PARA_SELECTOR)].filter(
    (el) => !el.querySelector(PARA_SELECTOR) && collapse(el.textContent ?? ''),
  );
}

function kindOf(el: Element): ParagraphKind {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return tag as ParagraphKind;
  if (el.closest('blockquote')) return 'quote';
  if (tag === 'li') return 'li';
  return 'p';
}

/** Convert bytes to a base64 data URL, slicing so String.fromCharCode never overflows. */
function toDataUrl(bytes: Uint8Array, mediaType: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 32768) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return `data:${mediaType};base64,${btoa(bin)}`;
}

/**
 * Parse an EPUB file into a LibraryDocument whose blocks are the chapters.
 * Synchronous: runs on the Documents page, which has DOMParser.
 */
export function parseEpub(bytes: Uint8Array, fileName: string, fallbackLang: string): EpubResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter: (file) => TEXT_EXT.test(file.name) });
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const containerSrc = entries['META-INF/container.xml'];
  if (!containerSrc) return { ok: false, reason: 'invalid' };
  const container = new DOMParser().parseFromString(strFromU8(containerSrc), 'application/xml');
  const opfPath = firstByLocalName(container, 'rootfile')?.getAttribute('full-path');
  if (!opfPath) return { ok: false, reason: 'invalid' };

  const opfSrc = entries[opfPath];
  if (!opfSrc) return { ok: false, reason: 'invalid' };
  const opf = new DOMParser().parseFromString(strFromU8(opfSrc), 'application/xml');
  if (opf.querySelector('parsererror')) return { ok: false, reason: 'invalid' };

  const manifest = new Map<string, ManifestItem>();
  for (const item of allByLocalName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (!id || !href) continue;
    manifest.set(id, {
      path: resolvePath(href, opfPath),
      mediaType: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    });
  }

  const spinePaths: string[] = [];
  for (const ref of allByLocalName(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (item) spinePaths.push(item.path);
  }

  const encryptionSrc = entries['META-INF/encryption.xml'];
  if (encryptionSrc) {
    const encryption = new DOMParser().parseFromString(strFromU8(encryptionSrc), 'application/xml');
    for (const cipher of allByLocalName(encryption, 'CipherReference')) {
      const uri = cipher.getAttribute('URI');
      // OCF: encryption.xml URIs are relative to the container root, not the OPF.
      if (uri && spinePaths.includes(resolvePath(uri, ''))) {
        return { ok: false, reason: 'drm' };
      }
    }
  }

  const title = textByLocalName(opf, 'title') ?? fileName.replace(/\.epub$/i, '');
  const lang = textByLocalName(opf, 'language') ?? fallbackLang;

  const blocks: Block[] = [];
  for (const path of spinePaths) {
    const src = entries[path];
    if (!src) continue;

    let chapter = new DOMParser().parseFromString(strFromU8(src), 'application/xhtml+xml');
    if (chapter.querySelector('parsererror')) {
      chapter = new DOMParser().parseFromString(strFromU8(src), 'text/html');
    }
    chapter.querySelectorAll('script,style').forEach((el) => el.remove());

    const lines: string[] = [];
    const kinds: ParagraphKind[] = [];
    let heading: string | null = null;
    for (const el of paragraphElements(chapter)) {
      const text = collapse(el.textContent ?? '');
      if (heading === null && /^h[1-3]$/i.test(el.tagName)) heading = text;
      lines.push(text);
      kinds.push(kindOf(el));
    }
    if (lines.length === 0) continue;

    const id = crypto.randomUUID();
    const text = lines.join('\n');
    blocks.push({
      id,
      sourceUrl: heading ?? `Capítulo ${blocks.length + 1}`,
      sourceTitle: title,
      lang,
      text,
      paragraphs: segmentBlock(text, lang, id),
      kinds,
      epub: { book: blocks[0]?.id ?? id, path },
      createdAt: Date.now(),
    });
  }

  if (blocks.length === 0) return { ok: false, reason: 'empty' };

  let coverItem = [...manifest.values()].find((item) =>
    item.properties.split(/\s+/).includes('cover-image'),
  );
  if (!coverItem) {
    for (const meta of allByLocalName(opf, 'meta')) {
      if (meta.getAttribute('name') === 'cover') {
        coverItem = manifest.get(meta.getAttribute('content') ?? '');
        break;
      }
    }
  }

  let cover: string | undefined;
  if (coverItem && coverItem.mediaType.startsWith('image/')) {
    const image = unzipSync(bytes, { filter: (file) => file.name === coverItem.path })[coverItem.path];
    if (image) cover = toDataUrl(image, coverItem.mediaType);
  }

  return {
    ok: true,
    doc: { id: blocks[0]!.id, name: title, blocks, savedAt: Date.now(), cover },
  };
}
