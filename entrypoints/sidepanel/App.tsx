import { useEffect, useState } from 'react';
import { CircleAlert, TextSelect } from 'lucide-react';
import BlockList from '../../components/BlockList';
import CaptureBar from '../../components/CaptureBar';
import Controls from '../../components/Controls';
import TranslatePanel from '../../components/TranslatePanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { sendCommand, type StateMessage } from '../../lib/messages';
import { getBlocks, getPrefs } from '../../lib/storage';
import type { Block, PlaybackState, Prefs } from '../../lib/types';

const IDLE: PlaybackState = { playing: false, cursor: null, error: null };

function isStateMessage(value: unknown): value is StateMessage {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { type?: unknown }).type === 'playbackState';
}

export default function App() {
  const [state, setState] = useState<PlaybackState>(IDLE);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    // The panel opens knowing nothing: ask the background, then follow its
    // broadcasts. Speech keeps running while the panel is closed.
    void sendCommand({ type: 'state' }).then((current) => {
      if (current) setState(current);
    });

    const onMessage = (message: unknown): void => {
      if (isStateMessage(message)) setState(message.state);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  useEffect(() => {
    const load = (): void => {
      void getBlocks().then(setBlocks);
      void getPrefs().then(setPrefs);
    };
    load();
    // Blocks and prefs are written by the background too, so follow the store.
    chrome.storage.local.onChanged.addListener(load);
    return () => chrome.storage.local.onChanged.removeListener(load);
  }, []);

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
              <AlertDescription>{state.error}</AlertDescription>
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
            <TextSelect className="size-8 opacity-60" />
            <p>Capture um texto para começar.</p>
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
