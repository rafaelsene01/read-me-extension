import {
  getDocument,
  GlobalWorkerOptions,
  OPS,
  TextLayer,
  Util,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LibraryDocument } from './document';
import {
  bodySize,
  boilerplate,
  classify,
  groupParagraphs,
  italicFile,
  signature,
  withoutBullet,
  type PdfBox,
  type PdfParagraph,
  type TextPiece,
} from './pdf-text';
import { segmentBlock } from './segment';
import type { Block } from './types';

GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfFailure = 'invalid' | 'encrypted' | 'empty';
export type PdfResult = { ok: true; doc: LibraryDocument } | { ok: false; reason: PdfFailure };

/** How every PDF of the app is opened. */
function options(bytes: Uint8Array): Record<string, unknown> {
  return {
    // pdf.js transfers the buffer to its worker, which detaches it: never hand
    // it the copy the cache is holding on to.
    data: new Uint8Array(bytes),
    // The 14 standard fonts, for the PDFs that embed none (vendored in public/pdf-fonts).
    standardFontDataUrl: chrome.runtime.getURL('pdf-fonts/'),
    isEvalSupported: false,
    // Keeps each font's file after loading it: whether a font is an italic is
    // sometimes only written there (see italicFile).
    fontExtraProperties: true,
    // The .wasm decoders (JBIG2, JPEG 2000, colour management) are not shipped;
    // pdf.js falls back to its JavaScript versions.
    useWasm: false,
  };
}

/** Open documents by book id, so switching pages does not re-parse the file. */
const opened = new Map<string, Promise<PDFDocumentProxy>>();

function open(book: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let pdf = opened.get(book);
  if (!pdf) {
    pdf = getDocument(options(bytes)).promise;
    opened.set(book, pdf);
  }
  return pdf;
}

/** What pdf.js tells of a loaded font. */
interface EmbeddedFont {
  name?: string;
  italic?: boolean;
  /** The font file itself, kept because of fontExtraProperties. */
  data?: Uint8Array;
}

/** Font names that are monospaced: pdf.js calls an embedded Courier New "serif". */
const MONO = /mono|courier|consol|menlo|inconsolata|code/i;

/**
 * The text runs of a page, in page coordinates at scale 1, less the ones in
 * `drop` (the page frame, see boilerplate).
 */
async function piecesOf(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  drop: ReadonlySet<string> = new Set(),
): Promise<TextPiece[]> {
  const page = await pdf.getPage(pageNumber);
  const { transform } = page.getViewport({ scale: 1 });
  const pieces: TextPiece[] = [];
  const { items, styles } = await page.getTextContent();
  // The fonts reach this thread with the operator list; only then is their real name known.
  await page.getOperatorList();
  const fonts = new Map<string, { mono: boolean; italic: boolean }>();
  const fontOf = (fontName: string): { mono: boolean; italic: boolean } => {
    if (!fonts.has(fontName)) {
      let font: EmbeddedFont | null = null;
      try {
        font = page.commonObjs.get(fontName) as EmbeddedFont | null;
      } catch {
        // Not loaded: the generic family below still decides.
      }
      const name = font?.name ?? '';
      fonts.set(fontName, {
        mono: styles[fontName]?.fontFamily === 'monospace' || MONO.test(name),
        italic: Boolean(font?.italic) || /italic|oblique/i.test(name) || italicFile(font?.data),
      });
    }
    return fonts.get(fontName)!;
  };

  for (const item of items) {
    if (!('str' in item)) continue;
    const matrix = Util.transform(transform, item.transform);
    const height = Math.hypot(matrix[2]!, matrix[3]!);
    if (height <= 0) continue;
    // matrix[5] is the baseline; glyphs sit roughly 0.8 of the font height above it.
    const piece = {
      text: item.str,
      x: matrix[4]!,
      y: matrix[5]! - height * 0.8,
      width: item.width,
      height,
      ...fontOf(item.fontName),
    };
    if (!drop.has(signature(piece))) pieces.push(piece);
  }

  return pieces;
}

/** The first page as a small JPEG data URL: the cover of the library card. */
async function coverOf(pdf: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 160 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    // JPEG has no transparency: a page that paints no background would come out black.
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    // A cover is a nicety: a page that will not render must not fail the import.
    return undefined;
  }
}

/**
 * Parse a PDF into a LibraryDocument whose blocks are the pages that carry text.
 * Pages without text (a scan with no OCR) are left out; `block.pdf.page` keeps
 * the real page number, so the render still finds them.
 */
export async function parsePdf(
  bytes: Uint8Array,
  fileName: string,
  fallbackLang: string,
): Promise<PdfResult> {
  const task = getDocument(options(bytes));
  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (error) {
    const name = (error as { name?: string }).name;
    return { ok: false, reason: name === 'PasswordException' ? 'encrypted' : 'invalid' };
  }

  try {
    const metadata = await pdf.getMetadata().catch(() => null);
    const title =
      (metadata?.info as { Title?: string } | undefined)?.Title?.trim() ||
      fileName.replace(/\.pdf$/i, '');

    // Every page first: the frame repeated across pages (a site menu, a running
    // header) and the body size, which tells the headings apart, are the whole
    // document's.
    const all: TextPiece[][] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      all.push(await piecesOf(pdf, pageNumber));
    }
    const frame = new Set(boilerplate(all));
    const pages: Array<{ pageNumber: number; paragraphs: PdfParagraph[]; drop: string[] }> = [];
    all.forEach((pieces, index) => {
      // Each page keeps only its own share of the frame, for the page view to drop too.
      const drop = [...new Set(pieces.map(signature).filter((key) => frame.has(key)))];
      const paragraphs = groupParagraphs(pieces.filter((piece) => !frame.has(signature(piece))));
      if (paragraphs.length > 0) pages.push({ pageNumber: index + 1, paragraphs, drop });
    });
    const body = bodySize(pages.flatMap((page) => page.paragraphs));

    const blocks: Block[] = [];
    for (const { pageNumber, paragraphs, drop } of pages) {
      const id = crypto.randomUUID();
      const kinds = paragraphs.map((paragraph) => classify(paragraph, body));
      // A list item is read without its bullet; the sentences are still found
      // on the page, since they are slices of the paragraph there.
      const text = paragraphs
        .map((paragraph, index) =>
          kinds[index] === 'li' ? withoutBullet(paragraph.text) : paragraph.text,
        )
        .join('\n');
      blocks.push({
        id,
        sourceUrl: `Página ${pageNumber}`,
        sourceTitle: title,
        lang: fallbackLang,
        text,
        paragraphs: segmentBlock(text, fallbackLang, id),
        kinds,
        pdf: {
          book: blocks[0]?.id ?? id,
          page: pageNumber,
          ...(drop.length > 0 ? { drop } : {}),
          ...(kinds.includes('code') ? { indents: indentsOf(paragraphs, kinds) } : {}),
        },
        createdAt: Date.now(),
      });
    }

    if (blocks.length === 0) return { ok: false, reason: 'empty' };
    const cover = await coverOf(pdf);
    return {
      ok: true,
      doc: { id: blocks[0]!.id, name: title, blocks, savedAt: Date.now(), cover },
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  } finally {
    // The pages are extracted once; viewing them opens the file again, from the cache.
    await task.destroy();
  }
}

/**
 * How far each line of code is indented, in characters, from the leftmost
 * line of code on its page; 0 for everything else. Code loses its leading
 * spaces on the way out of a PDF, and its shape is in the indentation.
 */
function indentsOf(paragraphs: PdfParagraph[], kinds: string[]): number[] {
  const code = paragraphs.filter((_, index) => kinds[index] === 'code');
  const left = Math.min(...code.map((paragraph) => paragraph.box.x));
  return paragraphs.map((paragraph, index) =>
    kinds[index] === 'code'
      ? // A monospaced character is about 0.6 of the font size wide.
        Math.max(0, Math.round((paragraph.box.x - left) / (paragraph.size * 0.6)))
      : 0,
  );
}

/** Page size at scale 1 and every paragraph of the block, in the same units. */
export async function pdfPageLayout(
  book: string,
  bytes: Uint8Array,
  pageNumber: number,
  drop: string[] = [],
): Promise<{ width: number; height: number; paragraphs: PdfParagraph[] }> {
  const pdf = await open(book, bytes);
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  const pieces = await piecesOf(pdf, pageNumber, new Set(drop));
  return { width, height, paragraphs: groupParagraphs(pieces) };
}

/** The render in flight per canvas: starting a second one on the same canvas throws. */
const drawing = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();

/** Draw a page into `canvas` at `scale`, sized for the device's pixel ratio. */
export async function drawPdfPage(
  book: string,
  bytes: Uint8Array,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  drawing.get(canvas)?.cancel();

  const pdf = await open(book, bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });

  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const task = page.render({ canvas, viewport });
  drawing.set(canvas, task);
  try {
    await task.promise;
  } catch (error) {
    // A cancelled render is the expected outcome of a zoom or page change.
    if ((error as { name?: string }).name !== 'RenderingCancelledException') throw error;
  }
}

/** Size of every page at scale 1, in order: the room each one takes before it is drawn. */
export async function pdfPageSizes(
  book: string,
  bytes: Uint8Array,
): Promise<Array<{ width: number; height: number }>> {
  const pdf = await open(book, bytes);
  const sizes: Array<{ width: number; height: number }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const { width, height } = (await pdf.getPage(pageNumber)).getViewport({ scale: 1 });
    sizes.push({ width, height });
  }
  return sizes;
}

/** A picture of a page: where it sits (scale 1) and its pixels as a data URL. */
export interface PdfImage {
  box: PdfBox;
  src: string;
}

/** Pictures smaller than this, in page units, are bullets and rules, not figures. */
const MIN_PICTURE = 24;

/** Where the unit square of an image lands on the page under `ctm`. */
function imageBox(ctm: number[]): PdfBox {
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([x, y]) => [ctm[0]! * x! + ctm[2]! * y! + ctm[4]!, ctm[1]! * x! + ctm[3]! * y! + ctm[5]!]);
  const xs = corners.map(([x]) => x!);
  const ys = corners.map(([, y]) => y!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Pictures cut out per page, so scrolling back does not draw a page again. */
const pictures = new Map<string, Promise<PdfImage[]>>();

/**
 * The pictures of a page, top to bottom, each cut out of the page drawn at
 * twice its size. Where they sit comes from walking the page's drawing
 * operations, keeping track of the transform the way the renderer does.
 * Cutting from the drawn page, rather than decoding each image, gets masks,
 * colour spaces and every image format right for free.
 */
export function pdfPageImages(book: string, bytes: Uint8Array, pageNumber: number): Promise<PdfImage[]> {
  const key = `${book}:${pageNumber}`;
  let found = pictures.get(key);
  if (!found) {
    found = cutPictures(book, bytes, pageNumber);
    pictures.set(key, found);
    found.catch(() => pictures.delete(key));
  }
  return found;
}

/** Scale the pages are drawn at for cutting pictures and reading ink colours. */
const DRAWN_SCALE = 2;

/** The last few pages drawn off screen; each is some megabytes of pixels. */
const drawn = new Map<string, Promise<HTMLCanvasElement>>();

/** A page drawn off screen at DRAWN_SCALE, shared by the pictures and the ink colours. */
function drawnPage(book: string, bytes: Uint8Array, pageNumber: number): Promise<HTMLCanvasElement> {
  const key = `${book}:${pageNumber}`;
  let canvas = drawn.get(key);
  if (!canvas) {
    canvas = (async () => {
      const page = await (await open(book, bytes)).getPage(pageNumber);
      const viewport = page.getViewport({ scale: DRAWN_SCALE });
      const element = document.createElement('canvas');
      element.width = Math.round(viewport.width);
      element.height = Math.round(viewport.height);
      await page.render({ canvas: element, viewport, background: '#ffffff' }).promise;
      return element;
    })();
    drawn.set(key, canvas);
    canvas.catch(() => drawn.delete(key));
    // ponytail: keeps the 6 latest; a Map iterates oldest first.
    if (drawn.size > 6) drawn.delete(drawn.keys().next().value!);
  }
  return canvas;
}

/**
 * The colour each box of text is printed in, read off the drawn page: the
 * average of its inked pixels. Only a colour worth keeping comes back (a
 * tip in teal, a title in purple); black and grey text come back null and
 * take the theme's colour, so a dark theme still reads.
 */
export async function pdfTextColors(
  book: string,
  bytes: Uint8Array,
  pageNumber: number,
  boxes: PdfBox[],
): Promise<Array<string | null>> {
  const canvas = await drawnPage(book, bytes, pageNumber);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  return boxes.map((box) => {
    const width = Math.max(1, Math.round(box.width * DRAWN_SCALE));
    const height = Math.max(1, Math.round(box.height * DRAWN_SCALE));
    const { data } = context.getImageData(
      Math.round(box.x * DRAWN_SCALE),
      Math.round(box.y * DRAWN_SCALE),
      width,
      height,
    );
    let r = 0;
    let g = 0;
    let b = 0;
    let inked = 0;
    for (let index = 0; index < data.length; index += 4) {
      // Ink is what is clearly darker than the paper; antialiased edges are left out.
      if (data[index]! + data[index + 1]! + data[index + 2]! > 450) continue;
      r += data[index]!;
      g += data[index + 1]!;
      b += data[index + 2]!;
      inked++;
    }
    if (inked === 0) return null;
    [r, g, b] = [r / inked, g / inked, b / inked];
    return Math.max(r, g, b) - Math.min(r, g, b) > 40
      ? `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
      : null;
  });
}

async function cutPictures(book: string, bytes: Uint8Array, pageNumber: number): Promise<PdfImage[]> {
  const pdf = await open(book, bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const { fnArray, argsArray } = await page.getOperatorList();

  const boxes: PdfBox[] = [];
  let ctm: number[] = viewport.transform;
  const saved: number[][] = [];
  fnArray.forEach((fn, index) => {
    const args = argsArray[index] as unknown[];
    switch (fn) {
      case OPS.save:
        saved.push(ctm);
        break;
      case OPS.restore:
        ctm = saved.pop() ?? ctm;
        break;
      case OPS.transform:
        ctm = Util.transform(ctm, args);
        break;
      case OPS.paintFormXObjectBegin:
        saved.push(ctm);
        if (Array.isArray(args[0])) ctm = Util.transform(ctm, args[0]);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = saved.pop() ?? ctm;
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageXObjectRepeat: {
        const box = imageBox(ctm);
        // Clipped to the page: a bleed image reaches past its edges.
        const x = Math.max(0, box.x);
        const y = Math.max(0, box.y);
        const width = Math.min(viewport.width, box.x + box.width) - x;
        const height = Math.min(viewport.height, box.y + box.height) - y;
        const same = boxes.some(
          (other) => Math.abs(other.x - x) < 2 && Math.abs(other.y - y) < 2 && Math.abs(other.width - width) < 2,
        );
        if (width >= MIN_PICTURE && height >= MIN_PICTURE && !same) boxes.push({ x, y, width, height });
        break;
      }
    }
  });
  if (boxes.length === 0) return [];

  const canvas = await drawnPage(book, bytes, pageNumber);
  const scale = DRAWN_SCALE;

  return boxes
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((box) => {
      const cut = document.createElement('canvas');
      cut.width = Math.round(box.width * scale);
      cut.height = Math.round(box.height * scale);
      cut
        .getContext('2d')!
        .drawImage(canvas, box.x * scale, box.y * scale, cut.width, cut.height, 0, 0, cut.width, cut.height);
      return { box, src: cut.toDataURL('image/png') };
    });
}

/** The text layer being laid out per container: a new one cancels it. */
const layering = new WeakMap<HTMLElement, TextLayer>();

/**
 * Lay the page's text over its drawing, invisible and selectable, the way
 * pdf.js's own viewer does: each run placed and stretched to cover its glyphs.
 */
export async function renderTextLayer(
  book: string,
  bytes: Uint8Array,
  pageNumber: number,
  container: HTMLElement,
  scale: number,
): Promise<void> {
  layering.get(container)?.cancel();
  const pdf = await open(book, bytes);
  const page = await pdf.getPage(pageNumber);
  container.replaceChildren();
  container.style.setProperty('--total-scale-factor', String(scale));
  container.style.setProperty('--scale-round-x', '1px');
  container.style.setProperty('--scale-round-y', '1px');
  const layer = new TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport: page.getViewport({ scale }),
  });
  layering.set(container, layer);
  try {
    await layer.render();
  } catch (error) {
    // Cancelled by a zoom or page change, which lays out a new one.
    if ((error as { name?: string }).name === 'AbortException') return;
    throw error;
  }
  await fitRealFonts(page, container, scale);
}

/**
 * pdf.js sets the text layer in a generic font stretched to each run's width,
 * so the run is right as a whole but the letters inside it drift: a sentence
 * that ends mid-line is highlighted a little short or long. The page's own
 * fonts are already loaded for its drawing, so each run is set in its real
 * font instead and stretched again, which puts every letter where it is drawn.
 */
async function fitRealFonts(page: PDFPageProxy, container: HTMLElement, scale: number): Promise<void> {
  const [{ items }] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  const runs = items.filter((item): item is TextItem => 'str' in item && item.str !== '');
  const spans = [...container.querySelectorAll<HTMLElement>('span:not(.markedContent)')].filter(
    (span) => span.textContent,
  );
  // The layer holds one span per non-empty run, in order; anything else is left alone.
  if (spans.length !== runs.length) return;

  const minFontSize = Number(getComputedStyle(container).getPropertyValue('--min-font-size')) || 1;
  const families = new Map<string, string | null>();
  const familyOf = (fontName: string): string | null => {
    if (!families.has(fontName)) {
      let loaded: string | null = null;
      try {
        loaded = (page.commonObjs.get(fontName) as { loadedName?: string } | null)?.loadedName ?? null;
      } catch {
        // Not loaded: the run keeps pdf.js's font.
      }
      families.set(fontName, loaded && document.fonts.check(`12px "${loaded}"`) ? loaded : null);
    }
    return families.get(fontName)!;
  };

  const fitted: Array<[HTMLElement, TextItem]> = [];
  runs.forEach((run, index) => {
    const span = spans[index]!;
    const family = familyOf(run.fontName);
    if (!family || span.textContent !== run.str) return;
    span.style.fontFamily = `"${family}"`;
    fitted.push([span, run]);
  });
  // Measured after every font is set: one layout pass instead of one per run.
  for (const [span, run] of fitted) {
    const natural = span.offsetWidth;
    if (natural > 0) span.style.setProperty('--scale-x', String((run.width * scale * minFontSize) / natural));
  }
}
