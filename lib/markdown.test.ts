import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './markdown';

describe('stripMarkdown', () => {
  it('removes heading markers', () => {
    expect(stripMarkdown('# Titulo\n### Sub')).toBe('Titulo\nSub');
  });

  it('removes emphasis with *, _ and ~~', () => {
    expect(stripMarkdown('*a* **b** ***c*** _d_ __e__ ~~f~~')).toBe('a b c d e f');
  });

  it('keeps link text and drops the url', () => {
    expect(stripMarkdown('Veja [o site](https://x.com/a) agora.')).toBe('Veja o site agora.');
  });

  it('keeps image alt text and drops the url', () => {
    expect(stripMarkdown('![um gato](gato.png)')).toBe('um gato');
  });

  it('drops code fence lines and keeps their content', () => {
    expect(stripMarkdown('Antes\n```ts\nconst a = *b*;\n```\nDepois')).toBe(
      'Antes\n\nconst a = *b*;\n\nDepois',
    );
  });

  it('removes list markers', () => {
    expect(stripMarkdown('- um\n* dois\n+ tres\n1. quatro\n  10. cinco')).toBe(
      'um\ndois\ntres\nquatro\ncinco',
    );
  });

  it('removes blockquote markers', () => {
    expect(stripMarkdown('> citado\n> > aninhado')).toBe('citado\naninhado');
  });

  it('turns table rows into readable lines and drops separator rows', () => {
    expect(stripMarkdown('| Nome | Idade |\n|---|:--:|\n| Ana | 30 |')).toBe(
      'Nome, Idade\n\nAna, 30',
    );
  });

  it('removes inline code backticks', () => {
    expect(stripMarkdown('Rode `pnpm test` antes.')).toBe('Rode pnpm test antes.');
  });

  it('empties horizontal rule lines', () => {
    expect(stripMarkdown('a\n---\n***\n* * *\nb')).toBe('a\n\n\n\nb');
  });

  it('preserves the line breaks between paragraphs', () => {
    expect(stripMarkdown('# T\n\nPrimeiro.\n\nSegundo.')).toBe('T\n\nPrimeiro.\n\nSegundo.');
  });

  it('leaves text without Markdown identical', () => {
    const text = 'Bom dia. Como vai?\n\nTudo bem, obrigado!';
    expect(stripMarkdown(text)).toBe(text);
  });

  it('yields empty text for a file with only # and ---', () => {
    expect(stripMarkdown('#\n---\n# \n---').trim()).toBe('');
  });

  it('does not corrupt snake_case words or multiplication', () => {
    expect(stripMarkdown('use snake_case_word e 2 * 3 * 4')).toBe('use snake_case_word e 2 * 3 * 4');
  });
});
