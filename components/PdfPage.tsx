import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { loadBook } from '../lib/book-assets';
import { playAt, sendCommand } from '../lib/messages';
import {
  drawPdfPage,
  pdfPageImages,
  pdfPageLayout,
  pdfTextColors,
  renderTextLayer,
  type PdfImage,
} from '../lib/pdf';
import { sentenceBoxes, type PdfBox, type PdfParagraph } from '../lib/pdf-text';
import { revealElement } from '../lib/scroll';
import type { Block, Cursor } from '../lib/types';

interface Layout {
  width: number;
  height: number;
  paragraphs: PdfParagraph[];
}

interface PdfPageProps {
  block: Block;
  cursor: Cursor | null;
  /** Zoom of the page; 1 is its natural size. */
  scale?: number;
  /** Shown while the file loads and when it is no longer stored. */
  fallback: ReactNode;
}

/**
 * One page of a PDF, drawn as it is, with one clickable area per sentence: a
 * click focuses the reading there, and the sentence being read is highlighted.
 * The font size of a PDF cannot change, so `scale` zooms the whole page.
 */
export default function PdfPage({ block, cursor, scale = 1, fallback }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  /** Sentence rectangles measured on the laid-out text; null until it is laid out. */
  const [measured, setMeasured] = useState<PdfBox[][][] | null>(null);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  // undefined while loading, null when the file is gone: both fall back.
  const [layout, setLayout] = useState<Layout | undefined | null>(undefined);

  const book = block.pdf?.book;
  const page = block.pdf?.page;
  const drop = block.pdf?.drop;

  useEffect(() => {
    let alive = true;
    setLayout(undefined);
    bytesRef.current = null;

    void (async () => {
      const bytes = book ? await loadBook(book) : null;
      const next =
        bytes && book && page
          ? await pdfPageLayout(book, bytes, page, drop).catch(() => null)
          : null;
      if (!alive) return;
      bytesRef.current = bytes;
      setLayout(next);
    })();

    return () => {
      alive = false;
    };
    // drop is set once at import and never changes for a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, page]);

  // Redraw on zoom: the canvas carries the page's own pixels, not text.
  useEffect(() => {
    const canvas = canvasRef.current;
    const bytes = bytesRef.current;
    if (!canvas || !layout || !bytes || !book || !page) return;
    void drawPdfPage(book, bytes, page, canvas, scale).catch(() => {});
    const layer = textRef.current;
    if (!layer) return;
    setMeasured(null);
    void renderTextLayer(book, bytes, page, layer, scale)
      .then(() =>
        setMeasured(
          measureSentences(
            layer,
            scale,
            block.paragraphs.map((paragraph) => paragraph.sentences.map((sentence) => sentence.text)),
          ),
        ),
      )
      .catch(() => {});
    // The sentences change only with the page, which the layout already follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, scale, book, page]);

  // One list of rectangles per sentence, line by line: a sentence that wraps is
  // highlighted over the lines it really covers, not over the whole paragraph.
  // The areas come from the same grouping as the paragraphs; a mismatch would
  // send the reading to the wrong place, so the page then goes without them.
  const estimated = useMemo<PdfBox[][][]>(() => {
    const paragraphs = layout?.paragraphs ?? [];
    if (paragraphs.length !== block.paragraphs.length) return [];
    return paragraphs.map((paragraph, paraIndex) =>
      sentenceBoxes(
        paragraph,
        block.paragraphs[paraIndex]!.sentences.map((sentence) => sentence.text),
      ),
    );
  }, [layout, block.paragraphs]);
  // The measured rectangles end on the sentence's last glyph; the estimate
  // (interpolated along each run) stands in until the text is laid out.
  const boxes = measured ?? estimated;

  const activeKey =
    cursor?.blockId === block.id ? `${cursor.paraIndex}:${cursor.sentIndex}` : null;

  useEffect(() => {
    if (activeRef.current) revealElement(activeRef.current);
  }, [activeKey, boxes]);

  if (!layout) return fallback;

  /** The sentence under a point of the page, as "paragraph:sentence". */
  function sentenceAt(event: MouseEvent<HTMLDivElement>): string | null {
    const frame = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - frame.left) / scale;
    const y = (event.clientY - frame.top) / scale;
    for (const [paraIndex, paragraph] of boxes.entries()) {
      for (const [sentIndex, sentence] of paragraph.entries()) {
        const inside = sentence.some(
          (box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height,
        );
        if (inside) return `${paraIndex}:${sentIndex}`;
      }
    }
    return null;
  }

  function cursorOf(key: string): Cursor {
    const [paraIndex, sentIndex] = key.split(':').map(Number);
    return { blockId: block.id, paraIndex: paraIndex!, sentIndex: sentIndex! };
  }

  return (
    <div
      className="relative mx-auto bg-paper"
      style={{ width: layout.width * scale, height: layout.height * scale }}
      // The text layer lies on top, so the page's text selects like any text;
      // a click that selected nothing is a click on a sentence.
      onMouseMove={(event) => setHovered(sentenceAt(event))}
      onMouseLeave={() => setHovered(null)}
      onClick={(event) => {
        if (!window.getSelection()?.isCollapsed) return;
        const key = sentenceAt(event);
        if (key) void sendCommand({ type: 'seek', cursor: cursorOf(key) });
      }}
      onDoubleClick={(event) => {
        const key = sentenceAt(event);
        if (key) void playAt(cursorOf(key));
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {/* Under the text layer: the highlights never take a click or a selection. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {boxes.map((paragraph, paraIndex) =>
          paragraph.map((sentence, sentIndex) => {
            const key = `${paraIndex}:${sentIndex}`;
            const active = activeKey === key;
            if (!active && hovered !== key) return null;
            return sentence.map((box, lineIndex) => (
              <span
                key={`${key}:${lineIndex}`}
                ref={active && lineIndex === 0 ? activeRef : null}
                className={cn(
                  // Multiply keeps the words of the page readable under the wash,
                  // the way a marker pen works on paper.
                  'absolute rounded-sm mix-blend-multiply transition-colors',
                  active ? 'bg-highlight/70' : 'bg-highlight/40',
                )}
                style={{
                  left: box.x * scale,
                  top: box.y * scale,
                  width: box.width * scale,
                  height: box.height * scale,
                }}
              />
            ));
          }),
        )}
      </div>
      <div ref={textRef} className="textLayer" />
      {/* The keyboard way in: one invisible button per sentence, in reading order. */}
      <div className="sr-only">
        {boxes.map((paragraph, paraIndex) =>
          paragraph.map((sentence, sentIndex) =>
            sentence.length === 0 ? null : (
              <button
                key={block.paragraphs[paraIndex]!.sentences[sentIndex]!.id}
                type="button"
                onClick={() => void sendCommand({ type: 'seek', cursor: cursorOf(`${paraIndex}:${sentIndex}`) })}
              >
                {block.paragraphs[paraIndex]!.sentences[sentIndex]!.text}
              </button>
            ),
          ),
        )}
      </div>
    </div>
  );
}

/**
 * A page drawn as it is, with nothing to read on it: the cover of a book, a
 * scanned page. The text view shows it too, since it is all the page holds.
 */
export function PdfPicture({ book, page, scale = 1 }: { book: string; page: number; scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const bytes = await loadBook(book);
      const layout = bytes ? await pdfPageLayout(book, bytes, page).catch(() => null) : null;
      if (!alive || !bytes || !layout) return;
      setSize({ width: layout.width, height: layout.height });
      if (canvasRef.current) await drawPdfPage(book, bytes, page, canvasRef.current, scale).catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [book, page, scale]);

  return (
    <div
      className="mx-auto max-w-full bg-paper"
      style={size ? { width: size.width * scale, aspectRatio: `${size.width} / ${size.height}` } : undefined}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/** What the text view takes from the page itself, beyond the stored text. */
interface Reflowed {
  images: PdfImage[];
  paragraphs: PdfParagraph[];
  /** Printed colour of each paragraph, when it is one worth keeping. */
  colors: Array<string | null>;
}

/**
 * The text of a PDF page with its pictures put back where they sat, and the
 * look the page gives its paragraphs: italics, and a colour when the page
 * prints one (a tip in teal). A picture beside the first line of a paragraph
 * (a tip's lightbulb) floats at its left, with the text running past it, as on
 * the page; any other goes before the first paragraph that starts below it.
 * `paragraphs` are the rendered paragraphs of the block, in the page's order.
 */
export function PdfReflow({ block, paragraphs }: { block: Block; paragraphs: ReactNode[] }) {
  const [page, setPage] = useState<Reflowed | null>(null);
  const book = block.pdf?.book;
  const number = block.pdf?.page;

  useEffect(() => {
    let alive = true;
    setPage(null);
    void (async () => {
      const bytes = book ? await loadBook(book) : null;
      if (!bytes || !book || !number) return;
      const [images, layout] = await Promise.all([
        pdfPageImages(book, bytes, number).catch(() => []),
        pdfPageLayout(book, bytes, number, block.pdf?.drop).catch(() => null),
      ]);
      const laid = layout?.paragraphs ?? [];
      const colors = await pdfTextColors(book, bytes, number, laid.map((paragraph) => paragraph.box)).catch(
        () => [],
      );
      if (alive) setPage({ images, paragraphs: laid, colors });
    })();
    return () => {
      alive = false;
    };
    // drop is set once at import and never changes for a page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, number]);

  if (!page) return <>{paragraphs}</>;

  // A layout that does not match the stored paragraphs gives no positions and
  // no looks: the pictures then go after the text rather than in a wrong place.
  const laid = page.paragraphs.length === paragraphs.length ? page.paragraphs : [];
  const floats = new Map<number, PdfImage[]>();
  const before = new Map<number, PdfImage[]>();
  const after: PdfImage[] = [];
  for (const image of page.images) {
    const beside = laid.findIndex((paragraph) => besideFirstLine(image, paragraph));
    const below = laid.findIndex((paragraph) => image.box.y <= paragraph.box.y);
    if (beside >= 0) floats.set(beside, [...(floats.get(beside) ?? []), image]);
    else if (below >= 0) before.set(below, [...(before.get(below) ?? []), image]);
    else after.push(image);
  }

  const out: ReactNode[] = [];
  paragraphs.forEach((paragraph, index) => {
    for (const image of before.get(index) ?? []) out.push(picture(image));
    for (const image of floats.get(index) ?? []) out.push(picture(image, true));
    const look = laid[index];
    const code = block.kinds?.[index] === 'code';
    const color = code ? null : page.colors[index];
    out.push(
      look && isValidElement<{ className?: string; style?: CSSProperties }>(paragraph)
        ? cloneElement(paragraph, {
            className: cn(
              paragraph.props.className,
              look.italic && !code && 'italic',
              // The paragraph after a floated picture starts under it.
              floats.has(index - 1) && 'clear-left',
            ),
            style: color ? { ...paragraph.props.style, color } : paragraph.props.style,
          })
        : paragraph,
    );
  });
  for (const image of after) out.push(picture(image));
  return <>{out}</>;
}

/** The picture sits left of the paragraph's first line, level with it: an icon the line runs past. */
function besideFirstLine(image: PdfImage, paragraph: PdfParagraph): boolean {
  const line = paragraph.lines[0];
  const start = line?.spans[0]?.x;
  if (!line || start === undefined) return false;
  const overlaps = image.box.y < line.bottom && image.box.y + image.box.height > line.top;
  return overlaps && image.box.x + image.box.width <= start + 2;
}

function picture(image: PdfImage, float = false) {
  return (
    <img
      key={`${image.box.x},${image.box.y}`}
      src={image.src}
      alt=""
      className={cn('h-auto max-w-full rounded-sm', float ? 'float-left mt-0.5 mr-2' : 'my-3')}
      // Its size on the page, so a small icon stays small and a figure fits the column.
      width={Math.round(image.box.width)}
      height={Math.round(image.box.height)}
    />
  );
}

/** Left out when matching a sentence to the laid-out text: spacing, and the hyphens a line break adds or takes. */
const LOOSE = /[\s\-\u00ad]/;

/**
 * Where each sentence really is on the page, measured on the text layer: the
 * sentence is found in the laid-out text and a DOM Range over it gives the
 * rectangles of its own glyphs, so a highlight starts on its first letter and
 * stops on its full stop, question or exclamation mark. Rectangles are merged
 * line by line, in page units. A sentence not found gets none.
 */
function measureSentences(layer: HTMLElement, scale: number, sentences: string[][]): PdfBox[][][] {
  const chars: Array<{ node: Text; offset: number }> = [];
  let flat = '';
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node as Text).data;
    for (let offset = 0; offset < text.length; offset++) {
      if (LOOSE.test(text[offset]!)) continue;
      flat += text[offset];
      chars.push({ node: node as Text, offset });
    }
  }

  const frame = layer.getBoundingClientRect();
  let from = 0;
  return sentences.map((paragraph) =>
    paragraph.map((sentence) => {
      const needle = [...sentence].filter((char) => !LOOSE.test(char)).join('');
      if (!needle) return [];
      // In reading order first; the text layer can hold the runs in another order.
      let at = flat.indexOf(needle, from);
      if (at < 0) at = flat.indexOf(needle);
      if (at < 0) return [];
      from = at + needle.length;

      const start = chars[at]!;
      const end = chars[at + needle.length - 1]!;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);

      const lines: PdfBox[] = [];
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const box = {
          x: (rect.left - frame.left) / scale,
          y: (rect.top - frame.top) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        };
        const line = lines.find(
          (other) => Math.abs(other.y + other.height / 2 - (box.y + box.height / 2)) < other.height / 2,
        );
        if (!line) {
          lines.push(box);
          continue;
        }
        const right = Math.max(line.x + line.width, box.x + box.width);
        const bottom = Math.max(line.y + line.height, box.y + box.height);
        line.x = Math.min(line.x, box.x);
        line.y = Math.min(line.y, box.y);
        line.width = right - line.x;
        line.height = bottom - line.y;
      }
      return lines;
    }),
  );
}
