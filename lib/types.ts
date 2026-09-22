import type { LocalEngineId, TtsEngineId } from './tts/types';
import type { TtsRuntimeStatus } from './tts/types';
import type { UiLang } from './i18n';

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

export type ParagraphKind = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'quote' | 'li';

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
  /** EPUB chapters only: one kind per paragraph, aligned by index. Its presence marks a book chapter. */
  kinds?: ParagraphKind[];
  /** EPUB chapters only: the book's document id and the chapter's path inside the zip. */
  epub?: { book: string; path: string };
  /** PDF pages only: the file's document id and the page number (1-based). */
  pdf?: { book: string; page: number };
  translation?: Translation;
  createdAt: number;
}

export interface Cursor {
  blockId: string;
  paraIndex: number;
  sentIndex: number;
}

export interface Prefs {
  /** 0.5 .. 2.0, default 1.0. */
  rate: number;
  /** Default navigator.language. Also the default of the settings screen. */
  targetLang: string;
  /** Interface language. Default: the closest one to navigator.language. */
  uiLang: UiLang;
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
  /**
   * When each neural model was last used, by engine. A model nobody has used
   * for a fortnight is dropped from the cache; see staleModels.
   */
  modelUsedAt: Partial<Record<LocalEngineId, number>>;
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
