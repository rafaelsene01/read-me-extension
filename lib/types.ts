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
  /** Manual voice choice per language. */
  voiceByLang: Record<string, string>;
  activeTab: 'original' | 'translation';
}

export interface PlaybackState {
  playing: boolean;
  cursor: Cursor | null;
  error: string | null;
}

export interface Voice {
  voiceName: string;
  lang: string;
  /** Only remote: false voices are usable; remote voices synthesize off-device. */
  remote: boolean;
}
