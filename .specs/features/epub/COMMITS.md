# EPUB — Commits

Mensagens na ordem das tasks; o usuário commita (`git add` só dos arquivos listados em cada seção).

---

## T1 — arquivos: lib/document.ts, lib/storage.ts, lib/storage.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/spec.md, .specs/features/epub/COMMITS.md

```
feat(epub): keep library cover when re-saving a document

LibraryDocument gains an optional cover (data URL of the book cover).
saveDocument still upserts by id, but when the incoming document has no
cover and the stored entry of the same id does, the stored cover is
carried over, so re-saving an opened book does not lose its cover.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T2 — arquivos: lib/epub.ts, lib/epub.test.ts, lib/types.ts, package.json, pnpm-lock.yaml

```
feat(epub): parse epub chapters, formatting and cover

New lib/epub.ts turns an .epub into a LibraryDocument: unzipSync reads
only text entries, container.xml finds the OPF, the spine becomes one
Block per chapter in reading order, skipping linear="no" and empty
chapters. Leaf block elements (p, h1..h6, li, blockquote, pre, div,
dt, dd, figcaption, td, th) become paragraphs with collapsed
whitespace, script/style removed, and a ParagraphKind each
(Block.kinds, index-aligned with paragraphs). Malformed XHTML falls
back to text/html. sourceUrl is the first h1..h3 or "Capítulo N";
title and language come from dc:title/dc:language with file name and
fallbackLang as defaults. encryption.xml ciphering a spine item means
drm; only-font obfuscation passes. The cover (cover-image property or
meta name="cover") is stored as a data URL in LibraryDocument.cover.
Failures: invalid, drm, empty; no 500k limit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T3 — arquivos: components/BlockList.tsx, .specs/features/epub/tasks.md, .specs/features/epub/spec.md, .specs/features/epub/COMMITS.md

```
feat(epub): render paragraph kinds, single visible block, read-only books

BlockList renders each paragraph by block.kinds[i]: h1..h6 as real
heading tags with decreasing em-based sizes (text-[1.6em] down to
font-semibold), quote indented with a left border, li with a list
marker, and p unchanged; em sizes follow the textSize zoom. The edit
button hides for book chapters (blocks with kinds), and paragraphsFor
shows the original text even on the translation tab. A new visible
prop renders only the block with the given id while persist and
persistLang keep mapping over the full blocks list, so paging a book
never drops other chapters on save.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T4 — arquivos: components/LibraryList.tsx, .specs/features/epub/tasks.md, .specs/features/epub/spec.md, .specs/features/epub/COMMITS.md

```
feat(epub): show book covers in the library

LibraryList rows go horizontal: documents with a cover show it as an
h-16 w-12 shrink-0 rounded-sm object-cover img at the left, next to the
name and saved date; documents without a cover keep the same slot with a
FileText icon in text-muted-foreground. Name and date move into a
min-w-0 flex column so truncation still works inside the row.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T5 — arquivos: components/NewDocumentMenu.tsx, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): import epub books into the library

The Novo menu gains a "Livro / EPUB" item backed by a second hidden
file input filtered to .epub. The picked file goes through parseEpub;
invalid, drm and empty show their Alert message and change nothing.
A parsed book is saved to the library first (quota failure shows
"Armazenamento cheio" and does not open it), then opened through
useReplaceGuard, so Cancel keeps the buffer and the book stays saved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T6 — arquivos: entrypoints/documents/App.tsx, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): page through book chapters

When any block in the buffer has kinds, the Documentos page shows one
block at a time: BlockList gets visible set to the current page's
block id, and the header gains Página anterior/Próxima página buttons
(disabled at the ends, with tooltips) and an "N / total" indicator.
The page follows the reading cursor's block and resets to the first
when the buffer's first block changes (another document opened).
Paging only changes what is shown; no command goes to the engine.
Buffers without kinds stay stacked as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T9 — arquivos: lib/translate.ts, lib/translate.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): translation channel served by the offscreen document

The Translator API is missing in workers, so translation moves behind a
message channel. requestTranslation (service worker) ensures the
offscreen document and sends { channel: 'translate', text, source,
target }, resolving with text or rejecting with the answered error.
serveTranslations (offscreen) answers only that channel, keeps one
Translator per pair and an in-memory cache of pair|text promises; a
rejected translation or Translator creation leaves its map so the next
request retries. preparePair (page) creates the pair in the click's
task, forwarding the monitor's download progress.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T10 — arquivos: lib/engine.ts, lib/engine.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): speak book sentences translated on the fly

EngineDeps gains an optional translate(text, source, target). On the
translation tab, a sentence of a book block (one with kinds) is
translated from the block lang to prefs.targetLang right before it is
spoken, with the target language voice; the cursor is still persisted
first and chunkSentence splits the translated text. A generation
counter, bumped by pause, stop, seek, setTtsEngine, a stopping
blocksChanged and every speakAt, drops a translation that resolves
late. Speaking a translated sentence prefetches the next book sentence,
ignoring its failure. A rejected translation halts with "Falha na
tradução: <motivo>" and keeps the cursor. Without translate, or on the
original tab, books are read in the original; other blocks unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T7 — arquivos: components/TranslatePanel.tsx, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): listen to books translated, keep them out of stored translation

TranslatePanel translates only blocks without kinds and writes each
translation back by block id, so book chapters never get a stored
translation. When every block in the buffer is a book chapter, the
second tab reads "Ouvir traduzido" and the Traduzir button is hidden;
choosing that tab, or changing the target language while it is active,
calls preparePair in the same click (nothing awaited first) so the
language pack can download, with the Progress bar and failures in the
error Alert. Buffers without books translate as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T11 — arquivos: entrypoints/background.ts, entrypoints/offscreen/main.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): wire live translation between engine and offscreen

The background passes requestTranslation as the engine's translate, so
book sentences on the "Ouvir traduzido" tab are translated through the
offscreen document, created on demand, with the Documentos page and the
side panel closed. The offscreen document calls serveTranslations at
load and re-arms its idle close on every translation request, so it
stays open during a translated reading with the system voice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Fix T2 — arquivos: lib/epub.ts, lib/epub.test.ts, package.json, pnpm-lock.yaml, .specs/features/epub/spec.md, .specs/features/epub/design.md, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
fix(epub): resolve encryption.xml URIs from the container root

Per OCF, CipherReference URIs in META-INF/encryption.xml are relative
to the container root, not the OPF folder, so a DRM book with
URI="OEBPS/Text/c1.xhtml" was imported as ok. They are now resolved
from the root (decoded, leading "/" stripped) and compared with the
spine paths; font obfuscation alone still imports. The parser tests
run on jsdom, so the unused happy-dom devDependency is removed and
the spec docs name jsdom.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Fix T2 (2) — arquivos: lib/epub.ts, lib/epub.test.ts, .specs/STATE.md, .specs/features/epub/COMMITS.md

```
fix(epub): match namespaced encryption and package elements by local name

getElementsByTagName and querySelector compare qualified names, so
enc:CipherReference (the OCF/ADEPT form of encryption.xml) was missed
and a DRM book imported as ok; prefixed opf:item/opf:itemref/opf:meta
and c:rootfile were missed too. These lookups now match by localName.
Tests cover the enc: prefix (chapter is drm, fonts only is ok) and a
fully prefixed container and OPF. AD-016 now names jsdom.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T12 — arquivos: lib/types.ts, lib/epub.ts, lib/epub.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): tag chapter blocks with book and zip path

Each chapter block now carries epub: { book, path } — the book's
document id and the chapter's path inside the zip — so the rendering
can fetch the original chapter later. The leaf-paragraph rule moves
into the exported paragraphElements(), next to PARA_SELECTOR and
collapse(), so extraction and rendering match the same elements.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T13 — arquivos: lib/book-assets.ts, components/NewDocumentMenu.tsx, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): keep the epub file in the extension cache

Importing a book now stores its bytes in Cache Storage
('readme-books', key https://books.invalid/<id>) before the document
reaches the library, so a chapter can later be re-rendered from the
original zip. A failed write shows "Armazenamento cheio" and nothing
is saved or opened. loadBook memoizes in memory and deleteBook drops
both copies; without Cache Storage the helpers degrade to null/false.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```


---

## T17 — arquivos: lib/storage.ts, lib/storage.test.ts, components/LibraryList.tsx, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): delete documents from the library

Each library row now has an Excluir button next to the one that opens
the document; it asks for confirmation in a dialog naming the item.
Confirming calls the new deleteDocument(id) — an upsert-shaped filter
over local:documents with the same quota handling as saveDocument —
and then deleteBook(id), a no-op for documents that are not books. A
failed write shows "Falha ao excluir" and keeps the item. The reading
buffer (local:blocks) is never touched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T14 — arquivos: lib/book-render.ts, lib/book-render.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): map sentences to book text and sanitize book css

New pure lib/book-render.ts. sentenceRanges(texts, sentences) rebuilds
the collapsed text of a paragraph from its raw text nodes while keeping
the origin of every character, then locates each sentence in order and
returns its per-node raw ranges, so a sentence spanning <i>/<a> yields
one range per node and a missing sentence yields an empty list.
sanitizeCss(css, resolve) drops @import, rewrites url() through resolve
(dropping the whole declaration when it returns null) and scopes the
html/body element selectors to .rm-book, leaving .body-text, #body,
tbody and [data-body] alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T15 — arquivos: lib/book-render.ts, lib/book-render.test.ts, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): render a chapter from the epub with sentence spans

renderChapter(bytes, block) unzips the chapter and the stylesheets of
the book, parses it like parseEpub (XHTML with an HTML fallback), and
returns the chapter HTML as a div.rm-book fragment, the sanitized CSS
of its <style> and <link rel=stylesheet> pieces, and the blob URLs it
created. url() and img src are resolved against their own base to zip
entries and become blob URLs; script, iframe, object, embed, on*
handlers, javascript: hrefs and remote resources are dropped, while a
remote <a href> survives for the viewer to open in a tab. When the leaf
paragraphs match block.paragraphs, each sentence is wrapped in
span.rm-s[data-s="p:s"] by splitting text nodes, so the visible text
does not change; a different count renders without spans. Missing
chapter or unreadable zip returns null.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T16 — arquivos: components/BookChapter.tsx, components/BlockList.tsx, entrypoints/documents/App.tsx, entrypoints/sidepanel/style.css, .specs/features/epub/tasks.md, .specs/features/epub/COMMITS.md

```
feat(epub): show chapters with the book's own html and css

New components/BookChapter.tsx loads the book with loadBook, renders the
chapter with renderChapter and puts its HTML plus a <style> with the
book's CSS in a Shadow DOM, so the styles of the book cannot reach the
rest of the Documentos page. The sentence rules use the theme tokens,
which inherit into the shadow tree: clicking a span.rm-s sends seek, the
sentence being read gets .rm-on and is scrolled into view, and a click on
a link never navigates (http(s) opens in a new tab). The blob URLs of the
chapter are revoked when it changes or unmounts. BlockList takes a
bookView prop, used only by the Documentos page, and falls back to the
paragraph render with kinds while the book loads or when it is not in the
Cache Storage; the side panel is unchanged. New --paper /
--paper-foreground tokens keep the chapter a light sheet in both themes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Fix T14 — arquivos: lib/book-render.ts, lib/book-render.test.ts, .specs/features/epub/COMMITS.md

```
fix(epub): rewrite uppercase html and body selectors of book css

sanitizeCss only rewrote `html`/`body` in lowercase, so a sheet starting
with `BODY { ... }` (OEBPS/Styles/style.css of Test-Driven Development by
Example) lost its rule and the chapter rendered without the base font and
background of the book. Element selectors are ASCII case-insensitive in
HTML, so the rewrite regex now matches case-insensitively; the leading
separator and the `(?![-_])` guard keep TBODY, .BODY-TEXT, #BODY and
[data-BODY] untouched. @import and url() were already case-insensitive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
