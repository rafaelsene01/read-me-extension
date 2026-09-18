import { useEffect, useState } from 'react';
import BlockList from '../../components/BlockList';
import CaptureBar from '../../components/CaptureBar';
import Controls from '../../components/Controls';
import TranslatePanel from '../../components/TranslatePanel';
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px',
        font: '14px/1.5 system-ui, sans-serif',
      }}
    >
      <h1 style={{ font: '600 15px system-ui, sans-serif', margin: 0 }}>TTS Reader</h1>

      {state.error && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          {state.error}
        </p>
      )}

      <CaptureBar empty={empty} />

      {prefs && (
        <Controls
          playing={state.playing}
          prefs={prefs}
          lang={activeLang}
          translationLang={translationLang}
          empty={empty}
        />
      )}

      {prefs && <TranslatePanel blocks={blocks} prefs={prefs} />}

      {empty || !prefs ? (
        <p style={{ color: '#6b7280', margin: 0 }}>Capture um texto para começar.</p>
      ) : (
        <BlockList
          blocks={blocks}
          cursor={state.cursor}
          activeTab={prefs.activeTab}
          playing={state.playing}
        />
      )}
    </div>
  );
}
