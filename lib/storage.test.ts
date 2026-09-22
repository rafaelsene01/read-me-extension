import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  appendBlock,
  clearBlocks,
  createFolder,
  deleteDocument,
  deleteFolder,
  getBlocks,
  getCursor,
  getZoom,
  getDocumentBlocks,
  getDocuments,
  getFolders,
  getPrefs,
  getProgress,
  moveDocument,
  removeBlock,
  saveDocument,
  setBlocks,
  setCursor,
  setProgress,
  setZoom,
  setPrefs,
  touchDocument,
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

  it('writes the buffer back to the document it came from', async () => {
    await saveDocument(toLibraryDocument([block('a', 'primeiro')]));

    await setBlocks([{ ...block('a', 'primeiro'), lang: 'de' }]);

    // Reopening the document must not have to work the language out again.
    expect((await getDocumentBlocks('a'))[0]?.lang).toBe('de');
  });

  it('keeps savedAt, so following the buffer does not reorder the library', async () => {
    await saveDocument({ ...toLibraryDocument([block('a', 'primeiro')]), savedAt: 10 });

    await setBlocks([{ ...block('a', 'primeiro'), lang: 'de' }]);

    expect((await getDocuments())[0]?.savedAt).toBe(10);
  });

  it('does not file a buffer that is not a document of the library', async () => {
    await setBlocks([block('a', 'primeiro')]);

    expect(await getDocuments()).toEqual([]);
  });
});

describe('zoom', () => {
  it('remembers the zoom of each document and forgets it when the document goes', async () => {
    expect(await getZoom('a')).toBeNull();

    await setZoom('a', 4);
    await setZoom('b', 1);

    expect(await getZoom('a')).toBe(4);
    expect(await getZoom('b')).toBe(1);

    await deleteDocument('a');

    expect(await getZoom('a')).toBeNull();
    expect(await getZoom('b')).toBe(1);
  });
});

describe('scopes', () => {
  it('keeps the page and the panel buffers and cursors apart', async () => {
    await setBlocks([block('a', 'livro')], 'page');
    await setCursor({ blockId: 'a', paraIndex: 0, sentIndex: 1 }, undefined, 'page');

    await setBlocks([block('b', 'captura')], 'panel');

    expect((await getBlocks('page')).map((b) => b.id)).toEqual(['a']);
    expect((await getBlocks('panel')).map((b) => b.id)).toEqual(['b']);
    expect(await getCursor('panel')).toBeNull();
    expect(await getCursor('page')).toEqual({ blockId: 'a', paraIndex: 0, sentIndex: 1 });
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

  it('brings a rate stored when the slider went to 3x back into range', async () => {
    await setPrefs({ rate: 2.8 });

    expect((await getPrefs()).rate).toBe(2);
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
    expect(await getDocuments()).toEqual([{ id: 'a', name: 'a', kind: 'Texto', savedAt: 100 }]);
    expect(await getDocumentBlocks('a')).toEqual(blocks);
  });

  it('updates the document with the same id instead of adding another', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));

    await saveDocument(toLibraryDocument([block('a', 'um'), block('b', 'dois')], 200));

    const docs = await getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.savedAt).toBe(200);
    expect((await getDocumentBlocks('a')).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('lists documents from the most recent to the oldest', async () => {
    await saveDocument(toLibraryDocument([block('b', 'dois')], 200));
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await saveDocument(toLibraryDocument([block('c', 'tres')], 300));

    expect((await getDocuments()).map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps the existing cover when re-saving a document without one', async () => {
    await saveDocument({ ...toLibraryDocument([block('a', 'um')], 100), cover: 'data:image/png;base64,AAA' });

    await saveDocument(toLibraryDocument([block('a', 'um'), block('b', 'dois')], 200));

    const docs = await getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.cover).toBe('data:image/png;base64,AAA');
  });

  it('replaces the existing cover when the new document has one', async () => {
    await saveDocument({ ...toLibraryDocument([block('a', 'um')], 100), cover: 'data:image/png;base64,AAA' });

    await saveDocument({ ...toLibraryDocument([block('a', 'um')], 200), cover: 'data:image/jpeg;base64,BBB' });

    const docs = await getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.cover).toBe('data:image/jpeg;base64,BBB');
  });

  it('saves a new document without a cover as-is', async () => {
    const blocks = [block('a', 'um')];

    await saveDocument(toLibraryDocument(blocks, 100));

    expect((await getDocuments())[0]).toEqual({ id: 'a', name: 'a', kind: 'Texto', savedAt: 100 });
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

  it('deletes only the requested id and keeps the other documents', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await saveDocument(toLibraryDocument([block('b', 'dois')], 200));
    await saveDocument(toLibraryDocument([block('c', 'tres')], 300));

    const result = await deleteDocument('b');

    expect(result).toEqual({ ok: true });
    expect((await getDocuments()).map((d) => d.id)).toEqual(['c', 'a']);
    expect(await fakeBrowser.storage.local.get('doc:b')).toEqual({});
  });

  it('moves a library stored the old way, blocks and all, into one key per document', async () => {
    const blocks = [block('a', 'um'), block('b', 'dois')];
    await fakeBrowser.storage.local.set({
      documents: [{ id: 'a', name: 'a', blocks, folder: 'Estudos', savedAt: 100 }],
    });

    expect(await getDocuments()).toEqual([
      { id: 'a', name: 'a', kind: 'Texto', folder: 'Estudos', savedAt: 100 },
    ]);
    expect(await getDocumentBlocks('a')).toEqual(blocks);
    expect(await fakeBrowser.storage.local.get('documents')).toEqual({});
  });

  it('keeps the library and reports success when the id is not stored', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));

    const result = await deleteDocument('desconhecido');

    expect(result).toEqual({ ok: true });
    expect((await getDocuments()).map((d) => d.id)).toEqual(['a']);
  });

  it('returns reason "quota" and keeps the document when the delete write fails', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    const set = vi
      .spyOn(fakeBrowser.storage.local, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));

    const result = await deleteDocument('a');
    set.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'quota' });
    expect((await getDocuments()).map((d) => d.id)).toEqual(['a']);
  });
});

describe('touchDocument', () => {
  it('sends the opened document to the top of the library', async () => {
    await saveDocument({ ...toLibraryDocument([block('a', 'a')]), savedAt: 1 });
    await saveDocument({ ...toLibraryDocument([block('b', 'b')]), savedAt: 2 });

    await touchDocument('a');

    expect((await getDocuments()).map((doc) => doc.id)).toEqual(['a', 'b']);
  });

  it('changes nothing for an id that is not stored', async () => {
    await saveDocument({ ...toLibraryDocument([block('a', 'a')]), savedAt: 1 });

    await touchDocument('gone');

    expect((await getDocuments())[0]?.savedAt).toBe(1);
  });
});

describe('folders', () => {
  it('creates folders and lists them in alphabetical order', async () => {
    await createFolder('Trabalho');
    await createFolder('Estudos');

    expect(await getFolders()).toEqual(['Estudos', 'Trabalho']);
  });

  it('ignores a blank name and a name already taken, whatever the case', async () => {
    await createFolder('Estudos');
    await createFolder('  ');
    await createFolder('estudos');

    expect(await getFolders()).toEqual(['Estudos']);
  });

  it('files a document under a folder and takes it back out', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await createFolder('Estudos');

    await moveDocument('a', 'Estudos');
    expect((await getDocuments())[0]!.folder).toBe('Estudos');

    await moveDocument('a', null);
    expect((await getDocuments())[0]!.folder).toBeUndefined();
  });

  it('keeps the folder of a document that is saved again without one', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await moveDocument('a', 'Estudos');

    await saveDocument(toLibraryDocument([block('a', 'um'), block('b', 'dois')], 200));

    expect((await getDocuments())[0]!.folder).toBe('Estudos');
  });

  it('deleting a folder returns its documents to the top level, never deletes them', async () => {
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));
    await createFolder('Estudos');
    await moveDocument('a', 'Estudos');

    await deleteFolder('Estudos');

    expect(await getFolders()).toEqual([]);
    const docs = await getDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0]!.folder).toBeUndefined();
  });
});

describe('reading progress', () => {
  const at = (blockId: string) => ({ blockId, paraIndex: 2, sentIndex: 1 });

  it('records where the current document is being read', async () => {
    await setBlocks([block('a', 'um'), block('b', 'dois')]);

    await setCursor(at('b'));

    expect(await getProgress('a')).toEqual(at('b'));
  });

  it('keeps the stored progress when the cursor is cleared', async () => {
    await setBlocks([block('a', 'um')]);
    await setCursor(at('a'));

    await setCursor(null);

    expect(await getCursor()).toBeNull();
    expect(await getProgress('a')).toEqual(at('a'));
  });

  it('keeps both of two progress writes in flight at once', async () => {
    await Promise.all([setProgress('a', at('a')), setProgress('b', at('b'))]);

    expect(await getProgress('a')).toEqual(at('a'));
    expect(await getProgress('b')).toEqual(at('b'));
  });

  it('has no progress for a document that was never read', async () => {
    expect(await getProgress('a')).toBeNull();
  });

  it('forgets the progress of a document removed from the library', async () => {
    await setBlocks([block('a', 'um')]);
    await setCursor(at('a'));
    await saveDocument(toLibraryDocument([block('a', 'um')], 100));

    await deleteDocument('a');

    expect(await getProgress('a')).toBeNull();
  });
});
