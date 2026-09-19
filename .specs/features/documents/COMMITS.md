# Documents — Commits

Mensagens na ordem das tasks; o usuário commita (`git add` só dos arquivos listados em cada seção).

---

## T1 — arquivos: lib/markdown.ts, lib/markdown.test.ts, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): strip markdown syntax for speech

stripMarkdown removes headings, emphasis, links, images, code fences,
list and quote markers, table pipes and separators, inline code and
horizontal rules line by line, keeping every line break so segmentBlock
still sees one paragraph per line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T2 — arquivos: lib/document.ts, lib/document.test.ts, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): turn txt and md files into reader blocks

fileToBlock accepts .txt and .md (any case), strips Markdown from .md,
refuses unsupported extensions, empty text and text of MAX_BUFFER_CHARS
or more, and builds a Block named after the file. toLibraryDocument
wraps the buffer blocks with the first block's id and title.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T3 — arquivos: lib/storage.ts, lib/storage.test.ts, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(storage): save and list library documents

Adds the local:documents item. getDocuments lists the library from the
most recently saved to the oldest; saveDocument replaces the document
with the same id or appends it, and returns reason "quota" when the
write fails, leaving the previous library untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T4 — arquivos: lib/audio/mp3.ts, lib/audio/mp3.test.ts, package.json, pnpm-lock.yaml, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(audio): add streaming mp3 encoder

createMp3Encoder wraps @breezystack/lamejs as a mono 64 kbps encoder.
encode converts each Float32 chunk to Int16 (toInt16 clamps to [-1, 1])
and feeds lame full 1152-sample frames, keeping only the leftover tail
between calls instead of the whole PCM; finish encodes the tail, flushes
and returns an audio/mpeg Blob.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T5 — arquivos: lib/tts/export.ts, lib/tts/export.test.ts, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(tts): drive worker synthesis for audio export

exportAudio posts load to a TtsHostPort ({ post, subscribe }), waits for
the engine's ready status and synthesizes each job in turn with a fresh
requestId, feeding its audio to an encoder created on the first chunk
with that chunk's sample rate. Progress is reported per finished job.
It rejects with the worker's message on a load or synthesis error, and
with "Nada para exportar" when there are no jobs or no audio; events of
older requests are ignored and the listener is removed on settle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T6 — arquivos: components/useReader.ts, entrypoints/sidepanel/App.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
refactor(sidepanel): extract reader state into useReader hook

useReader owns the engine state (asks the background for it, then
follows playbackState broadcasts) and the blocks and prefs that follow
storage.local.onChanged, returning { state, blocks, prefs }. The side
panel App now calls it; behavior is unchanged. The documents page will
reuse it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T7 — arquivos: components/useReplaceGuard.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): confirm before replacing the reading buffer

useReplaceGuard returns { open, dialog, error }. open(blocks, onOpened?)
reads the stored buffer: when empty it writes the blocks straight away,
otherwise it shows a dialog with Cancelar, Substituir and Salvar e
substituir. The last one saves the current buffer to the library first
and leaves the buffer untouched if that save fails. Quota errors become
"Armazenamento cheio"; onOpened runs only after a successful replace.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T8 — arquivos: components/Mp3Button.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): export document audio as mp3

Mp3Button starts its own TTS worker (the in-page host under wxt dev),
builds one job per paragraph of the active tab with the block language,
the current speed and the chosen neural voice, runs exportAudio with a
Progress bar and downloads <title without extension>.mp3. Errors show
in an Alert and nothing is downloaded. The worker is terminated when
the export ends, fails or the component unmounts; the offscreen reading
is never touched. Disabled with a tooltip on the system voice, while
generating, and with no blocks.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T9 — arquivos: components/DocumentActions.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): add import, save and clear actions

DocumentActions({ blocks, prefs }) shows Novo, Salvar, MP3 and Limpar.
Novo opens a hidden .txt/.md file input, turns the file into a block
with fileToBlock and opens it through useReplaceGuard; the input is
reset so the same file can be picked again. Salvar stores the buffer in
the library (same id replaces the entry), Limpar stops the reading and
empties the buffer. Unsupported, empty and too large files and a full
storage show in an Alert. Salvar, MP3 and Limpar are disabled with an
empty buffer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T10 — arquivos: components/LibraryList.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): list and open library documents

LibraryList({ onOpened }) reads getDocuments and follows
storage.local.onChanged, listing each saved document with its name and
savedAt (toLocaleString) from the most recent to the oldest. Each row is
a full-width ghost Button that opens the document's blocks (translation
included) through useReplaceGuard and calls onOpened after a successful
replace. An empty library shows "Nenhum documento salvo."; a full
storage shows in an Alert.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T11 — arquivos: entrypoints/documents/index.html, entrypoints/documents/main.tsx, entrypoints/documents/App.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(documents): add documents page

New WXT unlisted page documents.html ("ReadMe — Documentos") reusing the
side panel styles. A centered column holds controlled Tabs Arquivo and
Biblioteca, Arquivo selected on open. Arquivo shows DocumentActions,
TranslatePanel and the BlockList of the buffer, or "Importe um documento
para começar." when it is empty; Biblioteca shows LibraryList, and
opening a document switches back to Arquivo. The reader error shows in
an Alert, and Controls sit in a sticky bottom footer so voice, play and
speed stay visible while the page scrolls.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T12 — arquivos: components/CaptureBar.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
feat(sidepanel): open documents page from the capture bar

Adds an outline icon Button (FileText, aria-label and tooltip
"Documentos") to the CaptureBar, between Escolher elemento and Limpar.
Clicking it opens the extension's documents.html in a new tab through
chrome.tabs.create.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## T13 — arquivos: lib/audio/mp3.test.ts, lib/tts/export.test.ts, components/Mp3Button.tsx, entrypoints/documents/App.tsx, components/useReplaceGuard.tsx, .specs/features/documents/tasks.md, .specs/features/documents/COMMITS.md

```
fix(documents): address verifier gaps

Adds an mp3 test where 5 frames plus a 1000-sample tail must encode to a
larger file than the 5 frames alone, so dropping the tail in finish()
fails. The Arquivo tab stays mounted (forceMount, hidden when inactive),
so an MP3 being generated survives a switch to Biblioteca; disposing the
host mid-generation now rejects exportAudio with "Geração do MP3
cancelada" instead of leaving it pending. The progress bar shows NN%,
the object URL is revoked after a delay, the file name only drops a
trailing .txt/.md and replaces \/:*?"<>| with _, and "Salvar e
substituir" skips saving when the buffer was cleared meanwhile.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT — arquivos: components/NewDocumentMenu.tsx, components/ui/dropdown-menu.tsx, components/DocumentActions.tsx, entrypoints/documents/App.tsx, lib/document.ts, lib/document.test.ts

```
feat(documents): sidebar layout, new-document menu and reading time

The documents page gets its own sidebar: a Novo menu listing the supported
types (Documentos: TXT, MD) above the Arquivo and Biblioteca tabs. The
extension side panel is disabled on the page's tab. The file view shows the
estimated reading time at 1x (180 words per minute), independent of the
chosen speed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT 2 — arquivos: entrypoints/documents/App.tsx, components/Controls.tsx, components/BlockList.tsx

```
feat(documents): right action column, text zoom and reading time in footer

Salvar, MP3, Limpar and the translation controls move to a right column so
the text sits in the center. Zoom buttons scale the text font size through
a new optional BlockList textSize prop. The estimated reading time now shows
under the speed slider through an optional Controls prop; the side panel is
unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT 3 — arquivos: lib/document.ts, lib/document.test.ts, entrypoints/documents/App.tsx, components/Controls.tsx

```
feat(documents): scale reading time with the playback speed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT 4 — arquivos: components/Controls.tsx

```
feat(controls): place engine and voice pickers side by side when wide

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT 5 — arquivos: entrypoints/documents/App.tsx

```
fix(documents): keep Original/Tradução tabs side by side

The page sidebar used a vertical Tabs root, whose group-data styles also
stacked the nested translation tabs. The sidebar now uses plain buttons.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Ajuste pós-UAT 6 — arquivos: components/BlockList.tsx

```
fix(reader): show edit state and explain the text language picker

While a block is being edited the pencil turns into a Concluir button that
commits the edit. The language picker gets an icon and a tooltip saying it
sets the reading voice and the translation source.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
