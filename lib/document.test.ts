import { describe, expect, it } from 'vitest';
import { fileToBlock, readingTime, toLibraryDocument } from './document';
import { stripMarkdown } from './markdown';
import { segmentBlock } from './segment';

function ok(result: ReturnType<typeof fileToBlock>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.block;
}

describe('fileToBlock', () => {
  it('turns a .txt file into a block named after the file (P1-B AC1)', () => {
    const block = ok(fileToBlock('notas.txt', 'Primeira frase. Segunda.\nOutro.', 'pt-BR'));
    expect(block.text).toBe('Primeira frase. Segunda.\nOutro.');
    expect(block.sourceTitle).toBe('notas.txt');
    expect(block.sourceUrl).toBe('notas.txt');
    expect(block.lang).toBe('pt-BR');
    expect(block.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(block.paragraphs).toEqual(segmentBlock(block.text, 'pt-BR', block.id));
    expect(block.createdAt).toBeTypeOf('number');
  });

  it('strips Markdown before segmenting a .md file (P1-B AC2)', () => {
    const raw = '# Titulo\n\nVeja **isto** e [o site](https://x.com).';
    const block = ok(fileToBlock('doc.md', raw, 'en'));
    expect(block.text).toBe(stripMarkdown(raw));
    expect(block.text).toBe('Titulo\n\nVeja isto e o site.');
    expect(block.paragraphs).toEqual(segmentBlock(block.text, 'en', block.id));
  });

  it('accepts NOTAS.MD as Markdown', () => {
    expect(ok(fileToBlock('NOTAS.MD', '**oi**', 'en')).text).toBe('oi');
  });

  it('refuses other extensions and names without one (P1-B AC3)', () => {
    expect(fileToBlock('a.pdf', 'texto', 'en')).toEqual({ ok: false, reason: 'unsupported' });
    expect(fileToBlock('LEIAME', 'texto', 'en')).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('refuses empty text (P1-B AC4)', () => {
    const empty = { ok: false, reason: 'empty' };
    expect(fileToBlock('a.txt', '', 'en')).toEqual(empty);
    expect(fileToBlock('a.txt', '  \n\t ', 'en')).toEqual(empty);
    expect(fileToBlock('a.md', '---\n# \n```\n```', 'en')).toEqual(empty);
  });

  it('refuses text of 500.000 characters or more (P1-B AC5)', () => {
    const tooLarge = { ok: false, reason: 'tooLarge' };
    expect(fileToBlock('a.txt', 'a'.repeat(499_999), 'en').ok).toBe(true);
    expect(fileToBlock('a.txt', 'a'.repeat(500_000), 'en')).toEqual(tooLarge);
    expect(fileToBlock('a.txt', 'a'.repeat(500_001), 'en')).toEqual(tooLarge);
  });
});

describe('toLibraryDocument', () => {
  it('takes id and name from the first block (P2-A AC1)', () => {
    const first = ok(fileToBlock('um.txt', 'Um.', 'en'));
    const second = ok(fileToBlock('dois.txt', 'Dois.', 'en'));
    expect(toLibraryDocument([first, second], 42)).toEqual({
      id: first.id,
      name: 'um.txt',
      blocks: [first, second],
      savedAt: 42,
    });
  });
});

describe('readingTime', () => {
  const words = (n: number) => ok(fileToBlock('a.txt', Array(n).fill('palavra').join(' '), 'pt'));

  it('is null without words', () => {
    expect(readingTime([])).toBeNull();
  });

  it('counts 180 words per minute at 1x, at least 1 min', () => {
    expect(readingTime([words(10)])).toBe('1 min');
    expect(readingTime([words(180 * 12)])).toBe('12 min');
  });

  it('sums every block', () => {
    expect(readingTime([words(900), words(900)])).toBe('10 min');
  });

  it('scales with the speed', () => {
    expect(readingTime([words(180 * 12)], 2)).toBe('6 min');
    expect(readingTime([words(180 * 12)], 0.5)).toBe('24 min');
  });

  it('switches to hours from 60 minutes', () => {
    expect(readingTime([words(180 * 60)])).toBe('1 h');
    expect(readingTime([words(180 * 80)])).toBe('1 h 20 min');
  });
});
