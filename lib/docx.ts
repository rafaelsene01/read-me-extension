import { strFromU8, unzipSync } from 'fflate';
import { allByLocalName, collapse } from './epub';

export type DocxFailure = 'invalid' | 'legacy' | 'empty';
export type DocxResult = { ok: true; text: string } | { ok: false; reason: DocxFailure };

const DOCUMENT = 'word/document.xml';

/** A .docx is a zip; a Word 97-2003 .doc is an OLE binary, which is not read here. */
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * The text of a .docx, one line per paragraph: `w:p` in document order, each the
 * concatenation of its `w:t` runs. Tables come out paragraph by paragraph, and
 * headers, footers and footnotes (their own parts) are left out.
 */
export function parseDocx(bytes: Uint8Array): DocxResult {
  if (!isZip(bytes)) return { ok: false, reason: 'legacy' };

  let source: Uint8Array | undefined;
  try {
    source = unzipSync(bytes, { filter: (file) => file.name === DOCUMENT })[DOCUMENT];
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!source) return { ok: false, reason: 'invalid' };

  const doc = new DOMParser().parseFromString(strFromU8(source), 'application/xml');
  if (doc.querySelector('parsererror')) return { ok: false, reason: 'invalid' };

  const lines: string[] = [];
  for (const paragraph of allByLocalName(doc, 'p')) {
    const text = collapse(
      allByLocalName(paragraph, 't')
        .map((run) => run.textContent ?? '')
        .join(''),
    );
    if (text) lines.push(text);
  }

  if (lines.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, text: lines.join('\n') };
}
