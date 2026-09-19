import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  appendBlock,
  clearBlocks,
  getBlocks,
  getCursor,
  getDocuments,
  getPrefs,
  removeBlock,
  saveDocument,
  setBlocks,
  setCursor,
  setPrefs,
} from './storage';
import { toLibraryDocument } from './document';
import type { Block } from './types';

function block(id: string, text: string): Block {
  return {
    id,
    sourceUrl: `https://example.com/${id}`,
    sourceTitle: id,
    lang: 'pt-BR',
    text,
    paragraphs: [],
    createdAt: 0,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('appendBlock', () => {
  it('appends at the end and preserves the existing blocks', async () => {
    await setBlocks([block('a', 'primeiro'), block('b', 'segundo')]);

    const result = await appendBlock(block('c', 'terceiro'));

    expect(result).toEqual({ ok: true });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses with reason "full" when the buffer would pass 500000 characters', async () => {
    await setBlocks([block('a', 'x'.repeat(499_999))]);

    const result = await appendBlock(block('b', 'xx'));

    expect(result).toEqual({ ok: false, reason: 'full' });
  });

  it('accepts a capture that leaves the buffer one character below the limit', async () => {
    await setBlocks([block('a', 'x'.repeat(499_998))]);

    const result = await appendBlock(block('b', 'x'));

    expect(result).toEqual({ ok: true });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('refuses the capture that makes the buffer reach exactly 500000 characters', async () => {
    await setBlocks([block('a', 'x'.repeat(499_999))]);

    const result = await appendBlock(block('b', 'x'));

    expect(result).toEqual({ ok: false, reason: 'full' });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('leaves the buffer untouched when it refuses for being full', async () => {
    await setBlocks([block('a', 'x'.repeat(500_000))]);

    await appendBlock(block('b', 'mais texto'));

    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });

  it('returns reason "quota" when the write fails', async () => {
    await setBlocks([block('a', 'primeiro')]);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    const result = await appendBlock(block('b', 'segundo'));

    expect(result).toEqual({ ok: false, reason: 'quota' });
  });

  it('keeps the previous buffer after a quota failure', async () => {
    await setBlocks([block('a', 'primeiro')]);
    const set = vi
      .spyOn(fakeBrowser.storage.local, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    await appendBlock(block('b', 'segundo'));
    set.mockRestore();

    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });
});

describe('setBlocks', () => {
  it('returns reason "quota" and keeps the previous buffer when the write fails', async () => {
    await setBlocks([block('a', 'primeiro')]);
    const set = vi
      .spyOn(fakeBrowser.storage.local, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    const result = await setBlocks([block('a', 'primeiro'), block('b', 'traduzido')]);
    set.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect((await getBlocks()).map((b) => b.id)).toEqual(['a']);
  });
});

describe('removeBlock and clearBlocks', () => {
  it('removes only the requested id', async () => {
    await setBlocks([block('a', 'um'), block('b', 'dois'), block('c', 'tres')]);

    await removeBlock('b');

    expect((await getBlocks()).map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('empties the buffer', async () => {
    await setBlocks([block('a', 'um'), block('b', 'dois')]);

    await clearBlocks();

    expect(await getBlocks()).toEqual([]);
  });
});

describe('prefs', () => {
  it('defaults rate to 1.0, targetLang to navigator.language and activeTab to original', async () => {
    const prefs = await getPrefs();

    expect(prefs.rate).toBe(1.0);
    expect(prefs.targetLang).toBe(navigator.language);
    expect(prefs.activeTab).toBe('original');
    expect(prefs.voiceByLang).toEqual({});
  });

  it('defaults to the system engine with empty per-engine voice maps', async () => {
    const prefs = await getPrefs();

    expect(prefs.ttsEngine).toBe('system');
    expect(prefs.voiceByEngine).toEqual({ system: {}, kokoro: {}, supertonic: {} });
  });

  it('migrates legacy prefs that predate ttsEngine and voiceByEngine', async () => {
    // A stored pref object shaped like the version before local engines.
    await fakeBrowser.storage.local.set({
      prefs: { rate: 1.5, targetLang: 'pt-BR', voiceByLang: { 'pt-BR': 'Luciana' }, activeTab: 'translation' },
    });

    const prefs = await getPrefs();

    expect(prefs.rate).toBe(1.5);
    expect(prefs.voiceByLang).toEqual({ 'pt-BR': 'Luciana' });
    expect(prefs.ttsEngine).toBe('system');
    expect(prefs.voiceByEngine).toEqual({ system: {}, kokoro: {}, supertonic: {} });
    expect(prefs.favoriteVoices).toEqual([]);
  });

  it('fills missing slots when stored voiceByEngine is partial', async () => {
    await fakeBrowser.storage.local.set({
      prefs: { voiceByEngine: { kokoro: { pt: 'pf_dora' } } },
    });

    const prefs = await getPrefs();

    expect(prefs.voiceByEngine).toEqual({
      system: {},
      kokoro: { pt: 'pf_dora' },
      supertonic: {},
    });
  });

  it('persists a partial change and keeps the remaining defaults', async () => {
    await setPrefs({ rate: 1.75 });

    const prefs = await getPrefs();

    expect(prefs.rate).toBe(1.75);
    expect(prefs.activeTab).toBe('original');
  });
});

describe('cursor', () => {
  it('persists and reads back the cursor, defaulting to null', async () => {
    expect(await getCursor()).toBeNull();

    await setCursor({ blockId: 'a', paraIndex: 1, sentIndex: 2 });

    expect(await getCursor()).toEqual({ blockId: 'a', paraIndex: 1, sentIndex: 2 });
  });
});

describe('library documents', () => {
  it('saves a document with the first block id and title, the blocks and the save date', async () => {
    const blocks = [block('a', 'um'), block('b', 'dois')];

    const result = await saveDocument(toLibraryDocument(blocks, 100));

    expect(result).toEqual({ ok: true });
    expect(await getDocuments()).toEqual([{ id: 'a', name: 'a', blocks, savedAt: 100 }]);
  });

  it('updates the document with the same id instead of adding another', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));

    await saveDocument(toLibraryDocument([block('a', 'um'), block('b', 'dois')], 200));

    const docs = await getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.savedAt).toBe(200);
    expect(docs[0]!.blocks.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('lists documents from the most recent to the oldest', async () => {
    await saveDocument(toLibraryDocument([block('b', 'dois')], 200));
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await saveDocument(toLibraryDocument([block('c', 'tres')], 300));

    expect((await getDocuments()).map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('returns reason "quota" and keeps the previous library when the write fails', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    const set = vi
      .spyOn(fakeBrowser.storage.local, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    const result = await saveDocument(toLibraryDocument([block('b', 'dois')], 200));
    set.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect((await getDocuments()).map((d) => d.id)).toEqual(['a']);
  });
});
