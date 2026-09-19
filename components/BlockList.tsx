import { useEffect, useRef, useState } from 'react';
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
import { MESSAGES } from './CaptureBar';
import { languageName } from './Controls';
import { LANGS } from './TranslatePanel';
import { applyEdit, applyLang } from '../lib/edit';
import { sendCommand } from '../lib/messages';
import { removeBlock, setBlocks } from '../lib/storage';
import { isStale } from '../lib/translate';
import type { Block, Cursor, Paragraph, Prefs } from '../lib/types';

interface BlockListProps {
  blocks: Block[];
  cursor: Cursor | null;
  activeTab: Prefs['activeTab'];
  /** Editing is locked while the reading is running. */
  playing: boolean;
  /** Tailwind font-size class of the text; the documents page zooms with it. */
  textSize?: string;
}

/** Paragraphs shown for the active tab; null when the block has no translation yet. */
function paragraphsFor(block: Block, activeTab: Prefs['activeTab']): Paragraph[] | null {
  if (activeTab === 'original') return block.paragraphs;
  return block.translation?.paragraphs ?? null;
}

export default function BlockList({
  blocks,
  cursor,
  activeTab,
  playing,
  textSize = 'text-[15px]',
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

  // Position, not sentence id: the translation tab has its own ids at the same
  // cursor coordinates.
  const activeKey = cursor ? `${cursor.blockId}:${cursor.paraIndex}:${cursor.sentIndex}` : null;

  // The sentence being read is pinned to the top of the scroll box.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [activeKey, activeTab]);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {blocks.map((block) => {
        const paragraphs = paragraphsFor(block, activeTab);
        return (
          <Card key={block.id} className="gap-3 py-3">
            <CardHeader className="flex items-center gap-1 px-3">
              <span
                title={block.sourceUrl}
                className="flex-1 truncate text-xs text-muted-foreground"
              >
                {block.sourceUrl}
              </span>
              <Select
                value={block.lang}
                disabled={playing}
                onValueChange={(lang) => void persistLang(block, lang)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SelectTrigger size="sm" aria-label="Idioma do texto" className="h-7 text-xs">
                      <Languages />
                      <SelectValue />
                    </SelectTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Idioma do texto: define a voz da leitura e a origem da tradução</TooltipContent>
                </Tooltip>
                <SelectContent>
                  {(LANGS.includes(block.lang) ? LANGS : [block.lang, ...LANGS]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {languageName(lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeTab === 'original' &&
                (editingId === block.id ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        aria-label="Concluir edição"
                        // Keep focus in the editor so its blur (which saves) runs on click, not before it.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
                      >
                        <Check />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Concluir edição</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar"
                        disabled={playing}
                        onClick={() => setEditingId(block.id)}
                      >
                        <Pencil />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Editar</TooltipContent>
                  </Tooltip>
                ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover"
                    onClick={() => void removeBlock(block.id)}
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remover</TooltipContent>
              </Tooltip>
            </CardHeader>

            <CardContent className={cn('px-3 leading-relaxed', textSize)}>
              {activeTab === 'translation' && isStale(block) && (
                <Badge
                  role="status"
                  variant="outline"
                  className="mb-2 border-amber-500/50 text-amber-600 dark:text-amber-400"
                >
                  Tradução desatualizada
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
                <p className="text-muted-foreground">Bloco ainda não traduzido.</p>
              ) : (
                paragraphs.map((paragraph, paraIndex) => (
                  <p key={paragraph.id} className="mb-2 last:mb-0">
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
                            'scroll-mt-2 cursor-pointer rounded px-0.5 box-decoration-clone transition-colors',
                            active ? 'bg-highlight' : 'hover:bg-muted',
                          )}
                        >
                          {sentence.text}{' '}
                        </span>
                      );
                    })}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
