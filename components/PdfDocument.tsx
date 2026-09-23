import { useEffect, useState } from 'react';
import BlockList from './BlockList';
import { PdfPicture } from './PdfPage';
import { loadBook } from '../lib/book-assets';
import { pdfPageSizes } from '../lib/pdf';
import type { Block, Cursor, Prefs } from '../lib/types';

interface PdfDocumentProps {
  blocks: Block[];
  cursor: Cursor | null;
  activeTab: Prefs['activeTab'];
  playing: boolean;
  textSize: string;
  scale: number;
  /** Index (in `blocks`) of the page shown. */
  page: number;
}

/**
 * One page of a PDF at a time, as wide as a sheet of the book at the current
 * zoom: only one page is ever drawn, however long the book. The pages before
 * it that have nothing to read (a cover) come with it, drawn as pictures, so
 * they are not lost to the paging, which counts the pages with text.
 */
export default function PdfDocument({
  blocks,
  cursor,
  activeTab,
  playing,
  textSize,
  scale,
  page,
}: PdfDocumentProps) {
  const book = blocks[0]?.pdf?.book;
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }> | null>(null);

  useEffect(() => {
    let alive = true;
    setSizes(null);
    void (async () => {
      const bytes = book ? await loadBook(book) : null;
      const next = bytes && book ? await pdfPageSizes(book, bytes).catch(() => null) : null;
      if (alive) setSizes(next);
    })();
    return () => {
      alive = false;
    };
  }, [book]);

  const block = blocks[page];
  const list = (pageScale: number) => (
    <BlockList
      blocks={blocks}
      cursor={cursor}
      activeTab={activeTab}
      playing={playing}
      textSize={textSize}
      scale={pageScale}
      visible={block?.id}
      bookView
    />
  );
  // The file is gone (or still opening): the page as it is stored.
  if (!sizes || !block?.pdf || !book) return list(scale);

  // Every page as wide as a sheet of the book: a cover stored smaller than
  // the pages is drawn up to their width, as a reader shows it.
  const sheet = Math.max(...sizes.map((size) => size.width));
  const scaleOf = (number: number): number => (scale * sheet) / (sizes[number - 1]?.width ?? sheet);
  const previous = blocks[page - 1]?.pdf?.page ?? 0;
  const pictures = Array.from({ length: block.pdf.page - previous - 1 }, (_, index) => previous + 1 + index);

  return (
    <div className="mx-auto flex max-w-full flex-col gap-4" style={{ width: sheet * scale }}>
      {pictures.map((number) => (
        <PdfPicture key={number} book={book} page={number} scale={scaleOf(number)} />
      ))}
      {list(scaleOf(block.pdf.page))}
    </div>
  );
}
