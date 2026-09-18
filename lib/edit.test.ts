import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyEdit, applyLang } from './edit';
import { getBlocks, setBlocks } from './storage';
import { hashText, isStale } from './translate';
import type { Block } from './types';

function block(text: string, withTranslation = false): Block {
  return {
    id: 'b1',
    sourceUrl: 'https://example.com/a',
    sourceTitle: 'A',
    lang: 'pt-BR',
    text,
    paragraphs: [{ id: 'b1:p0', sentences: [{ id: 'b1:p0:s0', text }] }],
    createdAt: 0,
    ...(withTranslation
      ? {
          translation: {
            target: 'en',
            text: 'Translated.',
            paragraphs: [],
            sourceTextHash: hashText(text),
          },
        }
      : {}),
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('applyEdit', () => {
  it('re-segments the new text keeping the block id', () => {
    const edited = applyEdit(block('Um. Dois.'), 'Novo um. Novo dois.');

    expect(edited?.id).toBe('b1');
    expect(edited?.paragraphs).toHaveLength(1);
    expect(edited?.paragraphs[0]?.sentences.map((s) => s.text)).toEqual([
      'Novo um.',
      'Novo dois.',
    ]);
    expect(edited?.paragraphs[0]?.id).toBe('b1:p0');
  });

  it('splits the edited text into one paragraph per non-empty line', () => {
    const edited = applyEdit(block('Um.'), 'Primeira linha.\n\nSegunda linha.');

    expect(edited?.paragraphs.map((p) => p.sentences.map((s) => s.text))).toEqual([
      ['Primeira linha.'],
      ['Segunda linha.'],
    ]);
  });

  it('stores the edited text as the new source of truth', () => {
    expect(applyEdit(block('Um.'), 'Dois.')?.text).toBe('Dois.');
  });

  it('leaves a previous translation marked as out of date', () => {
    const edited = applyEdit(block('Um.', true), 'Um editado.');

    expect(edited?.translation?.text).toBe('Translated.');
    expect(isStale(edited as Block)).toBe(true);
  });

  it('returns null when the edit empties the block', () => {
    expect(applyEdit(block('Um.'), '')).toBeNull();
  });

  it('returns null when only whitespace is left', () => {
    expect(applyEdit(block('Um.'), '   \n\t  ')).toBeNull();
  });

  it('returns the block untouched when the text did not change', () => {
    const original = block('Um.', true);

    expect(applyEdit(original, 'Um.')).toBe(original);
  });
});

describe('applyLang', () => {
  it('overrides the source language declared by the page', () => {
    expect(applyLang(block('Um. Dois.'), 'en').lang).toBe('en');
  });

  it('re-segments the block in the new language keeping id and text', () => {
    const relanged = applyLang(block('Um. Dois.'), 'en');

    expect(relanged.id).toBe('b1');
    expect(relanged.text).toBe('Um. Dois.');
    expect(relanged.paragraphs[0]?.sentences.map((s) => s.text)).toEqual(['Um.', 'Dois.']);
    expect(relanged.paragraphs[0]?.id).toBe('b1:p0');
  });

  it('returns the block untouched when the language did not change', () => {
    const original = block('Um.');

    expect(applyLang(original, 'pt-BR')).toBe(original);
  });

  it('persists the override so the next translation reads it back', async () => {
    const original = block('Um. Dois.');
    await setBlocks([original]);

    await setBlocks([applyLang(original, 'en')]);

    expect((await getBlocks()).map((b) => b.lang)).toEqual(['en']);
  });
});
