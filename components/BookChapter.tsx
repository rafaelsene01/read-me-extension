import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { loadBook } from '../lib/book-assets';
import { renderChapter } from '../lib/book-render';
import { playAt, sendCommand } from '../lib/messages';
import { revealElement } from '../lib/scroll';
import type { Block, Cursor } from '../lib/types';

type Rendered = ReturnType<typeof renderChapter>;

/**
 * Rules for the sentence spans, injected next to the book's own CSS. They use the
 * theme tokens, which inherit into the shadow tree from `:root`.
 */
const SENTENCE_CSS = `
.rm-s{cursor:pointer;border-radius:.25em}
.rm-s:hover{background:color-mix(in oklch, var(--highlight) 40%, transparent)}
.rm-s.rm-on{background:var(--highlight);color:var(--highlight-foreground)}
`;

interface BookChapterProps {
  block: Block;
  cursor: Cursor | null;
  /** Tailwind font-size class of the text; the documents page zooms with it. */
  textSize?: string;
  /** Shown while the book loads and when it is not available (P1-E AC10). */
  fallback: ReactNode;
}

/**
 * A book chapter with its own HTML and CSS, in a Shadow DOM so the styles of the
 * book cannot reach the rest of the page (P1-E AC2, AC5).
 */
export default function BookChapter({ block, cursor, textSize, fallback }: BookChapterProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // undefined while loading, null when the book is gone: both fall back.
  const [view, setView] = useState<Rendered | undefined>(undefined);

  const book = block.epub?.book;
  const path = block.epub?.path;

  useEffect(() => {
    let alive = true;
    let made: string[] = [];
    setView(undefined);

    void (async () => {
      const bytes = book ? await loadBook(book) : null;
      const rendered = bytes ? renderChapter(bytes, block) : null;
      if (!alive) {
        rendered?.urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      made = rendered?.urls ?? [];
      setView(rendered);
    })();

    return () => {
      alive = false;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
    // The paragraphs of a chapter never change: book chapters are not editable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, book, path]);

  // Fill the shadow root once per rendered chapter, and listen for clicks on it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !view) return;

    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${view.css}\n${SENTENCE_CSS}`;
    root.replaceChildren(style, view.html);

    function onDoubleClick(event: Event) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('a[href]')) return;
      const at = /^(\d+):(\d+)$/.exec(target.closest('.rm-s')?.getAttribute('data-s') ?? '');
      if (at) void playAt({ blockId: block.id, paraIndex: Number(at[1]), sentIndex: Number(at[2]) });
    }

    function onClick(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest('a[href]');
      if (link) {
        // The chapter is not a navigable page: internal links go nowhere and
        // remote ones open in a tab (P1-E AC9).
        event.preventDefault();
        const href = link.getAttribute('href') ?? '';
        if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
        return;
      }

      const at = /^(\d+):(\d+)$/.exec(target.closest('.rm-s')?.getAttribute('data-s') ?? '');
      if (!at) return;
      void sendCommand({
        type: 'seek',
        cursor: { blockId: block.id, paraIndex: Number(at[1]), sentIndex: Number(at[2]) },
      });
    }

    root.addEventListener('click', onClick);
    root.addEventListener('dblclick', onDoubleClick);
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('dblclick', onDoubleClick);
    };
  }, [view, block.id]);

  // The sentence being read is highlighted and kept in view (P1-E AC8).
  const active =
    view && cursor?.blockId === block.id ? `${cursor.paraIndex}:${cursor.sentIndex}` : null;

  useEffect(() => {
    const root = hostRef.current?.shadowRoot;
    if (!root) return;
    root.querySelectorAll('.rm-on').forEach((el) => el.classList.remove('rm-on'));
    if (!active) return;
    // One sentence can be several spans when it crosses inline elements.
    const spans = root.querySelectorAll(`.rm-s[data-s="${active}"]`);
    spans.forEach((el) => el.classList.add('rm-on'));
    if (spans[0]) revealElement(spans[0]);
  }, [view, active]);

  if (!view) return fallback;
  return <div ref={hostRef} className={cn('rounded-md bg-paper p-6 text-paper-foreground', textSize)} />;
}
