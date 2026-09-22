import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Languages, Pencil, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import BookChapter from './BookChapter';
import { MESSAGES } from './CaptureBar';
import { languageName } from './Controls';
import { LANGS } from './TranslatePanel';
import { applyEdit, applyLang } from '../lib/edit';
import { sendCommand } from '../lib/messages';
import { t, tr } from '../lib/i18n';
import { revealElement } from '../lib/scroll';
import { removeBlock, setBlocks } from '../lib/storage';
import { isStale } from '../lib/translate';
import type { Block, Cursor, Paragraph, ParagraphKind, Prefs } from '../lib/types';

// pdf.js weighs ~900 kB and only a rendered PDF page needs it. Loaded when one
// is actually shown, so it stops riding along in the side panel, which never
// renders a page at all.
const PdfPage = lazy(() => import('./PdfPage'));

interface BlockListProps {
  blocks: Block[];
  cursor: Cursor | null;
  activeTab: Prefs['activeTab'];
  /** Editing is locked while the reading is running. */
  playing: boolean;
  /** Tailwind font-size class of the text; the documents page zooms with it. */
  textSize?: string;
  /** Zoom of a PDF page, whose font size cannot change; 1 is its natural size. */
  scale?: number;
  /** Book pages: render only the block with this id; recordings still cover all blocks. */
  visible?: string;
  /** Documents page: show a chapter with the HTML and CSS of the book when it is available. */
  bookView?: boolean;
}

/**
 * Paragraphs shown for the active tab; null when the block has no translation yet.
 * A book chapter or a PDF page always shows its original: on the translation tab
 * it is only spoken translated, sentence by sentence, and the page itself stays
 * as it is.
 */
function paragraphsFor(block: Block, activeTab: Prefs['activeTab']): Paragraph[] | null {
  if (activeTab === 'original' || block.kinds) return block.paragraphs;
  return block.translation?.paragraphs ?? null;
}

/** Tag for a paragraph: headings keep their level, everything else renders as <p>. */
function kindTag(kind: ParagraphKind): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' {
  return kind === 'quote' || kind === 'li' ? 'p' : kind;
}

/** Visual style of a paragraph kind; sizes in em so they follow the textSize zoom. */
function kindClasses(kind: ParagraphKind): string {
  switch (kind) {
    case 'h1':
      return 'text-[1.6em] font-semibold';
    case 'h2':
      return 'text-[1.4em] font-semibold';
    case 'h3':
      return 'text-[1.2em] font-semibold';
    case 'h4':
    case 'h5':
    case 'h6':
      return 'font-semibold';
    case 'quote':
      return 'border-l-2 pl-4 italic text-muted-foreground';
    case 'li':
      return 'ml-6 list-item list-disc';
    default:
      return '';
  }
}

export default function BlockList({
  blocks,
  cursor,
  activeTab,
  playing,
  textSize = 'text-[15px]',
  scale,
  visible,
  bookView,
}: BlockListProps) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Block[]): Promise<void> {
    const result = await setBlocks(next);
    setError(result.ok ? null : MESSAGES.quota);
  }

  async function persist(block: Block, newText: string): Promise<void> {
    const edited = applyEdit(block, newText);
    if (edited === block) return;
    if (!edited) {
      await removeBlock(block.id);
      return;
    }
    await save(blocks.map((other) => (other.id === block.id ? edited : other)));
  }

  // The page declares the source language and often declares it wrong. The
  // override is per block because a block is one page, and the buffer mixes
  // pages; it lands on block.lang, which is what translation and segmentation
  // already read.
  async function persistLang(block: Block, lang: string): Promise<void> {
    const relanged = applyLang(block, lang);
    if (relanged === block) return;
    await save(blocks.map((other) => (other.id === block.id ? relanged : other)));
  }

  /** The paragraph render, also the fallback of the book view. */
  function kindsView(block: Block, paragraphs: Paragraph[]) {
    return paragraphs.map((paragraph, paraIndex) => {
      const kind = block.kinds?.[paraIndex] ?? 'p';
      const Tag = kindTag(kind);
      return (
        <Tag key={paragraph.id} className={cn('mb-2 last:mb-0', kindClasses(kind))}>
          {paragraph.sentences.map((sentence, sentIndex) => {
            const active =
              block.id === cursor?.blockId &&
              paraIndex === cursor.paraIndex &&
              sentIndex === cursor.sentIndex;
            return (
              <span
                key={sentence.id}
                ref={active ? activeRef : null}
                onClick={() =>
                  void sendCommand({
                    type: 'seek',
                    cursor: { blockId: block.id, paraIndex, sentIndex },
                  })
                }
                className={cn(
                  'scroll-mt-2 cursor-pointer rounded px-0.5 box-decoration-clone transition-colors duration-200',
                  active
                    ? 'bg-highlight text-highlight-foreground'
                    : 'hover:bg-highlight/40',
                )}
              >
                {sentence.text}{' '}
              </span>
            );
          })}
        </Tag>
      );
    });
  }

  // Position, not sentence id: the translation tab has its own ids at the same
  // cursor coordinates.
  const activeKey = cursor ? `${cursor.blockId}:${cursor.paraIndex}:${cursor.sentIndex}` : null;

  // The sentence being read is kept in the middle of the scroll box, and only
  // when it has left it: reading a screenful does not scroll on every sentence.
  useEffect(() => {
    if (activeRef.current) revealElement(activeRef.current);
  }, [activeKey, activeTab]);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tr(error)}</AlertDescription>
        </Alert>
      )}
      {(visible ? blocks.filter((block) => block.id === visible) : blocks).map((block) => {
        const paragraphs = paragraphsFor(block, activeTab);
        // A page of a paged document has nothing left to put in the card header,
        // so the card holds only the content and needs no gap either:
        // which page it is sits in the document header, next to the buttons that
        // change it.
        const bare = bookView && !!block.kinds;
        return (
          <Card key={block.id} className={cn('border bg-card py-3', !bare && 'gap-3')}>
            <CardHeader className={cn('flex items-center gap-1 px-3', bare && 'hidden')}>
              <span
                title={block.sourceUrl}
                className="flex-1 truncate text-xs text-muted-foreground"
              >
                {block.sourceUrl}
              </span>
              {/* On the documents page the language belongs to the whole document and
                  lives in its header, next to the page navigation. */}
              {!bookView && (
                <Select
                  value={block.lang}
                  disabled={playing}
                  onValueChange={(lang) => void persistLang(block, lang)}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectTrigger size="sm" aria-label={t('Idioma do texto')} className="h-7 text-xs">
                        <Languages />
                        <SelectValue />
                      </SelectTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('Idioma do texto: define a voz da leitura e a origem da tradução')}
                    </TooltipContent>
                  </Tooltip>
                  <SelectContent>
                    {(LANGS.includes(block.lang) ? LANGS : [block.lang, ...LANGS]).map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {languageName(lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {activeTab === 'original' &&
                !block.kinds &&
                (editingId === block.id ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        aria-label={t('Concluir edição')}
                        // Keep focus in the editor so its blur (which saves) runs on click, not before it.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
                      >
                        <Check />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Concluir edição')}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('Editar')}
                        disabled={playing}
                        onClick={() => setEditingId(block.id)}
                      >
                        <Pencil />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Editar')}</TooltipContent>
                  </Tooltip>
                ))}
              {/* On the documents page the header closes the whole document instead. */}
              {!bookView && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('Remover')}
                      onClick={() => void removeBlock(block.id)}
                    >
                      <X />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Remover')}</TooltipContent>
                </Tooltip>
              )}
            </CardHeader>

            <CardContent className={cn('px-3 leading-relaxed', textSize)}>
              {activeTab === 'translation' && isStale(block) && (
                <Badge
                  role="status"
                  variant="outline"
                  className="mb-2 border-warning/50 text-warning-foreground"
                >
                  {t('Tradução desatualizada')}
                </Badge>
              )}

              {editingId === block.id ? (
                <div
                  // Uncontrolled on purpose: a controlled contenteditable destroys
                  // the caret and the undo stack on every re-render.
                  contentEditable="plaintext-only"
                  suppressContentEditableWarning
                  ref={(element) => {
                    if (element && document.activeElement !== element) element.focus();
                  }}
                  onBlur={(event) => {
                    const text = event.currentTarget.innerText;
                    setEditingId(null);
                    void persist(block, text);
                  }}
                  className="rounded-md border border-ring p-2 whitespace-pre-wrap outline-none ring-[3px] ring-ring/30"
                >
                  {block.text}
                </div>
              ) : paragraphs === null ? (
                <p className="text-muted-foreground">{t('Bloco ainda não traduzido.')}</p>
              ) : bookView && block.pdf ? (
                // Falls back to the extracted paragraphs when the file is no longer
                // stored, and shows the same while pdf.js is being fetched.
                <Suspense fallback={<>{kindsView(block, paragraphs)}</>}>
                  <PdfPage
                    block={block}
                    cursor={cursor}
                    scale={scale}
                    fallback={kindsView(block, paragraphs)}
                  />
                </Suspense>
              ) : bookView && block.epub ? (
                // Falls back to the paragraphs when the book is not in the cache (P1-E AC10).
                <BookChapter
                  block={block}
                  cursor={cursor}
                  textSize={textSize}
                  fallback={kindsView(block, paragraphs)}
                />
              ) : (
                kindsView(block, paragraphs)
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
