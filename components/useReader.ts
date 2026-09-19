import { useEffect, useState } from 'react';
import { sendCommand, type StateMessage } from '../lib/messages';
import { getBlocks, getPrefs } from '../lib/storage';
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

  return { state, blocks, prefs };
}
