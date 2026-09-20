import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { loadBook } from '../lib/book-assets';
import { sendCommand } from '../lib/messages';
import { drawPdfPage, pdfPageLayout } from '../lib/pdf';
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
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  // undefined while loading, null when the file is gone: both fall back.
  const [layout, setLayout] = useState<Layout | undefined | null>(undefined);

  const book = block.pdf?.book;
  const page = block.pdf?.page;

  useEffect(() => {
    let alive = true;
    setLayout(undefined);
    bytesRef.current = null;

    void (async () => {
      const bytes = book ? await loadBook(book) : null;
      const next =
        bytes && book && page ? await pdfPageLayout(book, bytes, page).catch(() => null) : null;
      if (!alive) return;
      bytesRef.current = bytes;
      setLayout(next);
    })();

    return () => {
      alive = false;
    };
  }, [book, page]);

  // Redraw on zoom: the canvas carries the page's own pixels, not text.
  useEffect(() => {
    const canvas = canvasRef.current;
    const bytes = bytesRef.current;
    if (!canvas || !layout || !bytes || !book || !page) return;
    void drawPdfPage(book, bytes, page, canvas, scale).catch(() => {});
  }, [layout, scale, book, page]);

  // One list of rectangles per sentence, line by line: a sentence that wraps is
  // highlighted over the lines it really covers, not over the whole paragraph.
  // The areas come from the same grouping as the paragraphs; a mismatch would
  // send the reading to the wrong place, so the page then goes without them.
  const boxes = useMemo<PdfBox[][][]>(() => {
    const paragraphs = layout?.paragraphs ?? [];
    if (paragraphs.length !== block.paragraphs.length) return [];
    return paragraphs.map((paragraph, paraIndex) =>
      sentenceBoxes(
        paragraph,
        block.paragraphs[paraIndex]!.sentences.map((sentence) => sentence.text),
      ),
    );
  }, [layout, block.paragraphs]);

  const activeKey =
    cursor?.blockId === block.id ? `${cursor.paraIndex}:${cursor.sentIndex}` : null;

  useEffect(() => {
    if (activeRef.current) revealElement(activeRef.current);
  }, [activeKey, boxes]);

  if (!layout) return fallback;

  return (
    <div
      className="relative mx-auto bg-paper"
      style={{ width: layout.width * scale, height: layout.height * scale }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {boxes.map((paragraph, paraIndex) =>
        paragraph.map((sentence, sentIndex) => {
          if (sentence.length === 0) return null;
          const active = activeKey === `${paraIndex}:${sentIndex}`;
          return (
            // The button spans the page and lets clicks through: only its
            // rectangles take them, so a sentence that wraps is one target.
            <button
              key={block.paragraphs[paraIndex]!.sentences[sentIndex]!.id}
              type="button"
              aria-label={block.paragraphs[paraIndex]!.sentences[sentIndex]!.text}
              onClick={() =>
                void sendCommand({
                  type: 'seek',
                  cursor: { blockId: block.id, paraIndex, sentIndex },
                })
              }
              className="group pointer-events-none absolute inset-0"
            >
              {sentence.map((box, lineIndex) => (
                <span
                  key={lineIndex}
                  ref={active && lineIndex === 0 ? activeRef : null}
                  className={cn(
                    // Multiply keeps the words of the page readable under the wash,
                    // the way a marker pen works on paper.
                    'pointer-events-auto absolute cursor-pointer rounded-sm mix-blend-multiply transition-colors',
                    active
                      ? 'bg-highlight/70'
                      : 'group-hover:bg-highlight/40 group-focus-visible:bg-highlight/40',
                  )}
                  style={{
                    left: box.x * scale,
                    top: box.y * scale,
                    width: box.width * scale,
                    height: box.height * scale,
                  }}
                />
              ))}
            </button>
          );
        }),
      )}
    </div>
  );
}
