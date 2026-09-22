import { CircleAlert, TextSelect } from 'lucide-react';
import BlockList from '../../components/BlockList';
import CaptureBar from '../../components/CaptureBar';
import Controls from '../../components/Controls';
import TranslatePanel from '../../components/TranslatePanel';
import { useReader } from '../../components/useReader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { t, tr } from '../../lib/i18n';

export default function App() {
  const { state, blocks, prefs } = useReader();

  const empty = blocks.length === 0;
  const activeBlock = blocks.find((block) => block.id === state.cursor?.blockId) ?? blocks[0];
  const activeLang = activeBlock?.lang ?? navigator.language;
  const translationLang = activeBlock?.translation?.target ?? prefs?.targetLang ?? activeLang;

  return (
    <TooltipProvider>
      {/* Controls stay put; only the text being read scrolls. */}
      <div className="flex h-screen flex-col gap-3 p-3 text-sm">
        <div className="flex shrink-0 flex-col gap-3">
          {state.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{tr(state.error)}</AlertDescription>
            </Alert>
          )}

          <CaptureBar empty={empty} />

          {prefs && (
            <Controls
              playing={state.playing}
              prefs={prefs}
              tts={state.tts}
              lang={activeLang}
              translationLang={translationLang}
              empty={empty}
            />
          )}

          {prefs && <TranslatePanel blocks={blocks} prefs={prefs} />}
        </div>

        {empty || !prefs ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
              <TextSelect className="size-5" />
            </span>
            <p className="font-serif text-base">{t('Capture um texto para começar.')}</p>
          </div>
        ) : (
          // Small inset so focus rings and card shadows are not clipped by the scroll box.
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            <BlockList
              blocks={blocks}
              cursor={state.cursor}
              activeTab={prefs.activeTab}
              playing={state.playing}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
