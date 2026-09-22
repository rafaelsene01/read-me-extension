import { useEffect, useState } from 'react';
import { sendCommand, type StateMessage } from '../lib/messages';
import { blocksKey, getBlocks, getPrefs, SCOPE } from '../lib/storage';
import type { Block, PlaybackState, Prefs } from '../lib/types';

const IDLE: PlaybackState = { playing: false, cursor: null, error: null };

function isStateMessage(value: unknown): value is StateMessage {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { type?: unknown }).type === 'playbackState';
}

export function useReader(): { state: PlaybackState; blocks: Block[]; prefs: Prefs | null } {
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
      if (!isStateMessage(message)) return;
      // The engine reading the other scope's buffer: only its model status
      // (a download in progress) is this UI's business too.
      if (message.scope === SCOPE) setState(message.state);
      else setState((current) => ({ ...current, tts: message.state.tts }));
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
    // Only those two keys: reading advances the cursor once per sentence, and
    // reloading the whole buffer (a book, sometimes) on each of those writes
    // froze the panel while it read.
    const onChanged = (changes: Record<string, unknown>): void => {
      if (changes[blocksKey()] || changes.prefs) load();
    };
    chrome.storage.local.onChanged.addListener(onChanged);
    return () => chrome.storage.local.onChanged.removeListener(onChanged);
  }, []);

  return { state, blocks, prefs };
}
