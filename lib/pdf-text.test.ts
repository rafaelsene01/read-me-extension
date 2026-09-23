import { describe, expect, it } from 'vitest';
import {
  bodySize,
  boilerplate,
  classify,
  groupParagraphs,
  sentenceBoxes,
  withoutBullet,
  type TextPiece,
} from './pdf-text';

/** One full-width line of a page: height 10, so lines stack every 12 units. */
function line(text: string, index: number, x = 0, width = 100): TextPiece {
  return { text, x, y: index * 12, width, height: 10 };
}

describe('groupParagraphs', () => {
  it('joins the lines of a paragraph with spaces', () => {
    const paragraphs = groupParagraphs([line('Uma frase', 0), line('que continua.', 1, 0, 40)]);
    expect(paragraphs.map((p) => p.text)).toEqual(['Uma frase que continua.']);
  });

  it('splits on a short line, which ends the paragraph', () => {
    const paragraphs = groupParagraphs([
      line('Primeira linha', 0),
      line('fim.', 1, 0, 20),
      line('Outro parágrafo', 2),
    ]);
    expect(paragraphs.map((p) => p.text)).toEqual(['Primeira linha fim.', 'Outro parágrafo']);
  });

  it('splits on a vertical gap wider than a line', () => {
    const paragraphs = groupParagraphs([line('Bloco um', 0), line('Bloco dois', 4)]);
    expect(paragraphs.map((p) => p.text)).toEqual(['Bloco um', 'Bloco dois']);
  });

  it('splits on an indented line', () => {
    const paragraphs = groupParagraphs([line('Sem recuo', 0), line('Com recuo', 1, 20, 80)]);
    expect(paragraphs.map((p) => p.text)).toEqual(['Sem recuo', 'Com recuo']);
  });

  it('splits a line that does not overlap the paragraph horizontally', () => {
    const paragraphs = groupParagraphs([line('Coluna', 0, 0, 40), line('Nota', 1, 60, 40)]);
    expect(paragraphs.map((p) => p.text)).toEqual(['Coluna', 'Nota']);
  });

  it('joins a hyphenated line without a space', () => {
    const paragraphs = groupParagraphs([line('parágra-', 0), line('fo inteiro.', 1, 0, 40)]);
    expect(paragraphs.map((p) => p.text)).toEqual(['parágrafo inteiro.']);
  });

  it('spaces runs of the same line when the gap implies one', () => {
    const paragraphs = groupParagraphs([
      { text: 'uma', x: 0, y: 0, width: 20, height: 10 },
      { text: 'outra', x: 25, y: 0, width: 20, height: 10 },
    ]);
    expect(paragraphs[0]!.text).toBe('uma outra');
  });

  it('boxes the paragraph around all of its lines', () => {
    const paragraphs = groupParagraphs([line('Uma', 0), line('duas', 1, 0, 40)]);
    expect(paragraphs[0]!.box).toEqual({ x: 0, y: 0, width: 100, height: 22 });
  });

  it('drops empty runs', () => {
    expect(groupParagraphs([line(' ', 0)])).toEqual([]);
  });
});

describe('sentenceBoxes', () => {
  /** Two lines of a paragraph, each one run of 100 wide at x 0. */
  const wrapped = groupParagraphs([line('Uma frase.', 0), line('Outra frase.', 1)])[0]!;

  it('boxes a sentence over the line it sits on, not the whole paragraph', () => {
    const [first, second] = sentenceBoxes(wrapped, ['Uma frase.', 'Outra frase.']);
    expect(first).toEqual([{ x: 0, y: 0, width: 100, height: 10 }]);
    expect(second).toEqual([{ x: 0, y: 12, width: 100, height: 10 }]);
  });

  it('boxes a sentence that wraps once per line', () => {
    expect(sentenceBoxes(wrapped, ['Uma frase. Outra frase.'])[0]).toHaveLength(2);
  });

  it('interpolates inside a line', () => {
    // 'Uma frase.' is 10 characters over 100 units: 'frase.' starts at 40.
    const [box] = sentenceBoxes(wrapped, ['frase. Outra'])[0]!;
    expect(box!.x).toBeCloseTo(40);
    expect(box!.width).toBeCloseTo(60);
  });

  it('gives no box to a sentence it cannot find', () => {
    expect(sentenceBoxes(wrapped, ['Não está aqui.'])).toEqual([[]]);
  });

  it('keeps the line slices in step with the text after a hyphen join', () => {
    const paragraph = groupParagraphs([line('parágra-', 0), line('fo inteiro.', 1, 0, 40)])[0]!;
    expect(paragraph.text).toBe('parágrafo inteiro.');
    for (const l of paragraph.lines) {
      expect(l.end).toBeLessThanOrEqual(paragraph.text.length);
      expect(paragraph.text.slice(l.start, l.end).trim()).not.toBe('');
    }
    expect(sentenceBoxes(paragraph, ['parágrafo inteiro.'])[0]).toHaveLength(2);
  });
});

describe('classify', () => {
  /** One paragraph of `text` set at `height`, placed well apart from the others. */
  function paragraph(text: string, height: number, index: number, mono = false) {
    return groupParagraphs([{ text, x: 0, y: index * 100, width: 100, height, mono }])[0]!;
  }

  it('tells headings, code and list items from the body text', () => {
    const paragraphs = [
      paragraph('Refactoring', 20, 0),
      paragraph('The Starting Point', 14, 1),
      paragraph('A long enough body paragraph that sets the size most text is in.', 10, 2),
      paragraph('Another paragraph of body text, also at the usual size.', 10, 3),
      paragraph('function statement(invoice) {', 10, 4, true),
      paragraph('• extract function', 10, 5),
    ];
    const body = bodySize(paragraphs);
    expect(body).toBe(10);
    expect(paragraphs.map((p) => classify(p, body))).toEqual(['h1', 'h2', 'p', 'p', 'code', 'li']);
  });

  it('drops the bullet of a list item, and only the bullet', () => {
    expect(withoutBullet('• extract function')).toBe('extract function');
    expect(withoutBullet('— M. Fowler')).toBe('— M. Fowler');
  });
});

describe('groupParagraphs on real book pages', () => {
  it('keeps a ragged-right line in its paragraph when the next word would not have fitted', () => {
    const paragraphs = groupParagraphs([
      line('Primeira linha que vai quase ao fim', 0, 0, 100),
      line('Linha curta porque', 1, 0, 70),
      line('extraordinariamente seguiu.', 2, 0, 60),
    ]);
    expect(paragraphs).toHaveLength(1);
  });

  it('starts a new paragraph where the size changes, and gives each line of code its own', () => {
    const paragraphs = groupParagraphs([
      { text: 'THE STARTING POINT', x: 0, y: 0, width: 100, height: 14 },
      line('Texto logo embaixo do título.', 1.3),
      { text: 'function a() {', x: 0, y: 40, width: 100, height: 10, mono: true },
      { text: 'return 1;', x: 10, y: 52, width: 90, height: 10, mono: true },
    ]);
    expect(paragraphs.map((p) => p.text)).toEqual([
      'THE STARTING POINT',
      'Texto logo embaixo do título.',
      'function a() {',
      'return 1;',
    ]);
  });
});

describe('boilerplate', () => {
  it('finds text repeated at the same spot on several pages, never code', () => {
    const menu = { text: 'History', x: 63, y: 169, width: 30, height: 10 };
    const brace = { text: '}', x: 97, y: 413, width: 6, height: 10, mono: true };
    const pages = [0, 1, 2, 3, 4].map((index) => [
      { ...menu, y: menu.y + (index % 2) * 0.6 },
      brace,
      line(`Texto da página ${index}`, 5),
    ]);
    expect(boilerplate(pages)).toEqual(['History@64,168']);
  });
});
