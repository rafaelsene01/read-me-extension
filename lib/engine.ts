import { firstCursor, nextCursor, reconcile, sentenceAt } from './cursor';
import { chunkSentence } from './segment';
import { localVoiceKey } from './tts/registry';
import type { TtsEngineId, TtsRuntimeStatus } from './tts/types';
import type { Block, Cursor, PlaybackState, Prefs } from './types';

/** chrome.tts refuses an utterance longer than this. */
export const TTS_MAX_CHARS = 32_000;

/**
 * Sentences synthesized ahead of the one being spoken. Neural synthesis takes
 * roughly as long as the sentence lasts, so without lookahead every sentence
 * starts with an audible gap.
 */
export const LOOKAHEAD = 3;

export interface SpeakOptions {
  lang: string;
  rate: number;
  voiceName?: string;
}

/**
 * Generalized TTS contract: implementations resolve once the utterance is in
 * flight and report completion/failure through Engine.onTtsEvent, or reject
 * speak() directly (treated like an 'error' event).
 */
export interface EngineTts {
  speak(utterance: string, options: SpeakOptions): Promise<void>;
  stop(): void | Promise<void>;
  /**
   * Changes the speed of the utterance in the air. Resolves false when the
   * engine cannot (chrome.tts): the engine then restarts the sentence.
   */
  setRate?(rate: number): boolean | Promise<boolean>;
  /**
   * Warms the utterances that come next, so playback does not wait on
   * synthesis between sentences. Best effort: engines that cannot omit it.
   */
  prefetch?(utterances: { text: string; options: SpeakOptions }[]): void | Promise<void>;
}

export interface EngineStorage {
  getBlocks(): Promise<Block[]>;
  getCursor(): Promise<Cursor | null>;
  /** `docId` saves the store a full read of the buffer; see storage.setCursor. */
  setCursor(cursor: Cursor | null, docId?: string): Promise<void>;
  /** Where a document was left, by document id; null when it was never read. */
  getProgress(id: string): Promise<Cursor | null>;
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
  /** Optional provider of the selected engine's model status for the panel. */
  getTtsStatus?: () => TtsRuntimeStatus | undefined;
  /** Translates a book sentence on the fly (translation tab). Absent: books are read in the original. */
  translate?: (text: string, source: string, target: string) => Promise<string>;
}

export interface Engine {
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(cursor: Cursor): Promise<void>;
  /**
   * `commit` marks the end of a gesture (slider released): only then is a
   * sentence restarted on an engine that cannot change speed live.
   */
  setRate(rate: number, commit?: boolean): Promise<void>;
  /**
   * Stores the manual voice choice. `engine` is the engine the voice belongs
   * to: the picker lists every engine at once, so choosing a voice also
   * switches to its engine, stopping playback like setTtsEngine does.
   */
  setVoice(lang: string, voiceName: string, engine?: TtsEngineId): Promise<void>;
  /** Switches the speech engine, stopping playback while keeping the cursor. */
  setTtsEngine(engine: TtsEngineId): Promise<void>;
  /** Called after the buffer changes so a dangling cursor is repositioned. */
  blocksChanged(): Promise<void>;
  onTtsEvent(event: TtsEvent): Promise<void>;
  getState(): Promise<PlaybackState>;
}

export function createEngine({ tts, storage, broadcast, getTtsStatus, translate }: EngineDeps): Engine {
  let playing = false;
  let error: string | null = null;
  /** Set before we stop the engine ourselves, so the resulting event is not reported. */
  let expectInterrupt = false;
  /** Last buffer seen, used to find the block that followed a removed one. */
  let lastBlocks: Block[] | undefined;
  /**
   * The buffer as it is stored. It can be a whole book, so parsing it out of
   * the store for every sentence is heard as a pause between them; it is read
   * once and dropped by blocksChanged, which the store's own change event
   * triggers.
   */
  let buffer: Block[] | undefined;
  /**
   * Remaining pieces of a sentence too long for the engine. The cursor only
   * advances once this is empty. Lost if the worker is killed mid-sentence, in
   * which case the next end event moves on to the following sentence.
   */
  let pending: { chunks: string[]; options: SpeakOptions } | null = null;
  /** Bumped by every command that moves or stops reading: a translation that resolves late is dropped. */
  let generation = 0;

  async function publish(): Promise<void> {
    await broadcast({ playing, cursor: await storage.getCursor(), error, tts: getTtsStatus?.() });
  }

  /** Stop the engine in use, keeping the cursor: what switching engines needs. */
  async function stopForSwitch(): Promise<void> {
    generation++;
    if (!playing) return;
    expectInterrupt = true;
    pending = null;
    playing = false;
    await tts.stop();
  }

  /** Buffer seen through the active tab; everything downstream uses this view. */
  async function blocksView(): Promise<Block[]> {
    buffer ??= await storage.getBlocks();
    const { activeTab } = await storage.getPrefs();
    return viewOf(buffer, activeTab);
  }

  /**
   * Asks the engine to synthesize the next few sentences while this one plays.
   * Skipped on the translation tab of a book, where each sentence is
   * translated right before it is spoken.
   */
  function prefetchAhead(cursor: Cursor, blocks: Block[], prefs: Prefs): void {
    if (!tts.prefetch) return;
    const utterances: { text: string; options: SpeakOptions }[] = [];
    let at: Cursor | null = cursor;
    for (let i = 0; i < LOOKAHEAD; i++) {
      at = nextCursor(blocks, at);
      if (!at) break;
      const sentence = sentenceAt(blocks, at);
      if (!sentence) break;
      const blockId = at.blockId;
      const lang = blocks.find((b) => b.id === blockId)?.lang ?? prefs.targetLang;
      const [head] = chunkSentence(sentence.text, TTS_MAX_CHARS);
      if (head === undefined) break;
      utterances.push({
        text: head,
        options: { lang, rate: prefs.rate, voiceName: prefs.voiceByLang[lang] },
      });
    }
    if (utterances.length > 0) void tts.prefetch(utterances);
  }

  async function speakAt(cursor: Cursor, blocks: Block[]): Promise<void> {
    const sentence = sentenceAt(blocks, cursor);
    if (!sentence) return finish(blocks);
    const gen = ++generation;

    // The cursor is persisted BEFORE speaking: the service worker can be killed
    // mid-sentence and must wake up knowing which sentence is in the air.
    await storage.setCursor(cursor, blocks[0]?.id);

    const prefs = await storage.getPrefs();
    const block = blocks.find((b) => b.id === cursor.blockId);
    // Book chapters have no stored translation: on the translation tab each
    // sentence is translated right before it is spoken, in the target voice.
    const translating = !!(translate && block?.kinds && prefs.activeTab === 'translation');
    let text = sentence.text;
    if (translating) {
      try {
        text = await translate!(sentence.text, block!.lang, prefs.targetLang);
      } catch (err) {
        if (gen === generation) {
          await halt(`Falha na tradução: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      if (gen !== generation) return;
    }
    const lang = translating ? prefs.targetLang : (block?.lang ?? prefs.targetLang);
    const options: SpeakOptions = {
      lang,
      rate: prefs.rate,
      voiceName: prefs.voiceByLang[lang],
    };

    // A sentence above the engine limit is spoken piece by piece; the cursor
    // stays on it until the last piece ends.
    const [head, ...rest] = chunkSentence(text, TTS_MAX_CHARS);
    pending = rest.length > 0 ? { chunks: rest, options } : null;

    await publish();
    await safeSpeak(head ?? text, options);

    if (gen !== generation) return;
    if (!translating) prefetchAhead(cursor, blocks, prefs);

    // Warm the host cache with the next book sentence; a failure surfaces when it is spoken.
    if (translating) {
      const next = nextCursor(blocks, cursor);
      const nextBlock = next && blocks.find((b) => b.id === next.blockId);
      const nextSentence = next && sentenceAt(blocks, next);
      if (nextBlock?.kinds && nextSentence) {
        translate!(nextSentence.text, nextBlock.lang, prefs.targetLang).catch(() => {});
      }
    }
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

  /**
   * Speak treating a rejected speak() like an 'error' event: same halt path,
   * cursor left on the sentence that failed so it can be retried.
   */
  async function safeSpeak(text: string, options: SpeakOptions): Promise<void> {
    try {
      await tts.speak(text, options);
    } catch (err) {
      await halt(err instanceof Error ? err.message : 'Falha na leitura');
    }
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
      generation++;
      expectInterrupt = true;
      pending = null;
      playing = false;
      await tts.stop();
      // The cursor stays where it is, so the next play resumes this sentence.
      await publish();
    },

    async stop() {
      generation++;
      expectInterrupt = true;
      pending = null;
      playing = false;
      await tts.stop();
      const blocks = await blocksView();
      await storage.setCursor(firstCursor(blocks));
      await publish();
    },

    async seek(cursor: Cursor) {
      generation++;
      await storage.setCursor(cursor);
      if (!playing) return publish();

      expectInterrupt = true;
      pending = null;
      await tts.stop();
      await speakAt(cursor, await blocksView());
    },

    async setRate(rate: number, commit = true) {
      await storage.setPrefs({ rate });
      if (pending) pending = { ...pending, options: { ...pending.options, rate } };
      if (playing && !(await tts.setRate?.(rate)) && commit) {
        // chrome.tts cannot change speed mid-utterance: restart the sentence.
        const cursor = await storage.getCursor();
        if (cursor) {
          expectInterrupt = true;
          pending = null;
          await tts.stop();
          await speakAt(cursor, await blocksView());
          return;
        }
      }
      await publish();
    },

    async setVoice(lang: string, voiceName: string, engine?: TtsEngineId) {
      const prefs = await storage.getPrefs();
      // The picker lists every engine, so the voice says which one to store it
      // under; without it the choice belongs to the engine already selected.
      const target = engine ?? prefs.ttsEngine;
      const next: Partial<Prefs> =
        target === 'system'
          ? {
              voiceByLang: { ...prefs.voiceByLang, [lang]: voiceName },
              voiceByEngine: {
                ...prefs.voiceByEngine,
                system: { ...prefs.voiceByEngine.system, [lang]: voiceName },
              },
            }
          : {
              voiceByEngine: {
                ...prefs.voiceByEngine,
                [target]: {
                  ...prefs.voiceByEngine[target],
                  [localVoiceKey(target, lang)]: voiceName,
                },
              },
            };

      if (target === prefs.ttsEngine) {
        await storage.setPrefs(next);
        await publish();
        return;
      }
      // A voice of another engine switches to it, which must not leave the
      // previous adapter talking.
      await stopForSwitch();
      await storage.setPrefs({ ...next, ttsEngine: target });
      await publish();
    },

    async setTtsEngine(engine: TtsEngineId) {
      await stopForSwitch();
      await storage.setPrefs({ ttsEngine: engine });
      await publish();
    },

    async blocksChanged() {
      buffer = undefined;
      const blocks = await blocksView();
      const previous = lastBlocks;
      lastBlocks = blocks;

      const cursor = await storage.getCursor();
      // Another document is in the buffer: its reading picks up where it was
      // left, instead of repositioning the cursor of the one that is gone.
      // The engine does this itself because it owns the cursor — a panel
      // writing it straight to storage races this very handler and is never
      // broadcast, so the restored position was both overwritten and unseen.
      const opened =
        !!blocks[0] &&
        blocks[0].id !== previous?.[0]?.id &&
        !(cursor && blocks.some((block) => block.id === cursor.blockId));
      const restored = opened ? await storage.getProgress(blocks[0]!.id) : null;
      const repositioned = opened
        ? restored && blocks.some((block) => block.id === restored.blockId)
          ? restored
          : firstCursor(blocks)
        : reconcile(blocks, cursor, previous);
      const moved =
        repositioned?.blockId !== cursor?.blockId ||
        repositioned?.paraIndex !== cursor?.paraIndex ||
        repositioned?.sentIndex !== cursor?.sentIndex;
      if (!moved) return;

      // The sentence being read is gone: stop rather than jump mid-speech.
      if (playing) {
        generation++;
        expectInterrupt = true;
        pending = null;
        playing = false;
        await tts.stop();
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
            await safeSpeak(next, options);
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
      return { playing, cursor: await storage.getCursor(), error, tts: getTtsStatus?.() };
    },
  };
}
