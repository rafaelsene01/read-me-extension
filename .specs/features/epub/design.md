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
| Seek, destaque, MP3 | Inalterados: continuam lendo `paragraphs`/`sentences` |
| Livro sem edição | `BlockList` oculta Editar quando `block.kinds` existe |
| Livro sem tradução gravada | `TranslatePanel` só traduz blocos sem `kinds`; `BlockList` mostra o original de blocos com `kinds` |
| Ouvir livro traduzido em tempo real | Engine chama `translate` antes de falar frase de bloco com `kinds` na aba de tradução; tradutor no offscreen pelo canal `translate` |

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

Capítulo de livro não é editável nem ganha `translation`, então só `applyLang` re-segmenta, e ele
mantém as mesmas linhas: `kinds[i]` é sempre o tipo do parágrafo `i`. Nenhuma mudança em
`lib/edit.ts`. `viewOf` não muda: bloco de livro nunca tem `translation`, então a vista
continua com as frases originais, e o cursor anda sobre elas.

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
- Botão Editar só quando `activeTab === 'original' && !block.kinds` (spec P1-D AC8).
- `paragraphsFor`: `activeTab === 'original' || block.kinds` → `block.paragraphs` (spec P1-D AC9).
- `visible?: string` — quando definido, renderiza só o bloco com esse id; `save`/`persist`/`persistLang` continuam mapeando sobre o `blocks` completo (filtrar as props apagaria os outros capítulos ao gravar).
- Por parágrafo: `kind = block.kinds?.[paraIndex] ?? 'p'`; tag `h1`..`h6` ou `p`; classes em `em` para seguir o zoom (`h1` `text-[1.6em] font-semibold`, `h2` `text-[1.4em] font-semibold`, `h3` `text-[1.2em] font-semibold`, `h4`..`h6` `font-semibold`, `quote` `border-l-2 pl-4 italic text-muted-foreground`, `li` `ml-6 list-item list-disc`).

**`TranslatePanel`** (painel lateral e página Documentos usam o mesmo):
- `translatable = blocks.filter((b) => !b.kinds)`; `bookOnly = blocks.length > 0 && translatable.length === 0`.
- `bookOnly`: rótulo da segunda aba vira "Ouvir traduzido" e o botão Traduzir não é renderizado (spec P1-D AC10). Ao escolher essa aba, ou trocar o idioma de destino com ela ativa, o handler chama `preparePair(blocks[0].lang, target, setProgress)` no mesmo clique, sem `await` antes (spec P2-A AC8); falha vira o Alert existente.
- `sourceLang` de `translatable[0] ?? blocks[0]`; `blocked` também quando `translatable` está vazio.
- `translate()` cria os jobs só sobre `translatable` e grava `setBlocks(blocks.map(...))` casando a tradução por `id`, deixando os blocos de livro intactos (spec P1-D AC11).

**`entrypoints/documents/App.tsx`**:
- `paged = blocks.some((b) => b.kinds)`; `const [page, setPage] = useState(0)`.
- Efeito em `state.cursor?.blockId`: índice ≥ 0 → `setPage(índice)`.
- Efeito em `blocks[0]?.id`: `setPage(0)` (documento trocado).
- `current = Math.min(page, blocks.length - 1)`; `BlockList visible={paged ? blocks[current].id : undefined}`.
- No `header`, quando `paged`: botões `ChevronLeft`/`ChevronRight` (`size="icon-sm"`, tooltip "Página anterior"/"Próxima página", desabilitados nas pontas) e `N / total` em `text-muted-foreground`.

## Tradução em tempo real (P2-A)

A Translator API não existe em workers, logo nem no service worker onde vive o engine.
Ela roda no documento offscreen (que já existe para a voz neural), atrás de um canal
próprio com resposta:

```
engine (SW) ── translate(text, from, to) ── requestTranslation ── ensureOffscreen + sendMessage {channel:'translate'}
                                                                     │
offscreen ── serveTranslations(): Map<par, Promise<Translator>> + Map<par|texto, Promise<string>> ──► sendResponse {ok, text | error}
```

**`lib/translate.ts`** (+):
- `TRANSLATE_CHANNEL = 'translate'`; mensagem `{ channel, text, source, target }`; resposta `{ ok: true, text } | { ok: false, error }`.
- `requestTranslation(text, source, target): Promise<string>` — lado SW: `await ensureOffscreen()`, `chrome.runtime.sendMessage`, rejeita com `error` quando `ok: false` ou sem resposta.
- `serveTranslations(): void` — lado host: listener que responde só ao canal `translate` (`return true` para resposta assíncrona); cria um `Translator` por par (`${source}>${target}`) e reusa; cache `${par}|${text}` → `Promise<string>` (a promessa rejeitada sai do cache). ponytail: cache sem limite, vive até o offscreen fechar por ociosidade; limitar se a memória incomodar.
- `preparePair(source, target, onProgress): Promise<void>` — lado página: `Translator.create` com `monitor` (o gesto do clique autoriza o download), descarta a instância.

**`lib/engine.ts`**:
- `EngineDeps.translate?: (text: string, source: string, target: string) => Promise<string>`.
- `speakAt`: quando `block.kinds && prefs.activeTab === 'translation' && translate`, o texto falado é `await translate(sentence.text, block.lang, prefs.targetLang)` e `options.lang = prefs.targetLang` (voz do destino). O cursor é gravado antes, como hoje.
- Geração: contador `generation` incrementado em `pause`, `stop`, `seek`, `setTtsEngine`, `blocksChanged` (quando para) e a cada `speakAt`; depois do `await`, se a geração mudou, descarta sem falar (spec P2-A AC6).
- Prefetch: depois de chamar `speak`, se o próximo cursor (`nextCursor`) cai em bloco com `kinds`, dispara `translate` dele sem aguardar e ignora falha (spec P2-A AC4); o cache do host transforma o pedido seguinte em acerto.
- Falha: `halt(\`Falha na tradução: ${mensagem}\`)`, cursor mantido (spec P2-A AC7).
- `chunkSentence` passa a receber o texto traduzido.

**`entrypoints/background.ts`**: `createEngine({ ..., translate: requestTranslation })`.

**`entrypoints/offscreen/main.ts`**: chama `serveTranslations()` e rearma `armIdleClose()` a cada pedido, para o documento não fechar no meio da leitura traduzida com a voz do sistema.

**Spike (T8)**: antes de tudo, provar no Chrome que `Translator.availability` e `Translator.create` funcionam no documento offscreen da extensão. Se não funcionarem, `serveTranslations()` é chamado em `entrypoints/documents/App.tsx` em vez do offscreen, `requestTranslation` pula o `ensureOffscreen`, a spec P2-A AC9 cai e o fato vai para `STATE.md`. O resto do desenho não muda.

## Dependências

- `fflate` (runtime, ~8 KB gz) — usado só por `lib/epub.ts`, carregado só pela página Documentos.
- `jsdom` (dev) — ambiente só de `lib/epub.test.ts` (substituiu o `happy-dom` previsto; o `DOMParser` XML do jsdom cobre as fixtures).

## Riscos

- Extração por tipo achata poesia, tabelas, notas e imagens (aceito no council Q1).
- `jsdom` não é o `DOMParser` do Chrome: o UAT com EPUBs reais (EPUB 2 e EPUB 3) é obrigatório.
- MP3 de um livro inteiro é lento; comportamento já existente para documentos grandes da biblioteca.
- Frase traduzida isolada perde contexto (pronomes, gênero); aceito no council Q7.
- Seek para longe do prefetch espera uma tradução (dezenas a centenas de ms) antes de falar.

## Exibição com HTML e CSS do livro (P1-E)

Revê a decisão do council Q1 a pedido do usuário. O modelo de frases fica como está
(engine, seek, tradução ao vivo e MP3 não mudam); só a **exibição** do capítulo na página
Documentos passa a usar o HTML original.

**Dados**
- `Block.epub?: { book: string; path: string }` (`lib/types.ts`), preenchido por `parseEpub`: `book` = id do livro (`blocks[0].id`), `path` = caminho do capítulo no zip.
- `lib/book-assets.ts`: `saveBook(id, bytes)` / `loadBook(id): Promise<Uint8Array | null>` sobre `caches.open('readme-books')`, com `Request` `https://books.invalid/<id>`; `loadBook` guarda o resultado num `Map` em memória. `NewDocumentMenu` chama `saveBook(doc.id, bytes)` antes de `saveDocument`; falha → `MESSAGES.quota`.

**Render (`lib/book-render.ts`)**
- Puro, sem DOM (testes em Node):
  - `sentenceRanges(texts: string[], sentences: string[]): Array<Array<{ node: number; start: number; end: number }>>`: recebe o texto cru dos nós de texto de um parágrafo e as frases de `block.paragraphs[i]`. Colapsa espaços como a extração (`\s+` → espaço, `trim`), acha cada frase em ordem com `indexOf` a partir da anterior e devolve, por frase, os trechos `[start, end)` em cada nó cru. Frase não achada → lista vazia.
  - `sanitizeCss(css: string, resolve: (url: string) => string | null): string`: remove `@import`; troca `url(...)` por `resolve(url)` e remove a declaração quando `resolve` devolve `null` (inclui `http(s)://`); troca os seletores `html` e `body` por `.rm-book`.
- Com DOM (testes em jsdom):
  - `renderChapter(bytes: Uint8Array, block: Block): { html: DocumentFragment; css: string; urls: string[] } | null`: `unzipSync` só do capítulo, das folhas ligadas e dos recursos referenciados; parse igual ao `parseEpub` (XHTML → HTML se `parsererror`); junta `<style>` e `<link rel=stylesheet>` em `css` (via `sanitizeCss`, URLs relativas à folha); remove `script,iframe,object,embed,link,style`, atributos `on*` e `href`/`src` `javascript:`; `img[src]` e `image[href]` → `URL.createObjectURL(new Blob([bytes], { type }))` (tipo pela extensão), listadas em `urls` para `revokeObjectURL`; URLs remotas removidas. Folhas de parágrafo pela mesma regra da extração (`PARA_SELECTOR` + folha + texto não vazio, exportada de `lib/epub.ts`); quando a quantidade bate com `block.paragraphs.length`, cada frase vira `<span class="rm-s" data-s="p:s">` sobre os trechos de `sentenceRanges`; senão, sem spans. O `<body>` vira um `<div class="rm-book">`.

**`components/BookChapter.tsx`**
- `{ block, cursor, textSize }`. Carrega `loadBook(block.epub.book)`; `null` → devolve `null` e o `BlockList` cai no render com `kinds`.
- Host `div` com `bg-paper text-paper-foreground rounded-md p-6` e `textSize`; `attachShadow({ mode: 'open' })` uma vez; conteúdo = `<style>` (`css` do livro + regras das frases: `.rm-s{cursor:pointer;border-radius:.25em}` `.rm-s:hover{background:var(--muted)}` `.rm-s.rm-on{background:var(--highlight)}`) + o fragmento.
- Clique delegado no shadow root: `.rm-s` → `sendCommand({ type: 'seek', cursor })` a partir de `data-s`; `a[href]` → `preventDefault`, `http(s)` abre com `window.open(href, '_blank', 'noopener')`.
- Destaque: efeito no cursor troca `rm-on` nos spans `data-s` da frase ativa e rola o primeiro para a vista.
- Unmount/troca de capítulo: `revokeObjectURL` de `urls`.

**`BlockList`**: prop `bookView?: boolean` (só a página Documentos passa `true`); bloco com `epub` e `bookView` renderiza `<BookChapter>` no lugar dos parágrafos, com fallback para o render atual quando ele devolve `null`. Painel lateral sem mudança.

**Tokens** (`entrypoints/sidepanel/style.css`): `--paper` e `--paper-foreground` claros nos dois temas, mapeados para `--color-paper`/`--color-paper-foreground`.

ponytail: o zip é relido a cada troca de capítulo (bytes em memória, `unzipSync` com filtro); guardar capítulos já renderizados se a troca ficar lenta.

## Excluir da biblioteca (P2-B)

- `lib/storage.ts`: `deleteDocument(id: string): Promise<SetResult>` — filtra `local:documents` pelo id e grava; erro de gravação devolve `{ ok: false, reason: 'quota' }` como os demais.
- `lib/book-assets.ts` (T13): `deleteBook(id: string): Promise<void>` — `cache.delete` da chave do livro e remoção do `Map` em memória; ausência da entrada não é erro.
- `components/LibraryList.tsx`: cada linha ganha um botão só de ícone (`Trash2`, `variant="ghost"`, `size="icon-sm"`, `aria-label="Excluir"`) fora do botão que abre o documento (o botão da linha vira um `div` com o botão de abrir e o de excluir lado a lado, para não aninhar `<button>`). O clique abre o `Dialog` já usado no projeto, com o nome do documento, Cancelar e Excluir; confirmar chama `deleteDocument(doc.id)` e, em seguida, `deleteBook(doc.id)`; falha vira Alert "Falha ao excluir". A lista já segue `storage.local.onChanged`, então ela se atualiza sozinha.
- O buffer (`local:blocks`) não é tocado: um livro aberto continua sendo lido depois de sair da biblioteca; o capítulo exibido usa os bytes em memória até a página ser recarregada.

