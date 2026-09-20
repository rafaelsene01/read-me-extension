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

/** A paragraph rectangle, in the same coordinates as TextPiece. */
export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
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

/** One line of text: runs left to right, with a space wherever the gap implies one. */
function lineText(line: Line): string {
  let text = '';
  let right: number | null = null;

  for (const piece of [...line.pieces].sort((a, b) => a.x - b.x)) {
    if (right !== null && piece.x - right > piece.height * 0.2 && !/\s$/.test(text)) text += ' ';
    text += piece.text;
    right = piece.x + piece.width;
  }

  return text.replace(/\s+/g, ' ').trim();
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
 * occupies. A line continues the paragraph when it sits right under the previous
 * one, overlaps it horizontally, the previous line runs to the paragraph's right
 * edge and it is not indented; anything else starts a new paragraph. A line
 * ending in a hyphen joins the next one without a space.
 *
 * ponytail: geometric heuristics, no reading-order analysis — a PDF with
 * side notes or tight multi-column layout can still merge or split wrongly.
 * Move to pdf.js's structure tree (`getStructTree`) if real books need it.
 */
export function groupParagraphs(pieces: TextPiece[]): { text: string; box: PdfBox }[] {
  const lines = toLines(pieces.filter((piece) => piece.text.trim() && piece.height > 0));
  const paragraphs: { text: string; box: PdfBox }[] = [];
  let group: Line[] = [];

  function flush(): void {
    const texts = group.map(lineText).filter(Boolean);
    if (texts.length > 0) {
      const text = texts.reduce((acc, line) =>
        acc.endsWith('-') ? acc.slice(0, -1) + line : `${acc} ${line}`,
      );
      paragraphs.push({ text, box: boxOf(group) });
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
