import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { loadBook } from '../lib/book-assets';
import { sendCommand } from '../lib/messages';
import { drawPdfPage, pdfPageLayout } from '../lib/pdf';
import type { PdfBox } from '../lib/pdf-text';
import { revealElement } from '../lib/scroll';
import type { Block, Cursor } from '../lib/types';

interface Layout {
  width: number;
  height: number;
  boxes: PdfBox[];
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
 * One page of a PDF, drawn as it is, with one clickable area per paragraph: a
 * click focuses the reading there, and the paragraph being read is highlighted.
 * The font size of a PDF cannot change, so `scale` zooms the whole page.
 */
export default function PdfPage({ block, cursor, scale = 1, fallback }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
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

  const active = cursor?.blockId === block.id ? cursor.paraIndex : -1;

  useEffect(() => {
    if (activeRef.current) revealElement(activeRef.current);
  }, [active, layout]);

  if (!layout) return fallback;

  // The areas come from the same grouping as the paragraphs; a mismatch would
  // send the reading to the wrong place, so the page then goes without them.
  const boxes = layout.boxes.length === block.paragraphs.length ? layout.boxes : [];

  return (
    <div
      className="relative mx-auto bg-paper"
      style={{ width: layout.width * scale, height: layout.height * scale }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {boxes.map((box, paraIndex) => (
        <button
          key={block.paragraphs[paraIndex]!.id}
          ref={paraIndex === active ? activeRef : null}
          type="button"
          aria-label={block.paragraphs[paraIndex]!.sentences[0]?.text ?? 'Parágrafo'}
          onClick={() =>
            void sendCommand({
              type: 'seek',
              cursor: { blockId: block.id, paraIndex, sentIndex: 0 },
            })
          }
          className={cn(
            // Multiply keeps the words of the page readable under the wash,
            // the way a marker pen works on paper.
            'absolute cursor-pointer rounded-sm mix-blend-multiply transition-colors',
            paraIndex === active ? 'bg-highlight/70' : 'hover:bg-highlight/30',
          )}
          style={{
            left: box.x * scale,
            top: box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
          }}
        />
      ))}
    </div>
  );
}
