// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseEpub } from './epub';
import { segmentBlock } from './segment';
import type { EpubResult } from './epub';

const CONTAINER = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="oebps-package+xml"/>
  </rootfiles>
</container>`;

const CHAPTER_1 = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR">
<head><title>Cap um</title><style>.hidden { color: red; }</style></head>
<body>
<h1>Primeiro capítulo</h1>
<p>Primeiro parágrafo.</p>
<blockquote><p>Uma citação famosa.</p></blockquote>
<ul><li>Item de lista.</li></ul>
<script>var stolen = "não deve aparecer";</script>
</body>
</html>`;

const CHAPTER_2 = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR">
<head><title>Cap dois</title></head>
<body>
<p>Só texto, sem título.</p>
</body>
</html>`;

function opf(extra = ''): string {
  return `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>O Nome do Vento</dc:title>
    <dc:language>pt-BR</dc:language>
  </metadata>
  <manifest>
    <item id="c1" href="Text/cap 1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/cap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
  ${extra}
</package>`;
}

interface FixtureOptions {
  files?: Record<string, string>;
  opf?: string;
  cover?: Uint8Array;
}

function makeEpub(options: FixtureOptions = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(options.opf ?? opf()),
    'OEBPS/Text/cap 1.xhtml': strToU8(CHAPTER_1),
    'OEBPS/Text/cap2.xhtml': strToU8(CHAPTER_2),
  };
  if (options.cover) files['OEBPS/cover.png'] = options.cover;
  for (const [path, content] of Object.entries(options.files ?? {})) {
    files[path] = strToU8(content);
  }
  return zipSync(files);
}

function ok(result: EpubResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.doc;
}

function fail(result: EpubResult) {
  if (result.ok) throw new Error(`expected failure, got doc ${result.doc.name}`);
  return result.reason;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('parseEpub', () => {
  it('turns an EPUB 3 with 2 chapters into 2 blocks in spine order (P1-A AC2, P1-B AC1, AC5)', () => {
    const doc = ok(parseEpub(makeEpub(), 'livro.epub', 'en'));
    expect(doc.name).toBe('O Nome do Vento');
    expect(doc.id).toBe(doc.blocks[0]!.id);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]!.text).toContain('Primeiro parágrafo.');
    expect(doc.blocks[1]!.text).toContain('Só texto, sem título.');
    for (const block of doc.blocks) {
      expect(block.sourceTitle).toBe('O Nome do Vento');
      expect(block.lang).toBe('pt-BR');
    }
  });

  it('tags every block with epub.book = doc.id and the chapter zip path, in spine order (P1-E AC1)', () => {
    const doc = ok(parseEpub(makeEpub(), 'livro.epub', 'en'));
    expect(doc.blocks.map((block) => block.epub)).toEqual([
      { book: doc.id, path: 'OEBPS/Text/cap 1.xhtml' },
      { book: doc.id, path: 'OEBPS/Text/cap2.xhtml' },
    ]);
  });

  it('kinds are h1/p/quote/li with no repeated text; script and style ignored (P1-B AC3, AC4)', () => {
    const doc = ok(parseEpub(makeEpub(), 'livro.epub', 'en'));
    const block = doc.blocks[0]!;
    expect(block.kinds).toEqual(['h1', 'p', 'quote', 'li']);
    expect(block.text.split('\n')).toEqual([
      'Primeiro capítulo',
      'Primeiro parágrafo.',
      'Uma citação famosa.',
      'Item de lista.',
    ]);
    expect(block.text).not.toContain('stolen');
    expect(block.text).not.toContain('hidden');
    expect(block.text.match(/Uma citação famosa\./g)).toHaveLength(1);
  });

  it('paragraphs match segmentBlock and stay aligned with kinds (P1-B AC4, AC5)', () => {
    const doc = ok(parseEpub(makeEpub(), 'livro.epub', 'en'));
    for (const block of doc.blocks) {
      expect(block.paragraphs).toEqual(segmentBlock(block.text, block.lang, block.id));
      expect(block.kinds).toHaveLength(block.paragraphs.length);
    }
  });

  it('sourceUrl is the first h1..h3, or "Capítulo N" without one (P1-B AC5)', () => {
    const doc = ok(parseEpub(makeEpub(), 'livro.epub', 'en'));
    expect(doc.blocks[0]!.sourceUrl).toBe('Primeiro capítulo');
    expect(doc.blocks[1]!.sourceUrl).toBe('Capítulo 2');
  });

  it('skips linear="no" items and chapters without text (P1-B AC2)', () => {
    const custom = opf()
      .replace('<itemref idref="c2"/>', '<itemref idref="c2" linear="no"/>')
      .replace(
        '</manifest>',
        '<item id="c3" href="Text/vazio.xhtml" media-type="application/xhtml+xml"/></manifest>',
      )
      .replace(
        '</spine>',
        '<itemref idref="c3" linear="no"/><itemref idref="c3"/></spine>',
      );
    const doc = ok(
      parseEpub(
        makeEpub({
          opf: custom,
          files: {
            'OEBPS/Text/vazio.xhtml':
              '<html xmlns="http://www.w3.org/1999/xhtml"><body><div>   </div></body></html>',
          },
        }),
        'livro.epub',
        'en',
      ),
    );
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]!.text).toContain('Primeiro parágrafo.');
  });

  it('finds hrefs with %20 in subfolders relative to the OPF (edge case)', () => {
    const customOpf = opf().replaceAll('Text/cap 1.xhtml', 'Text/cap%201.xhtml');
    const doc = ok(
      parseEpub(
        makeEpub({
          opf: customOpf,
          files: { 'OEBPS/Text/cap 1.xhtml': CHAPTER_1 },
        }),
        'livro.epub',
        'en',
      ),
    );
    expect(doc.blocks[0]!.text).toContain('Primeiro parágrafo.');
  });

  it('reads malformed XHTML chapters as HTML instead of dropping them (P1-B AC6)', () => {
    const broken = `<html><body>
<h1>Capítulo quebrado</h1>
<p>Primeiro bloco
<p>Segundo bloco
</body></html>`;
    const doc = ok(
      parseEpub(
        makeEpub({ files: { 'OEBPS/Text/cap 1.xhtml': broken } }),
        'livro.epub',
        'en',
      ),
    );
    expect(doc.blocks[0]!.sourceUrl).toBe('Capítulo quebrado');
    expect(doc.blocks[0]!.text).toContain('Primeiro bloco');
    expect(doc.blocks[0]!.text).toContain('Segundo bloco');
  });

  it('uses the file name without .epub when there is no dc:title, and fallbackLang without dc:language (P1-B AC7)', () => {
    const bare = opf()
      .replace('<dc:title>O Nome do Vento</dc:title>', '')
      .replace('<dc:language>pt-BR</dc:language>', '');
    const doc = ok(parseEpub(makeEpub({ opf: bare }), 'meu livro.epub', 'en-US'));
    expect(doc.name).toBe('meu livro');
    expect(doc.blocks[0]!.sourceTitle).toBe('meu livro');
    expect(doc.blocks[0]!.lang).toBe('en-US');
  });

  it('extracts the cover via properties="cover-image" as a data URL (P1-C AC1, AC2)', () => {
    const custom = opf().replace(
      '<item id="c1"',
      '<item id="img" href="cover.png" media-type="image/png" properties="cover-image"/><item id="c1"',
    );
    const doc = ok(parseEpub(makeEpub({ opf: custom, cover: PNG_BYTES }), 'livro.epub', 'en'));
    const expected = `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`;
    expect(doc.cover).toBe(expected);
  });

  it('extracts the cover via meta name="cover" (EPUB 2) with the right bytes (P1-C AC1, AC2)', () => {
    const custom = opf()
      .replace('<dc:language>', '<meta name="cover" content="img"/><dc:language>')
      .replace(
        '<item id="c1"',
        '<item id="img" href="cover.png" media-type="image/png"/><item id="c1"',
      );
    const doc = ok(parseEpub(makeEpub({ opf: custom, cover: PNG_BYTES }), 'livro.epub', 'en'));
    expect(doc.cover).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`);
  });

  it('imports without cover when the cover file is missing from the zip (edge case)', () => {
    const custom = opf().replace(
      '<item id="c1"',
      '<item id="img" href="cover.png" media-type="image/png" properties="cover-image"/><item id="c1"',
    );
    const doc = ok(parseEpub(makeEpub({ opf: custom }), 'livro.epub', 'en'));
    expect(doc.cover).toBeUndefined();
  });

  it('rejects non-zip bytes, zips without container.xml and unreadable OPFs as invalid (P1-A AC5)', () => {
    expect(fail(parseEpub(strToU8('isto não é um zip'), 'x.epub', 'en'))).toBe('invalid');

    const noContainer = zipSync({ 'OEBPS/content.opf': strToU8(opf()) });
    expect(fail(parseEpub(noContainer, 'x.epub', 'en'))).toBe('invalid');

    const badOpf = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER),
      'OEBPS/content.opf': strToU8('<package><metadata>'),
    });
    expect(fail(parseEpub(badOpf, 'x.epub', 'en'))).toBe('invalid');
  });

  it('rejects DRM when encryption.xml ciphers a spine chapter; font obfuscation alone is fine (P1-A AC6, edge case)', () => {
    const encryption = (uri: string) => `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData><CipherData><CipherReference URI="${uri}"/></CipherData></EncryptedData>
</encryption>`;

    const withFonts = makeEpub({
      files: { 'META-INF/encryption.xml': encryption('OEBPS/fonts/font1.woff') },
    });
    expect(ok(parseEpub(withFonts, 'livro.epub', 'en')).blocks).toHaveLength(2);

    // OCF: CipherReference URIs are relative to the container root.
    for (const uri of ['OEBPS/Text/cap2.xhtml', 'OEBPS/Text/cap%201.xhtml', '/OEBPS/Text/cap2.xhtml']) {
      const withChapter = makeEpub({ files: { 'META-INF/encryption.xml': encryption(uri) } });
      expect(fail(parseEpub(withChapter, 'livro.epub', 'en'))).toBe('drm');
    }

    // OCF/ADEPT form: xmlenc elements carry the enc: prefix.
    const prefixed = (uri: string) => `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>
</encryption>`;
    const prefixedChapter = makeEpub({
      files: { 'META-INF/encryption.xml': prefixed('OEBPS/Text/cap2.xhtml') },
    });
    expect(fail(parseEpub(prefixedChapter, 'livro.epub', 'en'))).toBe('drm');
    const prefixedFonts = makeEpub({
      files: { 'META-INF/encryption.xml': prefixed('OEBPS/fonts/font1.woff') },
    });
    expect(ok(parseEpub(prefixedFonts, 'livro.epub', 'en')).blocks).toHaveLength(2);
  });

  it('reads namespace-prefixed container and OPF elements (opf:package, EPUB 2)', () => {
    const container = `<?xml version="1.0"?>
<c:container xmlns:c="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <c:rootfiles>
    <c:rootfile full-path="OEBPS/content.opf" media-type="oebps-package+xml"/>
  </c:rootfiles>
</c:container>`;
    const prefixedOpf = `<?xml version="1.0"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="2.0">
  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>O Nome do Vento</dc:title>
    <dc:language>pt-BR</dc:language>
    <opf:meta name="cover" content="img"/>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="img" href="cover.png" media-type="image/png"/>
    <opf:item id="c1" href="Text/cap 1.xhtml" media-type="application/xhtml+xml"/>
    <opf:item id="c2" href="Text/cap2.xhtml" media-type="application/xhtml+xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="c1"/>
    <opf:itemref idref="c2"/>
  </opf:spine>
</opf:package>`;
    const doc = ok(
      parseEpub(
        makeEpub({
          opf: prefixedOpf,
          cover: PNG_BYTES,
          files: { 'META-INF/container.xml': container },
        }),
        'livro.epub',
        'en',
      ),
    );
    expect(doc.name).toBe('O Nome do Vento');
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]!.text).toContain('Primeiro parágrafo.');
    expect(doc.blocks[1]!.text).toContain('Só texto, sem título.');
    expect(doc.cover).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`);
  });

  it('reports empty when no spine chapter has text (P1-A AC7)', () => {
    const files = {
      'OEBPS/Text/cap 1.xhtml':
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><div>   </div></body></html>',
      'OEBPS/Text/cap2.xhtml':
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><script>var a=1;</script></body></html>',
    };
    expect(fail(parseEpub(makeEpub({ files }), 'livro.epub', 'en'))).toBe('empty');
  });

  it('accepts a book with 600.000 characters (P1-A AC9)', () => {
    const big = `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>${'a'.repeat(
      600_000,
    )}</p></body></html>`;
    const doc = ok(
      parseEpub(makeEpub({ files: { 'OEBPS/Text/cap 1.xhtml': big } }), 'livro.epub', 'en'),
    );
    expect(doc.blocks[0]!.text.length).toBeGreaterThanOrEqual(600_000);
  });
});
