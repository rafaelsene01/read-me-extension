import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Library,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import BlockList from '../../components/BlockList';
import Controls from '../../components/Controls';
import DocumentActions from '../../components/DocumentActions';
import LibraryList from '../../components/LibraryList';
import NewDocumentMenu from '../../components/NewDocumentMenu';
import TranslatePanel from '../../components/TranslatePanel';
import { useReader } from '../../components/useReader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { readingTime } from '../../lib/document';
import { cn } from '@/lib/utils';

/** Font sizes of the text, smallest to largest; index 1 is the side panel's size. */
const ZOOM = ['text-sm', 'text-[15px]', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];

export default function App() {
  const { state, blocks, prefs } = useReader();
  const [tab, setTab] = useState<'file' | 'library'>('file');
  const [zoom, setZoom] = useState(2);
  // Book pages: one block (chapter) at a time when any block carries kinds.
  const [page, setPage] = useState(0);

  useEffect(() => {
    // This page is the reader here: the extension's side panel stays hidden on its tab.
    void chrome.tabs.getCurrent().then((current) => {
      if (current?.id === undefined) return;
      void chrome.sidePanel.setOptions({ tabId: current.id, enabled: false }).catch(() => {});
    });
  }, []);

  // A new document starts at its first page. Declared before the cursor effect
  // so, when both fire together, the cursor's page wins.
  useEffect(() => setPage(0), [blocks[0]?.id]);

  // The page follows the block being read.
  useEffect(() => {
    const index = blocks.findIndex((block) => block.id === state.cursor?.blockId);
    if (index >= 0) setPage(index);
  }, [state.cursor?.blockId]);

  const empty = blocks.length === 0;
  const paged = blocks.some((block) => block.kinds);
  const current = Math.max(0, Math.min(page, blocks.length - 1));
  const activeBlock = blocks.find((block) => block.id === state.cursor?.blockId) ?? blocks[0];
  const activeLang = activeBlock?.lang ?? navigator.language;
  const translationLang = activeBlock?.translation?.target ?? prefs?.targetLang ?? activeLang;

  function zoomButton(step: -1 | 1) {
    const label = step < 0 ? 'Diminuir fonte' : 'Aumentar fonte';
    const next = zoom + step;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label}
            disabled={next < 0 || next >= ZOOM.length}
            onClick={() => setZoom(next)}
          >
            {step < 0 ? <ZoomOut /> : <ZoomIn />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  function pageButton(step: -1 | 1) {
    const label = step < 0 ? 'Página anterior' : 'Próxima página';
    const next = current + step;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label}
            disabled={next < 0 || next >= blocks.length}
            onClick={() => setPage(next)}
          >
            {step < 0 ? <ChevronLeft /> : <ChevronRight />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  function navButton(value: 'file' | 'library', icon: ReactNode, label: string) {
    return (
      <Button
        variant={tab === value ? 'secondary' : 'ghost'}
        className="justify-start"
        aria-current={tab === value ? 'page' : undefined}
        onClick={() => setTab(value)}
      >
        {icon}
        {label}
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen text-sm">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-4 border-r bg-muted/40 p-4">
          <h1 className="px-2 text-base font-semibold">Documentos</h1>
          <NewDocumentMenu onOpened={() => setTab('file')} />
          {/* Plain buttons, not Tabs: a vertical Tabs root would stack the nested
              Original/Tradução tabs through its group-data styles. */}
          <nav className="flex flex-col gap-1">
            {navButton('file', <FileText />, 'Arquivo')}
            {navButton('library', <Library />, 'Biblioteca')}
          </nav>
        </aside>

        {/* The page itself scrolls; the footer sticks to the bottom of the viewport. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex flex-1 flex-col gap-4 p-6">
            {state.error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}

            {/* Kept mounted so an MP3 being generated survives a switch to Biblioteca. */}
            <div className={cn('flex items-start gap-6', tab !== 'file' && 'hidden')}>
              <section className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col gap-3">
                {!empty && (
                  <header className="flex items-center gap-2">
                    <h2 className="flex-1 truncate text-lg font-semibold">
                      {blocks[0]!.sourceTitle}
                    </h2>
                    {paged && (
                      <>
                        {pageButton(-1)}
                        <span className="text-muted-foreground tabular-nums">
                          {current + 1} / {blocks.length}
                        </span>
                        {pageButton(1)}
                      </>
                    )}
                    {zoomButton(-1)}
                    {zoomButton(1)}
                  </header>
                )}
                {empty || !prefs ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <FileText className="size-8 opacity-60" />
                    <p>Importe um documento para começar.</p>
                  </div>
                ) : (
                  <BlockList
                    blocks={blocks}
                    cursor={state.cursor}
                    activeTab={prefs.activeTab}
                    playing={state.playing}
                    textSize={ZOOM[zoom]}
                    visible={paged ? blocks[current]!.id : undefined}
                    bookView
                  />
                )}
              </section>

              {prefs && (
                <aside className="sticky top-6 flex w-72 shrink-0 flex-col gap-4">
                  <DocumentActions blocks={blocks} prefs={prefs} />
                  <TranslatePanel blocks={blocks} prefs={prefs} />
                </aside>
              )}
            </div>

            {tab === 'library' && (
              <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                <h2 className="text-lg font-semibold">Biblioteca</h2>
                <LibraryList onOpened={() => setTab('file')} />
              </section>
            )}
          </main>

          {prefs && (
            <footer className="sticky bottom-0 border-t bg-background">
              <div className="mx-auto w-full max-w-3xl p-3">
                <Controls
                  playing={state.playing}
                  prefs={prefs}
                  tts={state.tts}
                  lang={activeLang}
                  translationLang={translationLang}
                  empty={empty}
                  readingTime={readingTime(blocks, prefs.rate)}
                />
              </div>
            </footer>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
