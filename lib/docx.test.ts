// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocx } from './docx';
import type { DocxResult } from './docx';

const BODY = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
  <w:p><w:r><w:t>Primeiro </w:t></w:r><w:r><w:t>parágrafo.</w:t></w:r></w:p>
  <w:p><w:r><w:t>   </w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Célula\n com  quebra</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body>
</w:document>`;

function makeDocx(files: Record<string, string> = { 'word/document.xml': BODY }): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

function ok(result: DocxResult): string {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.text;
}

function fail(result: DocxResult): string {
  if (result.ok) throw new Error('expected failure');
  return result.reason;
}

describe('parseDocx', () => {
  it('joins the runs of each paragraph, one line each, skipping the empty ones', () => {
    expect(ok(parseDocx(makeDocx()))).toBe('Primeiro parágrafo.\nCélula com quebra');
  });

  it('rejects a Word 97-2003 binary as legacy', () => {
    expect(fail(parseDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))).toBe(
      'legacy',
    );
  });

  it('rejects a zip without word/document.xml', () => {
    expect(fail(parseDocx(makeDocx({ 'word/other.xml': BODY })))).toBe('invalid');
  });

  it('reports a document with no text', () => {
    const empty = BODY.replace(/<w:p>[\s\S]*<\/w:tbl>/, '<w:p><w:r><w:t> </w:t></w:r></w:p>');
    expect(fail(parseDocx(makeDocx({ 'word/document.xml': empty })))).toBe('empty');
  });
});
