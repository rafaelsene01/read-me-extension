import type { Cursor, PlaybackState } from './types';
import type { LocalEngineId, TtsEngineId } from './tts/types';

export const COMMAND_TYPES = [
  'play',
  'pause',
  'stop',
  'seek',
  'setRate',
  'setVoice',
  'setTtsEngine',
  'downloadTtsModel',
  'capture',
  'state',
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

/** selection: what the user selected; picker: one clicked element; page: the whole page. */
export type CaptureMode = 'selection' | 'picker' | 'page';

export type Command =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'seek'; cursor: Cursor }
  | { type: 'setRate'; rate: number; commit?: boolean }
  | { type: 'setVoice'; lang: string; voiceName: string }
  | { type: 'setTtsEngine'; engine: TtsEngineId }
  | { type: 'downloadTtsModel'; engine: LocalEngineId }
  | { type: 'capture'; mode: CaptureMode }
  | { type: 'state' };

export interface StateMessage {
  type: 'playbackState';
  state: PlaybackState;
}

export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return COMMAND_TYPES.includes(type as CommandType);
}

export function sendCommand(command: Command): Promise<PlaybackState | null> {
  return chrome.runtime.sendMessage(command);
}

type CommandHandler = (command: Command) => PlaybackState | void | Promise<PlaybackState | void>;

export function onCommand(handler: CommandHandler): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Anything that is not a Command belongs to another listener; ignore it.
    if (!isCommand(message)) return false;

    Promise.resolve(handler(message))
      .then((result) => sendResponse(result ?? null))
      .catch(() => sendResponse(null));
    return true;
  });
}

/** Pushes state to the side panel. Resolves even when no panel is open to receive it. */
export async function broadcastState(state: PlaybackState): Promise<void> {
  const message: StateMessage = { type: 'playbackState', state };
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // "Could not establish connection" is the normal case with the panel closed.
  }
}
