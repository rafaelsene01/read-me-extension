/**
 * Turning the text runs of a PDF page into paragraphs. Kept apart from `pdf.ts`
 * so the grouping can be tested without loading pdf.js.
 */

import type { ParagraphKind } from './types';

/** A text run of a PDF page, in page coordinates at scale 1 (origin top-left). */
export interface TextPiece {
  text: string;
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
  /** Font height; also the line height used to group lines into paragraphs. */
  height: number;
  /** Set in a monospaced font: code, in a book about programming. */
  mono?: boolean;
}

/** A rectangle, in the same coordinates as TextPiece. */
export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A run of a line: the slice of the paragraph text it carries, and where it sits. */
interface Span {
  start: number;
  end: number;
  x: number;
  width: number;
}

/** One line of a paragraph: the slice of the paragraph text it holds, and its runs. */
export interface PdfLine {
  start: number;
  end: number;
  top: number;
  bottom: number;
  spans: Span[];
}

/** A paragraph of a page: its text, the rectangle around it and the lines it is made of. */
export interface PdfParagraph {
  text: string;
  box: PdfBox;
  lines: PdfLine[];
  /** Median height of its lines: the font size, for telling headings apart. */
  size: number;
  /** Most of its characters are in a monospaced font. */
  mono: boolean;
}

interface Line {
  pieces: TextPiece[];
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
}

/** Runs whose vertical centres sit within half a line of each other, in reading order. */
function toLines(pieces: TextPiece[]): Line[] {
  const lines: Line[] = [];

  for (const piece of [...pieces].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines[lines.length - 1];
    const centre = piece.y + piece.height / 2;
    const near =
      line &&
      Math.abs(centre - (line.top + line.bottom) / 2) < Math.max(piece.height, line.height) * 0.5;

    if (near) {
      line.pieces.push(piece);
      line.top = Math.min(line.top, piece.y);
      line.bottom = Math.max(line.bottom, piece.y + piece.height);
      line.left = Math.min(line.left, piece.x);
      line.right = Math.max(line.right, piece.x + piece.width);
      line.height = Math.max(line.height, piece.height);
    } else {
      lines.push({
        pieces: [piece],
        top: piece.y,
        bottom: piece.y + piece.height,
        left: piece.x,
        right: piece.x + piece.width,
        height: piece.height,
      });
    }
  }

  return lines;
}

/**
 * One line of text: runs left to right, with a space wherever the gap implies
 * one, and the slice of that text each run covers. The spans are what maps a
 * character of the paragraph back to a position on the page.
 */
function layoutLine(line: Line): { text: string; spans: Span[] } {
  const spans: Span[] = [];
  let text = '';
  let right: number | null = null;

  for (const piece of [...line.pieces].sort((a, b) => a.x - b.x)) {
    let chunk = piece.text.replace(/\s+/g, ' ');
    if (right !== null && piece.x - right > piece.height * 0.2 && !chunk.startsWith(' ')) {
      chunk = ` ${chunk}`;
    }
    // No space opens a line, and a join never doubles one.
    while (chunk.startsWith(' ') && (text === '' || text.endsWith(' '))) chunk = chunk.slice(1);
    if (!chunk) continue;

    const start = text.length + (chunk.startsWith(' ') ? 1 : 0);
    text += chunk;
    if (start < text.length) spans.push({ start, end: text.length, x: piece.x, width: piece.width });
    right = piece.x + piece.width;
  }

  const trimmed = text.replace(/ +$/, '');
  const last = spans[spans.length - 1];
  if (last && last.end > trimmed.length) last.end = Math.max(last.start, trimmed.length);
  return { text: trimmed, spans: spans.filter((span) => span.end > span.start) };
}

/** Width of the first word of a line, prorated over the run it opens. */
function firstWordWidth(line: Line): number {
  const first = [...line.pieces].sort((a, b) => a.x - b.x)[0]!;
  const text = first.text.trimStart();
  const word = text.split(/\s/)[0] ?? '';
  return text.length > 0 ? (first.width * word.length) / text.length : 0;
}

/** Most of the line is set in a monospaced font. */
function isMono(line: Line): boolean {
  const total = line.pieces.reduce((sum, piece) => sum + piece.text.length, 0);
  const mono = line.pieces.reduce((sum, piece) => sum + (piece.mono ? piece.text.length : 0), 0);
  return mono > total * 0.6;
}

function boxOf(lines: Line[]): PdfBox {
  const left = Math.min(...lines.map((line) => line.left));
  const right = Math.max(...lines.map((line) => line.right));
  const top = Math.min(...lines.map((line) => line.top));
  const bottom = Math.max(...lines.map((line) => line.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Group the text runs of one page into paragraphs, each with the rectangle it
 * occupies and the lines it is made of. A line continues the paragraph when it
 * sits right under the previous one, overlaps it horizontally, the previous line
 * runs to the paragraph's right edge and it is not indented; anything else starts
 * a new paragraph. A line ending in a hyphen joins the next one without a space.
 *
 * ponytail: geometric heuristics, no reading-order analysis — a PDF with
 * side notes or tight multi-column layout can still merge or split wrongly.
 * Move to pdf.js's structure tree (`getStructTree`) if real books need it.
 */
export function groupParagraphs(pieces: TextPiece[]): PdfParagraph[] {
  const lines = toLines(pieces.filter((piece) => piece.text.trim() && piece.height > 0));
  const paragraphs: PdfParagraph[] = [];
  let group: Line[] = [];

  function flush(): void {
    const laid = group.map((line) => ({ line, ...layoutLine(line) })).filter((entry) => entry.text);

    if (laid.length > 0) {
      let text = '';
      const out: PdfLine[] = [];

      for (const entry of laid) {
        if (text.endsWith('-')) {
          // A word broken across lines joins without a space, which shortens the
          // line that carried the hyphen.
          text = text.slice(0, -1);
          const previous = out[out.length - 1]!;
          previous.end = text.length;
          const span = previous.spans[previous.spans.length - 1];
          if (span && span.end > text.length) span.end = Math.max(span.start, text.length);
        } else if (text) {
          text += ' ';
        }

        const offset = text.length;
        text += entry.text;
        out.push({
          start: offset,
          end: text.length,
          top: entry.line.top,
          bottom: entry.line.bottom,
          spans: entry.spans.map((span) => ({
            ...span,
            start: span.start + offset,
            end: span.end + offset,
          })),
        });
      }

      const heights = laid.map((entry) => entry.line.height).sort((a, b) => a - b);
      const pieces = laid.flatMap((entry) => entry.line.pieces);
      const chars = (list: TextPiece[]): number => list.reduce((sum, piece) => sum + piece.text.length, 0);
      paragraphs.push({
        text,
        box: boxOf(laid.map((entry) => entry.line)),
        lines: out,
        size: heights[Math.floor(heights.length / 2)]!,
        mono: chars(pieces.filter((piece) => piece.mono)) > chars(pieces) * 0.6,
      });
    }

    group = [];
  }

  for (const line of lines) {
    const previous = group[group.length - 1];
    if (previous) {
      const left = Math.min(...group.map((other) => other.left));
      const right = Math.max(...group.map((other) => other.right));
      const continues =
        // A line of code is a paragraph of its own: its breaks are the code's.
        !isMono(line) &&
        !isMono(previous) &&
        // A change of size is a heading meeting the text under it.
        Math.abs(line.height - previous.height) <= previous.height * 0.15 &&
        line.top - previous.bottom <= previous.height * 0.8 &&
        line.right > left &&
        line.left < right &&
        // The line before ran on until the next word no longer fitted: a
        // wrap, not the end of the paragraph. Ragged-right text stops short
        // of the column by up to a word's width.
        previous.right >=
          right - Math.max(previous.height * 2, firstWordWidth(line) + previous.height * 0.5) &&
        line.left <= left + previous.height * 0.5;
      if (!continues) flush();
    }
    group.push(line);
  }
  flush();

  return paragraphs;
}

/**
 * Where character `offset` sits on `line`. Inside a run the position is
 * interpolated over its width; between two runs it snaps to the run the range
 * grows towards, so the gap of a tabulated line is not painted over.
 */
function xAt(line: PdfLine, offset: number, edge: 'start' | 'end'): number {
  const { spans } = line;
  let right = spans[0]?.x ?? 0;

  for (const span of spans) {
    if (offset <= span.start) return edge === 'end' ? right : span.x;
    if (offset < span.end) {
      return span.x + (span.width * (offset - span.start)) / (span.end - span.start);
    }
    right = span.x + span.width;
  }

  return right;
}

/** One rectangle per line that the slice `[start, end)` of the paragraph text covers. */
export function rangeBoxes(paragraph: PdfParagraph, start: number, end: number): PdfBox[] {
  const boxes: PdfBox[] = [];

  for (const line of paragraph.lines) {
    const from = Math.max(start, line.start);
    const to = Math.min(end, line.end);
    if (to <= from) continue;

    const left = xAt(line, from, 'start');
    const width = xAt(line, to, 'end') - left;
    if (width <= 0) continue;
    boxes.push({ x: left, y: line.top, width, height: line.bottom - line.top });
  }

  return boxes;
}

/**
 * The rectangles of each sentence of a paragraph, line by line. The sentences
 * were segmented from `paragraph.text`, so they are matched in order; one that
 * is not found yields no rectangles and does not move the search forward.
 */
export function sentenceBoxes(paragraph: PdfParagraph, sentences: string[]): PdfBox[][] {
  let from = 0;

  return sentences.map((sentence) => {
    const at = sentence ? paragraph.text.indexOf(sentence, from) : -1;
    if (at < 0) return [];
    from = at + sentence.length;
    return rangeBoxes(paragraph, at, from);
  });
}

/** A bullet opening a paragraph: the symbol, not the text after it. */
const BULLET = /^[•●▪◦‣∙■□►▸]\s+(?=\S)/;

/**
 * The size most of the text is set in, weighted by length: the body text.
 * Measured over the whole document, so a page holding only a title still
 * reads that title as bigger than the body.
 */
export function bodySize(paragraphs: PdfParagraph[]): number {
  const weight = new Map<number, number>();
  for (const { size, text } of paragraphs) {
    const key = Math.round(size * 2) / 2;
    weight.set(key, (weight.get(key) ?? 0) + text.length);
  }
  let best = 0;
  let most = -1;
  for (const [size, total] of weight) {
    if (total > most) [best, most] = [size, total];
  }
  return best;
}

/**
 * What each paragraph of a page is, for the text view: code (monospaced),
 * a heading (short and clearly bigger than the body), a list item (opens
 * with a bullet) or plain text. The paragraphs themselves are left as they
 * are, so the page view still finds every sentence where it was.
 *
 * ponytail: font size and font family only; a heading set in bold at body
 * size reads as text. Add the font weight if books need it.
 */
export function classify(paragraph: PdfParagraph, body: number): ParagraphKind {
  if (paragraph.mono) return 'code';
  if (paragraph.text.length <= 150 && body > 0) {
    const ratio = paragraph.size / body;
    if (ratio >= 1.6) return 'h1';
    if (ratio >= 1.3) return 'h2';
    if (ratio >= 1.12) return 'h3';
  }
  return BULLET.test(paragraph.text) ? 'li' : 'p';
}

/** The text a list item is read and shown with: its bullet goes, the list marker replaces it. */
export function withoutBullet(text: string): string {
  return text.replace(BULLET, '');
}

/** A text run as it sits on its page: its text and where, to the unit. */
export function signature(piece: TextPiece): string {
  // On a grid of 4 units: the same menu drifts by a unit from page to page.
  const at = (value: number): number => Math.round(value / 4) * 4;
  return `${piece.text.trim()}@${at(piece.x)},${at(piece.y)}`;
}

/**
 * The text runs that come back at the same spot on several pages: a website
 * menu printed along with the book, a running header. They are the page's
 * frame, not its text, and left in they glue themselves to the lines they sit
 * beside. Code is never frame: a lone brace can well sit at the same spot twice.
 *
 * ponytail: same text at the same spot, 3 pages or more; a header that carries
 * the page number changes text every page and stays in. Match on position
 * alone if that shows up.
 */
export function boilerplate(pages: TextPiece[][]): string[] {
  if (pages.length < 5) return [];
  const seen = new Map<string, number>();
  for (const pieces of pages) {
    const frame = pieces.filter((piece) => !piece.mono && /\p{L}/u.test(piece.text));
    for (const key of new Set(frame.map(signature))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count >= 3).map(([key]) => key);
}
