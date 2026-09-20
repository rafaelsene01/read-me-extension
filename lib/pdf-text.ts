/**
 * Turning the text runs of a PDF page into paragraphs. Kept apart from `pdf.ts`
 * so the grouping can be tested without loading pdf.js.
 */

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

      paragraphs.push({ text, box: boxOf(laid.map((entry) => entry.line)), lines: out });
    }

    group = [];
  }

  for (const line of lines) {
    const previous = group[group.length - 1];
    if (previous) {
      const left = Math.min(...group.map((other) => other.left));
      const right = Math.max(...group.map((other) => other.right));
      const continues =
        line.top - previous.bottom <= previous.height * 0.8 &&
        line.right > left &&
        line.left < right &&
        previous.right >= right - previous.height * 2 &&
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
