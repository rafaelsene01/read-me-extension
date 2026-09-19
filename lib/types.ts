import type { TtsEngineId } from './tts/types';
import type { TtsRuntimeStatus } from './tts/types';

export interface Sentence {
  id: string;
  text: string;
}

export interface Paragraph {
  id: string;
  sentences: Sentence[];
}

export interface Translation {
  target: string;
  text: string;
  paragraphs: Paragraph[];
  /** Hash of Block.text at translation time; differs when the block was edited. */
  sourceTextHash: string;
}

export interface Block {
  /** crypto.randomUUID(), stable for as long as the block exists. */
  id: string;
  sourceUrl: string;
  sourceTitle: string;
  /** documentElement.lang of the captured page, or navigator.language. */
  lang: string;
  /** Raw text, source of truth for editing. */
  text: string;
  /** Derived from text by segmentBlock(). */
  paragraphs: Paragraph[];
  translation?: Translation;
  createdAt: number;
}

export interface Cursor {
  blockId: string;
  paraIndex: number;
  sentIndex: number;
}

export interface Prefs {
  /** 0.5 .. 3.0, default 1.0. */
  rate: number;
  /** Default navigator.language. */
  targetLang: string;
  /** Selected speech engine. Migrated users default to 'system'. */
  ttsEngine: TtsEngineId;
  /** Manual voice choice per language (system engine). */
  voiceByLang: Record<string, string>;
  /** Manual voice choice per engine and language for local engines. */
  voiceByEngine: {
    system: Record<string, string>;
    kokoro: Record<string, string>;
    supertonic: Record<string, string>;
  };
  activeTab: 'original' | 'translation';
  /** Starred voices, as `${engine}:${voiceId}`; listed first in the picker. */
  favoriteVoices: string[];
}

export interface PlaybackState {
  playing: boolean;
  cursor: Cursor | null;
  error: string | null;
  /** Status of the selected engine's model, when a local engine is in use. */
  tts?: TtsRuntimeStatus | null;
}

export interface Voice {
  voiceName: string;
  lang: string;
  /** True for online voices, which synthesize on the vendor's servers. */
  remote: boolean;
}
