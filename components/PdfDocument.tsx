import { useEffect, useRef, useState, type ReactNode } from 'react';
import BlockList from './BlockList';
import { PdfPicture } from './PdfPage';
import { loadBook } from '../lib/book-assets';
import { pdfPageSizes } from '../lib/pdf';
import { revealElement } from '../lib/scroll';
import type { Block, Cursor, Prefs } from '../lib/types';

interface PdfDocumentProps {
  blocks: Block[];
  cursor: Cursor | null;
  activeTab: Prefs['activeTab'];
  playing: boolean;
  /** The text view: headings, paragraphs, code and pictures instead of the drawn pages. */
  reflow: boolean;
  textSize: string;
  scale: number;
  /** Index (in `blocks`) of the page to bring into view; followed only when it changes. */
  page: number;
  /** The page at the top of the view changed, by index in `blocks`. */
  onPage: (index: number) => void;
}

/** How far outside the view a page is still drawn, so scrolling finds it ready. */
const NEAR = '1500px 0px';

/**
 * Every page of a PDF, one under the other, the way a PDF reader shows it —
 * including the pages with nothing to read (a cover), shown as pictures. Only
 * the pages near the view are drawn: a drawn page holds megabytes of pixels,
 * and a book has hundreds. The others keep their room, so the scroll bar and
 * the position in the book stay true.
 */
export default function PdfDocument({
  blocks,
  cursor,
  activeTab,
  playing,
  reflow,
  textSize,
  scale,
  page,
  onPage,
}: PdfDocumentProps) {
  const book = blocks[0]?.pdf?.book;
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }> | null>(null);
  const [near, setNear] = useState<ReadonlySet<number>>(new Set());
  /** Pages the text view has shown once: kept, so the text never shifts back above the reader. */
  const seen = useRef(new Set<number>());
  const pageRefs = useRef(new Map<number, HTMLElement>());
  /** The page last reported at the top: a `page` equal to it needs no scroll. */
  const reported = useRef(page);

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

  const byPage = new Map(blocks.map((block, index) => [block.pdf!.page, { block, index }]));

  // Which pages are close to the view.
  useEffect(() => {
    if (!sizes) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setNear((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const number = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(number);
            else next.delete(number);
          }
          return next;
        }),
      { rootMargin: NEAR },
    );
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sizes]);

  // Which page sits at the top of the view, for the page counter.
  useEffect(() => {
    if (!sizes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const found = byPage.get(Number((entry.target as HTMLElement).dataset.page));
          if (found && found.index !== reported.current) {
            reported.current = found.index;
            onPage(found.index);
          }
        }
      },
      // A thin band a third of the way down the view.
      { rootMargin: '-33% 0px -66% 0px' },
    );
    pageRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
    // byPage and onPage follow blocks and the parent's setter, which the sizes already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes]);

  // The page buttons (and the reading moving on) ask for a page: bring it in.
  // A page drawn already reveals its own sentence; this only covers the trip.
  useEffect(() => {
    if (page === reported.current) return;
    const number = blocks[page]?.pdf?.page;
    const element = number ? pageRefs.current.get(number) : undefined;
    if (!element) return;
    reported.current = page;
    element.scrollIntoView({ block: 'start' });
    // blocks only matters through the page it points at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sizes]);

  // The reading left the view (it is on a page that is not drawn): follow it there.
  useEffect(() => {
    const number = blocks.find((block) => block.id === cursor?.blockId)?.pdf?.page;
    const element = number ? pageRefs.current.get(number) : undefined;
    if (number && element && !near.has(number)) revealElement(element);
    // Only a move to another block is a trip; the sentences within it are the page's own business.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor?.blockId]);

  if (!sizes) {
    // The file is gone (or still opening): the text of every page, as the fallback.
    return (
      <BlockList
        blocks={blocks}
        cursor={cursor}
        activeTab={activeTab}
        playing={playing}
        textSize={textSize}
        bookView
        reflow
      />
    );
  }

  // Every page as wide as a sheet of the book: a cover stored smaller than
  // the pages is drawn up to their width, as a reader shows it.
  const sheet = Math.max(...sizes.map((size) => size.width));

  return (
    <div className="flex flex-col gap-4">
      {sizes.map((size, index) => {
        const number = index + 1;
        const pageScale = (scale * sheet) / size.width;
        const found = byPage.get(number);
        if (reflow && near.has(number)) seen.current.add(number);
        const shown = reflow ? seen.current.has(number) : near.has(number);

        let content: ReactNode = null;
        if (shown) {
          content = found ? (
            <BlockList
              blocks={blocks}
              cursor={cursor}
              activeTab={activeTab}
              playing={playing}
              textSize={textSize}
              scale={pageScale}
              visible={found.block.id}
              bookView
              reflow={reflow}
            />
          ) : book ? (
            <PdfPicture book={book} page={number} scale={pageScale} />
          ) : null;
        }

        return (
          <section
            key={number}
            data-page={number}
            ref={(element) => {
              if (element) pageRefs.current.set(number, element);
              else pageRefs.current.delete(number);
            }}
            // As wide as a sheet at the current zoom, in both views: the text view
            // reads in the page's own measure and only grows with the zoom buttons.
            // Room kept for a page that is not drawn: its own height on the drawn
            // view, a guess on the text view (the text takes what it takes).
            className="mx-auto max-w-full"
            style={{
              width: sheet * scale,
              ...(shown ? {} : { height: reflow ? 600 : size.height * pageScale + 24 }),
            }}
          >
            {content}
          </section>
        );
      })}
    </div>
  );
}
