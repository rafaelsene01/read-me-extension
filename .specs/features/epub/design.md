# EPUB — Design

**Spec**: `.specs/features/epub/spec.md`

## Decisão central

Um livro é um `LibraryDocument` cujos blocos são capítulos. Nada no engine, no
background, no offscreen, no `TranslatePanel`, no `Controls`, no `Mp3Button` nem no
`useReplaceGuard` muda: o livro entra no buffer como qualquer documento da biblioteca.
O que é novo fica em três pontos: o parser (`lib/epub.ts`), os tipos de parágrafo
(`Block.kinds`, lidos pelo `BlockList`) e a capa (`LibraryDocument.cover`).

| Pedido | Resolvido por |
| ------ | ------------- |
| Processar e salvar na biblioteca | `parseEpub` (novo) → `saveDocument` (existente, + preservar capa) |
| Abrir para leitura | `useReplaceGuard.open(doc.blocks, onOpened)` (existente) |
| Capa na biblioteca | `LibraryDocument.cover` + `<img>` em `LibraryList` |
| Página a página | Página = bloco; `BlockList` ganha `visible?: string` (id do bloco exibido); pager no `App` da página Documentos |
| Formatado | `Block.kinds` → tag e classes Tailwind por parágrafo no `BlockList` |
| Seek, destaque, tradução, MP3 | Inalterados: continuam lendo `paragraphs`/`sentences` |

## Mudanças de tipo

```ts
// lib/types.ts
export type ParagraphKind = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'quote' | 'li';

export interface Block {
  // ...campos existentes
  /** EPUB chapters only: one kind per paragraph, aligned by index. Its presence marks a book chapter. */
  kinds?: ParagraphKind[];
}

// lib/document.ts
export interface LibraryDocument {
  // ...campos existentes
  /** Cover image as a data URL; EPUB only. */
  cover?: string;
}
```

`kinds` sobrevive a `applyLang` (mesmas linhas, mesmo número de parágrafos) e à
tradução (`translateBlock` traduz linha a linha e já exige
`paragraphs.length` igual). Depois de `applyEdit` pode desalinhar: o `BlockList` só
aplica os tipos quando `kinds.length === paragraphs.length` (spec P1-D AC7). Nenhuma
mudança em `lib/edit.ts`.

## `lib/epub.ts`

```ts
export type EpubFailure = 'invalid' | 'drm' | 'empty';
export type EpubResult = { ok: true; doc: LibraryDocument } | { ok: false; reason: EpubFailure };
export function parseEpub(bytes: Uint8Array, fileName: string, fallbackLang: string): EpubResult;
```

Passos (síncrono; roda na página Documentos, que tem `DOMParser`):

1. `unzipSync(bytes, { filter })` só com entradas de texto (`.xml`, `.opf`, `.xhtml`, `.html`, `.htm`); exceção → `invalid`.
2. `META-INF/container.xml` → `rootfile[full-path]`; ausente → `invalid`. OPF por `DOMParser('application/xml')`; `parsererror` → `invalid`.
3. Manifest `id → { path, mediaType, properties }`, com `path` resolvido relativo à pasta do OPF via `new URL(href, 'http://x/' + opfPath).pathname`, sem a barra inicial e com `decodeURIComponent`.
4. `META-INF/encryption.xml`: se algum `CipherReference[URI]` resolve para um path do spine → `drm`. Ofuscação de fonte não toca o spine e passa.
5. Spine (`itemref` sem `linear="no"`), na ordem: `DOMParser('application/xhtml+xml')`; `parsererror` → reparse com `'text/html'`. Remove `script`/`style`. Parágrafos = elementos do seletor `p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div,dt,dd,figcaption,td,th` que não contêm outro elemento do seletor; texto = `textContent` com `\s+` → espaço e `trim`; vazios pulados. Tipo: `h1`..`h6` pela tag, `quote` se `closest('blockquote')`, `li` pela tag, senão `p`.
6. Capítulo sem parágrafo é pulado. Bloco: `id = crypto.randomUUID()`, `text = linhas.join('\n')`, `paragraphs = segmentBlock(text, lang, id)`, `kinds`, `sourceTitle = título`, `sourceUrl = primeiro h1..h3 ou "Capítulo N"`, `lang`, `createdAt`. Como cada linha é não vazia e sem `\n`, `segmentBlock` gera exatamente um parágrafo por linha e `kinds` fica alinhado.
7. Nenhum bloco → `empty`.
8. Capa: `properties~="cover-image"`, senão `meta[name=cover]`; `media-type` precisa começar com `image/`; segundo `unzipSync(bytes, { filter: path === capa })`; ausente → sem capa. Data URL via `btoa` em fatias de 32 KB (evita estouro de argumentos em `String.fromCharCode`).
9. `doc = { id: blocks[0].id, name: título, blocks, savedAt: Date.now(), cover }`. O mesmo `name` sai de `toLibraryDocument` ao salvar de novo, porque `sourceTitle` do primeiro bloco é o título.

Sem limite de `MAX_BUFFER_CHARS` (spec P1-A AC9).

ponytail: `unzipSync` e `DOMParser` rodam na thread da página; um EPUB muito grande congela a UI por alguns instantes. Mover para worker quando um livro real incomodar. O `unzip` assíncrono do `fflate` cria workers por blob URL, que a CSP `script-src 'self'` recusa.

## `lib/storage.ts` — `saveDocument`

```ts
const prev = docs.find((d) => d.id === doc.id);
const next = doc.cover || !prev?.cover ? doc : { ...doc, cover: prev.cover };
```

Um ponto só: tanto Salvar (`DocumentActions`) quanto "Salvar e substituir"
(`useReplaceGuard`) passam por `saveDocument` com `toLibraryDocument`, que não conhece a capa.

## UI

**`NewDocumentMenu`**: segundo `<input type="file" accept=".epub" hidden>` e item "Livro / EPUB" (ícone `BookOpen`). No `onChange`:
`parseEpub(new Uint8Array(await file.arrayBuffer()), file.name, navigator.language)` → falha vira Alert
(`invalid` "EPUB inválido", `drm` "EPUB protegido por DRM não é suportado", `empty` "Arquivo vazio") →
`saveDocument(doc)` (falha → `MESSAGES.quota`) → `guard.open(doc.blocks, onOpened)`.

**`LibraryList`**: linha vira `flex-row`; à esquerda `<img src={doc.cover} alt="" className="h-16 w-12 shrink-0 rounded-sm object-cover">` ou, sem capa, o mesmo espaço com `FileText` em `text-muted-foreground`.

**`BlockList`**:
- `visible?: string` — quando definido, renderiza só o bloco com esse id; `save`/`persist`/`persistLang` continuam mapeando sobre o `blocks` completo (filtrar as props apagaria os outros capítulos ao gravar).
- Por parágrafo: `kind = block.kinds?.length === paragraphs.length ? block.kinds[paraIndex] : 'p'`; tag `h1`..`h6` ou `p`; classes em `em` para seguir o zoom (`h1` `text-[1.6em] font-semibold`, `h2` `text-[1.4em] font-semibold`, `h3` `text-[1.2em] font-semibold`, `h4`..`h6` `font-semibold`, `quote` `border-l-2 pl-4 italic text-muted-foreground`, `li` `ml-6 list-item list-disc`).

**`entrypoints/documents/App.tsx`**:
- `paged = blocks.some((b) => b.kinds)`; `const [page, setPage] = useState(0)`.
- Efeito em `state.cursor?.blockId`: índice ≥ 0 → `setPage(índice)`.
- Efeito em `blocks[0]?.id`: `setPage(0)` (documento trocado).
- `current = Math.min(page, blocks.length - 1)`; `BlockList visible={paged ? blocks[current].id : undefined}`.
- No `header`, quando `paged`: botões `ChevronLeft`/`ChevronRight` (`size="icon-sm"`, tooltip "Página anterior"/"Próxima página", desabilitados nas pontas) e `N / total` em `text-muted-foreground`.

## Dependências

- `fflate` (runtime, ~8 KB gz) — usado só por `lib/epub.ts`, carregado só pela página Documentos.
- `happy-dom` (dev) — ambiente só de `lib/epub.test.ts`. Se o `DOMParser` XML do happy-dom falhar nas fixtures, trocar por `jsdom` no mesmo comentário de ambiente.

## Riscos

- Extração por tipo achata poesia, tabelas, notas e imagens (aceito no council Q1).
- `happy-dom` não é o `DOMParser` do Chrome: o UAT com EPUBs reais (EPUB 2 e EPUB 3) é obrigatório.
- MP3 e tradução de um livro inteiro são lentos; comportamento já existente para documentos grandes da biblioteca.
