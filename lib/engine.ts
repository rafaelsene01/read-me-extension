import { firstCursor, nextCursor, reconcile, sentenceAt } from './cursor';
import { chunkSentence } from './segment';
import type { Block, Cursor, PlaybackState, Prefs } from './types';

/** chrome.tts refuses an utterance longer than this. */
export const TTS_MAX_CHARS = 32_000;

export interface SpeakOptions {
  lang: string;
  rate: number;
  voiceName?: string;
}

export interface EngineTts {
  speak(utterance: string, options: SpeakOptions): void | Promise<void>;
  stop(): void;
}

export interface EngineStorage {
  getBlocks(): Promise<Block[]>;
  getCursor(): Promise<Cursor | null>;
  setCursor(cursor: Cursor | null): Promise<void>;
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
}

export interface TtsEvent {
  type: string;
  errorMessage?: string;
}

/**
 * Blocks as the active tab presents them: on the translation tab a translated
 * block speaks its translation, in the target language. Ids are kept, so a
 * cursor stays valid across a tab switch.
 */
export function viewOf(blocks: Block[], activeTab: Prefs['activeTab']): Block[] {
  if (activeTab === 'original') return blocks;
  return blocks.map((block) =>
    block.translation
      ? { ...block, paragraphs: block.translation.paragraphs, lang: block.translation.target }
      : block,
  );
}

export interface EngineDeps {
  tts: EngineTts;
  storage: EngineStorage;
  broadcast: (state: PlaybackState) => void | Promise<void>;
}

export interface Engine {
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(cursor: Cursor): Promise<void>;
  setRate(rate: number): Promise<void>;
  setVoice(lang: string, voiceName: string): Promise<void>;
  /** Called after the buffer changes so a dangling cursor is repositioned. */
  blocksChanged(): Promise<void>;
  onTtsEvent(event: TtsEvent): Promise<void>;
  getState(): Promise<PlaybackState>;
}

export function createEngine({ tts, storage, broadcast }: EngineDeps): Engine {
  let playing = false;
  let error: string | null = null;
  /** Set before we stop the engine ourselves, so the resulting event is not reported. */
  let expectInterrupt = false;
  /** Last buffer seen, used to find the block that followed a removed one. */
  let lastBlocks: Block[] | undefined;
  /**
   * Remaining pieces of a sentence too long for the engine. The cursor only
   * advances once this is empty. Lost if the worker is killed mid-sentence, in
   * which case the next end event moves on to the following sentence.
   */
  let pending: { chunks: string[]; options: SpeakOptions } | null = null;

  async function publish(): Promise<void> {
    await broadcast({ playing, cursor: await storage.getCursor(), error });
  }

  /** Buffer seen through the active tab; everything downstream uses this view. */
  async function blocksView(): Promise<Block[]> {
    const blocks = await storage.getBlocks();
    const { activeTab } = await storage.getPrefs();
    return viewOf(blocks, activeTab);
  }

  async function speakAt(cursor: Cursor, blocks: Block[]): Promise<void> {
    const sentence = sentenceAt(blocks, cursor);
    if (!sentence) return finish(blocks);

    // The cursor is persisted BEFORE speaking: the service worker can be killed
    // mid-sentence and must wake up knowing which sentence is in the air.
    await storage.setCursor(cursor);

    const prefs = await storage.getPrefs();
    const lang = blocks.find((b) => b.id === cursor.blockId)?.lang ?? prefs.targetLang;
    const options: SpeakOptions = {
      lang,
      rate: prefs.rate,
      voiceName: prefs.voiceByLang[lang],
    };

    // A sentence above the engine limit is spoken piece by piece; the cursor
    // stays on it until the last piece ends.
    const [head, ...rest] = chunkSentence(sentence.text, TTS_MAX_CHARS);
    pending = rest.length > 0 ? { chunks: rest, options } : null;

    await publish();
    await tts.speak(head ?? sentence.text, options);
  }

  async function finish(blocks: Block[]): Promise<void> {
    playing = false;
    pending = null;
    await storage.setCursor(firstCursor(blocks));
    await publish();
  }

  async function halt(message: string | null): Promise<void> {
    playing = false;
    pending = null;
    error = message;
    await publish();
  }

  return {
    async play() {
      const blocks = await blocksView();
      lastBlocks = blocks;
      error = null;

      const cursor = reconcile(blocks, await storage.getCursor(), lastBlocks);
      if (!cursor) {
        playing = false;
        await publish();
        return;
      }

      playing = true;
      await speakAt(cursor, blocks);
    },

    async pause() {
      expectInterrupt = true;
      pending = null;
      playing = false;
      tts.stop();
      // The cursor stays where it is, so the next play resumes this sentence.
      await publish();
    },

    async stop() {
      expectInterrupt = true;
      pending = null;
      playing = false;
      tts.stop();
      const blocks = await blocksView();
      await storage.setCursor(firstCursor(blocks));
      await publish();
    },

    async seek(cursor: Cursor) {
      await storage.setCursor(cursor);
      if (!playing) return publish();

      expectInterrupt = true;
      pending = null;
      tts.stop();
      await speakAt(cursor, await blocksView());
    },

    async setRate(rate: number) {
      // Applied from the next sentence on: the current one keeps its rate.
      await storage.setPrefs({ rate });
      await publish();
    },

    async setVoice(lang: string, voiceName: string) {
      const prefs = await storage.getPrefs();
      await storage.setPrefs({ voiceByLang: { ...prefs.voiceByLang, [lang]: voiceName } });
      await publish();
    },

    async blocksChanged() {
      const blocks = await blocksView();
      const previous = lastBlocks;
      lastBlocks = blocks;

      const cursor = await storage.getCursor();
      const repositioned = reconcile(blocks, cursor, previous);
      const moved =
        repositioned?.blockId !== cursor?.blockId ||
        repositioned?.paraIndex !== cursor?.paraIndex ||
        repositioned?.sentIndex !== cursor?.sentIndex;
      if (!moved) return;

      // The sentence being read is gone: stop rather than jump mid-speech.
      if (playing) {
        expectInterrupt = true;
        pending = null;
        playing = false;
        tts.stop();
      }
      await storage.setCursor(repositioned);
      await publish();
    },

    async onTtsEvent(event: TtsEvent) {
      if (event.type === 'end') {
        // Still inside an oversized sentence: speak the next piece and leave
        // the cursor where it is.
        if (pending) {
          const [next, ...rest] = pending.chunks;
          const options = pending.options;
          pending = rest.length > 0 ? { chunks: rest, options } : null;
          if (next !== undefined) {
            await tts.speak(next, options);
            return;
          }
        }

        // An end event also wakes a restarted worker: rebuild from storage.
        const blocks = await blocksView();
        lastBlocks = blocks;
        const cursor = await storage.getCursor();
        const next = cursor ? nextCursor(blocks, cursor) : firstCursor(blocks);
        if (!next) return finish(blocks);
        playing = true;
        await speakAt(next, blocks);
        return;
      }

      if (event.type === 'error' || event.type === 'interrupted') {
        if (expectInterrupt) {
          expectInterrupt = false;
          return;
        }
        // The cursor is left on the sentence that failed so it can be retried.
        await halt(event.errorMessage ?? 'Falha na leitura');
      }
    },

    async getState() {
      return { playing, cursor: await storage.getCursor(), error };
    },
  };
}
