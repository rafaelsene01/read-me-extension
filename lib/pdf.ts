import { getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LibraryDocument } from './document';
import { groupParagraphs, type PdfParagraph, type TextPiece } from './pdf-text';
import { t } from './i18n';
import { segmentBlock } from './segment';
import type { Block, ParagraphKind } from './types';

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

/** The text runs of a page, in page coordinates at scale 1. */
async function piecesOf(pdf: PDFDocumentProxy, pageNumber: number): Promise<TextPiece[]> {
  const page = await pdf.getPage(pageNumber);
  const { transform } = page.getViewport({ scale: 1 });
  const pieces: TextPiece[] = [];

  for (const item of (await page.getTextContent()).items) {
    if (!('str' in item)) continue;
    const matrix = Util.transform(transform, item.transform);
    const height = Math.hypot(matrix[2]!, matrix[3]!);
    if (height <= 0) continue;
    // matrix[5] is the baseline; glyphs sit roughly 0.8 of the font height above it.
    pieces.push({ text: item.str, x: matrix[4]!, y: matrix[5]! - height * 0.8, width: item.width, height });
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

    const blocks: Block[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const paragraphs = groupParagraphs(await piecesOf(pdf, pageNumber));
      if (paragraphs.length === 0) continue;

      const id = crypto.randomUUID();
      const text = paragraphs.map((paragraph) => paragraph.text).join('\n');
      blocks.push({
        id,
        sourceUrl: t('Página {n}', { n: pageNumber }),
        sourceTitle: title,
        lang: fallbackLang,
        text,
        paragraphs: segmentBlock(text, fallbackLang, id),
        kinds: paragraphs.map((): ParagraphKind => 'p'),
        pdf: { book: blocks[0]?.id ?? id, page: pageNumber },
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

/** Page size at scale 1 and every paragraph of the block, in the same units. */
export async function pdfPageLayout(
  book: string,
  bytes: Uint8Array,
  pageNumber: number,
): Promise<{ width: number; height: number; paragraphs: PdfParagraph[] }> {
  const pdf = await open(book, bytes);
  const page = await pdf.getPage(pageNumber);
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height, paragraphs: groupParagraphs(await piecesOf(pdf, pageNumber)) };
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
