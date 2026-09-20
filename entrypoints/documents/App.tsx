import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileAudio,
  FileText,
  Languages,
  Library,
  Save,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import BlockList from '../../components/BlockList';
import Controls from '../../components/Controls';
import AudioList from '../../components/AudioList';
import { languageName } from '../../components/Controls';
import LibraryList from '../../components/LibraryList';
import Mp3Button from '../../components/Mp3Button';
import NewDocumentMenu from '../../components/NewDocumentMenu';
import { useTextDocument } from '../../components/useTextDocument';
import TranslatePanel, { LANGS } from '../../components/TranslatePanel';
import { useReader } from '../../components/useReader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { readingTime, toLibraryDocument } from '../../lib/document';
import { applyLang } from '../../lib/edit';
import { announceReaderPage, sendCommand } from '../../lib/messages';
import { clearBlocks, saveDocument, setBlocks } from '../../lib/storage';
import { cn } from '@/lib/utils';

/** Font sizes of the text, smallest to largest; index 1 is the side panel's size. */
const ZOOM = ['text-sm', 'text-[15px]', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];

/** The same steps for a PDF page, whose font size cannot change: a scale factor. */
const SCALE = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5];

export default function App() {
  const { state, blocks, prefs } = useReader();
  const [tab, setTab] = useState<'file' | 'library' | 'audio'>('file');
  const [zoom, setZoom] = useState(2);
  // Collapsed transport bar: play/pause, speed and the estimate, nothing else.
  const [minimized, setMinimized] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A document being typed in: the header carries no paging and no zoom.
  const [composing, setComposing] = useState(false);
  // Book pages: one block (chapter) at a time when any block carries kinds.
  const [page, setPage] = useState(0);

  useEffect(() => {
    // This page is the reader here: the extension's side panel stays hidden on
    // its tab, and is freed again as soon as the tab goes somewhere else.
    announceReaderPage(true);
    const leave = (): void => announceReaderPage(false);
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);

  // A new document starts at its first page. Declared before the cursor effect
  // so, when both fire together, the cursor's page wins.
  useEffect(() => setPage(0), [blocks[0]?.id]);

  // Another document replaced the buffer: there is nothing being typed any more.
  useEffect(() => {
    if (blocks.length === 0 || blocks[0]!.kinds) setComposing(false);
  }, [blocks[0]?.id]);

  // The page follows the block being read.
  useEffect(() => {
    const index = blocks.findIndex((block) => block.id === state.cursor?.blockId);
    if (index >= 0) setPage(index);
  }, [state.cursor?.blockId]);

  const empty = blocks.length === 0;
  const paged = blocks.some((block) => block.kinds);
  // A PDF is drawn as it is, so the zoom buttons scale the page instead of the font.
  const scaled = blocks.some((block) => block.pdf);
  const current = Math.max(0, Math.min(page, blocks.length - 1));
  const activeBlock = blocks.find((block) => block.id === state.cursor?.blockId) ?? blocks[0];
  const activeLang = activeBlock?.lang ?? navigator.language;
  const translationLang = activeBlock?.translation?.target ?? prefs?.targetLang ?? activeLang;
  const typed = useTextDocument(composing ? blocks[0] : undefined, setSaveError);

  /** One language for the whole document: paging must not change it. */
  async function setLang(lang: string): Promise<void> {
    setSaveError(null);
    const result = await setBlocks(blocks.map((block) => applyLang(block, lang)));
    if (!result.ok) setSaveError('Armazenamento cheio');
  }

  function zoomButton(step: -1 | 1) {
    const what = scaled ? 'zoom' : 'fonte';
    const label = step < 0 ? `Diminuir ${what}` : `Aumentar ${what}`;
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

  function navButton(value: typeof tab, icon: ReactNode, label: string) {
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
      <div className="flex h-screen text-sm">
        <aside className="flex h-screen w-60 shrink-0 flex-col gap-4 border-r bg-muted/40 p-4">
          <h1 className="px-2 font-serif text-base font-semibold">Documentos</h1>
          <NewDocumentMenu
            onOpened={() => setTab('file')}
            onCompose={() => {
              setComposing(true);
              setTab('file');
            }}
          />
          {/* Plain buttons, not Tabs: a vertical Tabs root would stack the nested
              Original/Tradução tabs through its group-data styles. */}
          <nav className="flex flex-col gap-1">
            {navButton('file', <FileText />, 'Arquivo')}
            {navButton('library', <Library />, 'Biblioteca')}
            {navButton('audio', <FileAudio />, 'Áudio')}
          </nav>
        </aside>

        {/* The window never scrolls: the header and the footer are fixed panes and
            only the text between them scrolls, so nothing is read underneath them. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
            {(state.error ?? saveError) && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>{state.error ?? saveError}</AlertDescription>
              </Alert>
            )}

            <div className={cn('flex min-h-0 flex-1 gap-6', tab !== 'file' && 'hidden')}>
              <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                {!empty && (
                  // Outside the scroll area: the title, the page navigation and the
                  // zoom stay put while the document scrolls under them.
                  <header className="flex shrink-0 items-center gap-2 border-b pb-3">
                    {composing ? (
                      <Input
                        value={typed.title}
                        onChange={(event) => typed.setTitle(event.target.value)}
                        placeholder="Sem título"
                        aria-label="Título do documento"
                        className="h-auto flex-1 border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0 md:text-lg"
                      />
                    ) : (
                      <h2 className="flex-1 truncate font-serif text-xl font-semibold tracking-tight">
                        {blocks[0]!.sourceTitle}
                      </h2>
                    )}
                    {paged && !composing && (
                      <>
                        {pageButton(-1)}
                        <span className="text-muted-foreground tabular-nums">
                          {current + 1} / {blocks.length}
                        </span>
                        {pageButton(1)}
                      </>
                    )}
                    <Select
                      value={activeLang}
                      disabled={state.playing}
                      onValueChange={(lang) => void setLang(lang)}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectTrigger size="sm" aria-label="Idioma do texto" className="text-xs">
                            <Languages />
                            <SelectValue />
                          </SelectTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          Idioma do texto: define a voz da leitura e a origem da tradução
                        </TooltipContent>
                      </Tooltip>
                      <SelectContent>
                        {(LANGS.includes(activeLang) ? LANGS : [activeLang, ...LANGS]).map(
                          (lang) => (
                            <SelectItem key={lang} value={lang}>
                              {languageName(lang)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    {!composing && zoomButton(-1)}
                    {!composing && zoomButton(1)}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Salvar na biblioteca"
                          onClick={() => {
                            setSaveError(null);
                            void saveDocument(toLibraryDocument(blocks)).then((result) => {
                              if (!result.ok) setSaveError('Armazenamento cheio');
                            });
                          }}
                        >
                          <Save />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Salvar na biblioteca</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Fechar documento"
                          onClick={() => {
                            void sendCommand({ type: 'stop' }).then(() => clearBlocks());
                          }}
                        >
                          <X />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Fechar documento</TooltipContent>
                    </Tooltip>
                  </header>
                )}
                {empty || !prefs ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
                      <FileText className="size-5" />
                    </span>
                    <p className="font-serif text-base">Importe um documento para começar.</p>
                  </div>
                ) : composing ? (
                  <Textarea
                    value={typed.text}
                    onChange={(event) => typed.setText(event.target.value)}
                    placeholder="Escreva ou cole o texto aqui."
                    aria-label="Conteúdo do documento"
                    className="min-h-0 flex-1 resize-none leading-relaxed"
                  />
                ) : (
                  // The one scroll box of the page; the reading scrolls inside it.
                  // Small inset so focus rings and card shadows are not clipped.
                  <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                    <BlockList
                      blocks={blocks}
                      cursor={state.cursor}
                      activeTab={prefs.activeTab}
                      playing={state.playing}
                      textSize={ZOOM[zoom]}
                      scale={SCALE[zoom]}
                      visible={paged ? blocks[current]!.id : undefined}
                      bookView
                    />
                  </div>
                )}
              </section>

            </div>

            {tab === 'audio' && (
              <section className="-mx-1 flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-1">
                <h2 className="text-lg font-semibold">Áudio</h2>
                <AudioList />
              </section>
            )}

            {tab === 'library' && (
              <section className="-mx-1 flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-1">
                <h2 className="text-lg font-semibold">Biblioteca</h2>
                <LibraryList onOpened={() => setTab('file')} />
              </section>
            )}
          </main>

          {/* Hidden on the library, which has no reading to drive, but kept mounted:
              an MP3 being generated must survive the switch. */}
          {prefs && (
            <footer className={cn('shrink-0 border-t bg-background', tab !== 'file' && 'hidden')}>
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3">
                <Controls
                  playing={state.playing}
                  prefs={prefs}
                  tts={state.tts}
                  lang={activeLang}
                  translationLang={translationLang}
                  empty={empty}
                  readingTime={readingTime(blocks, prefs.rate)}
                  actions={<Mp3Button blocks={blocks} prefs={prefs} compact />}
                  minimized={minimized}
                  onToggleMinimized={() => setMinimized((current) => !current)}
                />
                {/* Under the transport bar: what is read is a choice about the
                    reading, not about the document. */}
                {!minimized && <TranslatePanel blocks={blocks} prefs={prefs} />}
              </div>
            </footer>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
