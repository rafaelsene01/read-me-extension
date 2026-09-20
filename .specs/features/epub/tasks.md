# EPUB — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Commits:** o usuário não permite commits do agente (`~/.claude/CLAUDE.md`). Cada tarefa deixa sua mensagem Conventional Commit em `.specs/features/epub/COMMITS.md`, no padrão da feature `documents`, e o usuário commita.

---

**Design**: `.specs/features/epub/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do codebase e da AD-011 (`.specs/STATE.md`). Guidelines found: `.specs/STATE.md` AD-011 (testes só sobre `lib/`), `CLAUDE.md` (UI só com shadcn/ui, Tailwind, sem cor fixa), `vitest` via `package.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Lógica pura em `lib/` (epub, storage, translate, engine) | unit | Todos os ramos; 1:1 com as ACs da spec que o módulo implementa; todo edge case listado tem teste | `lib/**/*.test.ts` | `pnpm test` |
| Componentes React (`components/*.tsx`) | none | Sem runner de DOM (AD-011); verificação manual descrita em cada `Done when` | — | build gate + passo manual |
| Entrypoint `entrypoints/documents/*` | none | Apenas fiação; verificação manual | — | build gate + passo manual |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tarefas com testes unitários | `pnpm test` |
| Full | Após tarefas que tocam tipos compartilhados ou dependências | `pnpm compile && pnpm test` |
| Build | Após tarefas de componentes ou entrypoints | `pnpm compile && pnpm test && pnpm build` |

---

## Execution Plan

### Phase 1: Lógica em `lib/`

```
T1 → T2
```

### Phase 2: UI

```
T3 → T6
T4
T5
```

### Phase 3: Leitura traduzida em tempo real

```
T8 → T9 → T10 → T11
T9 → T7
```

### Phase 4: Capítulo com HTML e CSS do livro

```
T12 → T13
T12 → T14 → T15 → T16
T13 → T17
```

---

## Task Breakdown

### T1: Capa no documento da biblioteca

**What**: Acrescentar `cover?: string` a `LibraryDocument` e fazer `saveDocument` manter a `cover` do item existente de mesmo id quando o documento recebido não tem `cover`.
**Where**: `lib/document.ts`, `lib/storage.ts`, `lib/storage.test.ts`
**Depends on**: None
**Reuses**: `saveDocument` existente (upsert por id)
**Requirement**: EPUB-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: salvar sem `cover` sobre item com `cover` mantém a `cover` (P1-C AC4)
- [x] Caso: salvar com `cover` nova substitui a antiga
- [x] Caso: salvar sem `cover` item novo grava sem `cover`
- [x] Testes existentes de `saveDocument`/`getDocuments` continuam passando
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): keep library cover when re-saving a document`

---

### T2: Parser de EPUB

**What**: Criar `parseEpub(bytes, fileName, fallbackLang): EpubResult` conforme `design.md` § `lib/epub.ts` (container → OPF → spine → parágrafos com tipo → capa), acrescentar `ParagraphKind` e `Block.kinds?` em `lib/types.ts`, adicionar `fflate` (dependência) e `jsdom` (devDependency). Testes montam EPUBs com `zipSync` do `fflate` e rodam com `// @vitest-environment jsdom`.
**Where**: `lib/epub.ts`, `lib/epub.test.ts`, `lib/types.ts`, `package.json`, `pnpm-lock.yaml`
**Depends on**: T1
**Reuses**: `segmentBlock` (`lib/segment.ts`), `LibraryDocument` (`lib/document.ts`)
**Requirement**: EPUB-01, EPUB-02, EPUB-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: EPUB 3 com 2 capítulos gera 2 blocos na ordem do spine, `name`/`sourceTitle` = `dc:title`, `lang` = `dc:language`, `doc.id` = `blocks[0].id` (P1-A AC2, P1-B AC1, AC5)
- [x] Caso: `h1` + `p` + `blockquote > p` + `ul > li` gera `kinds` `['h1','p','quote','li']` sem texto repetido; `script`/`style` ignorados (P1-B AC3, AC4)
- [x] Caso: `paragraphs` igual a `segmentBlock(text, lang, id)` e `kinds.length === paragraphs.length`
- [x] Caso: `sourceUrl` = texto do primeiro `h1`..`h3`; capítulo sem título → "Capítulo N" (P1-B AC5)
- [x] Caso: `linear="no"` e capítulo sem texto pulados (P1-B AC2)
- [x] Caso: `href` com `%20` em subpasta relativa ao OPF é encontrado (edge case)
- [x] Caso: capítulo com XHTML malformado é lido como HTML (P1-B AC6)
- [x] Caso: sem `dc:title` → nome do arquivo sem `.epub`; sem `dc:language` → `fallbackLang` (P1-B AC7)
- [x] Caso: capa por `properties="cover-image"` e por `<meta name="cover">` vira `data:image/...;base64,` com os bytes certos; capa ausente do zip → sem `cover` (P1-C AC1, AC2, edge case)
- [x] Caso: bytes que não são zip, zip sem `container.xml`, OPF ilegível → `invalid` (P1-A AC5)
- [x] Caso: `encryption.xml` cifrando capítulo do spine → `drm`; só fonte → ok (P1-A AC6, edge case)
- [x] Caso: nenhum capítulo com texto → `empty` (P1-A AC7)
- [x] Caso: livro com 600.000 caracteres → ok (P1-A AC9)
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): parse epub chapters, formatting and cover`

---

### T3: Tipos de parágrafo e bloco visível no BlockList

**What**: No `BlockList`, ocultar o botão Editar em blocos com `kinds`, mostrar o original desses blocos mesmo na aba Tradução, aceitar `visible?: string` (renderiza só esse bloco; as gravações continuam sobre `blocks` inteiro) e renderizar cada parágrafo pela tag/classe de `block.kinds?.[i]`, senão como hoje (`design.md` § UI).
**Where**: `components/BlockList.tsx`
**Depends on**: None (Phase 1 inteira)
**Reuses**: `cn`, classes de tamanho em `em` para seguir o `textSize`
**Requirement**: EPUB-07, EPUB-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-D AC6: título do capítulo maior que o texto, citação recuada com borda, item de lista com marcador, e tudo cresce com o zoom (UAT pendente)
- [ ] Manual P1-D AC8: capítulo de livro não mostra o botão Editar; `.txt` e capturas continuam editáveis (UAT pendente)
- [ ] Manual P1-D AC7: clique numa frase de título ou citação faz seek; destaque aparece (UAT pendente)
- [ ] Manual P1-D AC9: com a aba Tradução ativa, capítulo de livro mostra o original (UAT pendente)
- [ ] Manual: painel lateral e documentos `.txt` renderizam como antes (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): render paragraph kinds, single visible block, read-only books`

---

### T4: Capa na lista da biblioteca

**What**: Em cada linha do `LibraryList`, mostrar a capa (`<img>` `h-16 w-12 object-cover`) à esquerda do nome e da data, ou o ícone `FileText` no mesmo espaço quando o documento não tem `cover`.
**Where**: `components/LibraryList.tsx`
**Depends on**: None (Phase 1 inteira)
**Reuses**: `Button`/`Card` existentes da linha
**Requirement**: EPUB-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-C AC3: livro com capa mostra a capa; `.txt` salvo mostra o ícone alinhado (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): show book covers in the library`

---

### T5: Importar EPUB pelo menu Novo

**What**: No `NewDocumentMenu`, acrescentar o item "Livro" / "EPUB" com um segundo input `accept=".epub"`; no arquivo escolhido, `parseEpub` → Alert da falha (`invalid` "EPUB inválido", `drm` "EPUB protegido por DRM não é suportado", `empty` "Arquivo vazio") → `saveDocument(doc)` (falha → `MESSAGES.quota`, sem abrir) → `guard.open(doc.blocks, onOpened)`.
**Where**: `components/NewDocumentMenu.tsx`
**Depends on**: None (Phase 1 inteira)
**Reuses**: `useReplaceGuard`, `saveDocument`, `MESSAGES.quota`, `DropdownMenuItem` existente
**Requirement**: EPUB-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-A AC1: menu Novo mostra "Livro / EPUB" e o seletor filtra `.epub` (UAT pendente)
- [ ] Manual P1-A AC2, AC3: EPUB real aparece na Biblioteca e abre em Arquivo (UAT pendente)
- [ ] Manual P1-A AC4: com buffer cheio, Cancelar mantém o buffer e o livro fica na Biblioteca (UAT pendente)
- [ ] Manual P1-A AC5: um `.zip` qualquer renomeado para `.epub` mostra "EPUB inválido" (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): import epub books into the library`

---

### T6: Paginação por capítulo na página Documentos

**What**: No `App` da página Documentos, com `paged = blocks.some((b) => b.kinds)`: estado `page`, página segue `state.cursor?.blockId`, volta a 0 quando `blocks[0]?.id` muda, passa `visible` ao `BlockList` e mostra no `header` os botões Anterior/Próximo (desabilitados nas pontas, com tooltip) e "N / total" (`design.md` § UI).
**Where**: `entrypoints/documents/App.tsx`
**Depends on**: T3
**Reuses**: `Button`, `Tooltip`, padrão de `zoomButton` do mesmo arquivo
**Requirement**: EPUB-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-D AC1, AC2: livro mostra um capítulo com "1 / N"; `.txt` e capturas continuam empilhados sem pager (UAT pendente)
- [ ] Manual P1-D AC3: com play, a página avança sozinha ao entrar no próximo capítulo (UAT pendente)
- [ ] Manual P1-D AC4: Próximo/Anterior trocam a página sem mudar o áudio (UAT pendente)
- [ ] Manual P1-D AC5: abrir outro livro da biblioteca volta para "1 / N" (UAT pendente)
- [ ] Manual edge case: captura acrescentada ao livro aberto vira a última página (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): page through book chapters`

---

### T7: Livro fora da tradução gravada, aba "Ouvir traduzido"

**What**: No `TranslatePanel`, traduzir só blocos sem `kinds` (tradução casada por `id` ao gravar); com buffer só de livro, trocar o rótulo da segunda aba para "Ouvir traduzido", esconder o botão Traduzir e, ao escolher essa aba ou trocar o destino com ela ativa, chamar `preparePair` no mesmo clique com a barra de progresso (`design.md` § UI).
**Where**: `components/TranslatePanel.tsx`
**Depends on**: T9
**Reuses**: `preparePair` (T9), `translateBlock`, `setBlocks`, `segmentBlock`, `hashText`, `Progress`, `Alert` já usados no componente
**Requirement**: EPUB-09, EPUB-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-D AC10: livro aberto mostra "Original" / "Ouvir traduzido" e o idioma de destino, sem Traduzir, no painel lateral e na página Documentos (UAT pendente)
- [ ] Manual P1-D AC11: livro + uma captura, Traduzir traduz só a captura; capítulos seguem sem `translation` (UAT pendente)
- [ ] Manual P2-A AC8: par ainda não baixado mostra progresso ao escolher "Ouvir traduzido" (UAT pendente)
- [ ] Manual: buffer sem livro traduz como antes (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): listen to books translated, keep them out of stored translation`

---

### T8: Spike — Translator API no documento offscreen

**What**: Com a extensão carregada (`pnpm dev`), tocar uma frase com voz neural para abrir o offscreen, abrir o DevTools dele em `chrome://extensions` e rodar `await Translator.availability({sourceLanguage:'en',targetLanguage:'pt'})` e `await (await Translator.create({sourceLanguage:'en',targetLanguage:'pt'})).translate('Hello')` com o par já baixado. Registrar o resultado como AD-018 em `.specs/STATE.md`. Sem mudança de código.
**Where**: `.specs/STATE.md`
**Depends on**: None
**Reuses**: offscreen existente
**Requirement**: EPUB-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] AD-018 registra se a Translator API funciona no offscreen (sim/não, versão do Chrome)
- [ ] Se não funciona: `design.md` § Spike aplicado (host na página Documentos) antes de T9, e P2-A AC9 marcada como fora de escopo na spec

**Tests**: none
**Gate**: manual

**Commit**: `docs(epub): record translator availability in offscreen document`

---

### T9: Canal de tradução e preparo do par

**What**: Em `lib/translate.ts`, criar `TRANSLATE_CHANNEL`, `requestTranslation` (SW: `ensureOffscreen` + `sendMessage`, rejeita em `ok: false`), `serveTranslations` (host: um `Translator` por par, cache `par|texto` de promessas, promessa rejeitada sai do cache, responde só ao canal `translate`) e `preparePair` (página: `create` com `monitor`), conforme `design.md` § Tradução em tempo real.
**Where**: `lib/translate.ts`, `lib/translate.test.ts`
**Depends on**: T8
**Reuses**: `factory()`, tipos `TranslatorFactory` do próprio módulo, `ensureOffscreen` (`lib/tts/offscreen.ts`)
**Requirement**: EPUB-11, EPUB-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: `serveTranslations` responde `{ ok: true, text }` com o `Translator` falso e ignora mensagens de outro canal
- [x] Caso: mesma frase e mesmo par pedidos duas vezes chamam `translate` do tradutor uma vez (P2-A AC5)
- [x] Caso: dois textos do mesmo par criam um só `Translator`; par diferente cria outro
- [x] Caso: falha do tradutor responde `{ ok: false, error }` e o pedido seguinte tenta de novo
- [x] Caso: `requestTranslation` resolve com `text` e rejeita com a mensagem de `error`
- [x] Caso: `preparePair` repassa o progresso do `monitor`
- [x] Testes existentes de `lib/translate.test.ts` continuam passando
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): translation channel served by the offscreen document`

---

### T10: Engine fala a tradução da frase de livro

**What**: Em `lib/engine.ts`, acrescentar `EngineDeps.translate` e, em `speakAt`, traduzir a frase de bloco com `kinds` quando `activeTab === 'translation'` (voz do destino), com contador de geração que descarta tradução obsoleta, prefetch da próxima frase de livro e `halt('Falha na tradução: …')` na falha, conforme `design.md` § Tradução em tempo real.
**Where**: `lib/engine.ts`, `lib/engine.test.ts`
**Depends on**: T9
**Reuses**: `nextCursor`, `chunkSentence`, `halt`, harness de `lib/engine.test.ts`
**Requirement**: EPUB-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: bloco com `kinds` na aba de tradução fala o texto traduzido com `lang` = `targetLang`; cursor gravado antes (P2-A AC1)
- [x] Caso: aba original fala o original sem chamar `translate` (P2-A AC2)
- [x] Caso: bloco sem `kinds` na aba de tradução segue a regra atual (`viewOf`), sem chamar `translate`
- [x] Caso: ao falar uma frase traduzida, `translate` é chamado para a frase seguinte (P2-A AC4)
- [x] Caso: `pause`, `stop` ou `seek` durante a tradução pendente não falam a frase antiga (P2-A AC6)
- [x] Caso: `translate` rejeita → leitura para, erro "Falha na tradução: <motivo>", cursor na frase (P2-A AC7)
- [x] Caso: sem `translate` nas deps, o livro é falado no original
- [x] Testes existentes de `lib/engine.test.ts` continuam passando
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): speak book sentences translated on the fly`

---

### T11: Ligar engine e offscreen ao canal de tradução

**What**: Passar `translate: requestTranslation` ao `createEngine` no background; no offscreen, chamar `serveTranslations()` e rearmar `armIdleClose()` a cada pedido de tradução.
**Where**: `entrypoints/background.ts`, `entrypoints/offscreen/main.ts`
**Depends on**: T10
**Reuses**: `requestTranslation`/`serveTranslations` (T9), `armIdleClose`
**Requirement**: EPUB-10, EPUB-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P2-A AC1, AC3: livro em inglês com "Ouvir traduzido" em Português fala em português e destaca a frase em inglês (UAT pendente)
- [ ] Manual P2-A AC9: fechar a página Documentos e o painel, a leitura continua traduzida (UAT pendente)
- [ ] Manual: voz do sistema e voz neural funcionam traduzidas (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): wire live translation between engine and offscreen`

---

### T12: `epub` nos blocos de capítulo

**What**: Acrescentar `Block.epub?: { book: string; path: string }` e preencher em `parseEpub` (`book` = `blocks[0].id`, `path` = caminho do capítulo no zip); exportar de `lib/epub.ts` o que a renderização reusa para achar as folhas de parágrafo (`PARA_SELECTOR`, regra de folha e `collapse`).
**Where**: `lib/types.ts`, `lib/epub.ts`, `lib/epub.test.ts`
**Depends on**: None
**Reuses**: `parseEpub`
**Requirement**: EPUB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: todo bloco tem `epub.book === doc.id` e `epub.path` igual ao caminho do capítulo no zip, na ordem do spine (P1-E AC1)
- [x] Testes existentes de `lib/epub.test.ts` continuam passando
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): tag chapter blocks with book and zip path`

---

### T13: Guardar o arquivo do livro

**What**: Criar `lib/book-assets.ts` (`saveBook`, `loadBook`, `deleteBook` sobre Cache Storage com `Map` em memória) e, no `NewDocumentMenu`, gravar os bytes com `saveBook(doc.id, bytes)` antes de `saveDocument` (falha → `MESSAGES.quota`, sem salvar nem abrir).
**Where**: `lib/book-assets.ts`, `components/NewDocumentMenu.tsx`
**Depends on**: T12
**Reuses**: `caches` nativo, `MESSAGES.quota`
**Requirement**: EPUB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-E AC1: depois de importar, `caches.open('readme-books')` no DevTools da página tem a entrada do livro (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): keep the epub file in the extension cache`

---

### T14: Mapear frases e sanitizar CSS (puro)

**What**: Criar em `lib/book-render.ts` as funções puras `sentenceRanges` e `sanitizeCss` conforme `design.md` § Exibição com HTML e CSS do livro.
**Where**: `lib/book-render.ts`, `lib/book-render.test.ts`
**Depends on**: T12
**Reuses**: `collapse` (`lib/epub.ts`)
**Requirement**: EPUB-14, EPUB-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: frases dentro de um nó e atravessando nós (`<i>`, `<a>`) viram os trechos certos por nó (P1-E AC6)
- [x] Caso: espaços, quebras de linha e espaços nas bordas do texto cru não deslocam os trechos
- [x] Caso: frase ausente devolve lista vazia sem afetar as seguintes
- [x] Caso: `sanitizeCss` remove `@import`, remove declarações com `url(http...)`, resolve `url(rel)` com `resolve`, e troca `html`/`body` por `.rm-book` sem tocar `.body-text` ou `tbody` (P1-E AC3, AC4, AC5)
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): map sentences to book text and sanitize book css`

---

### T15: Renderizar o capítulo a partir do zip

**What**: Acrescentar `renderChapter(bytes, block)` a `lib/book-render.ts`: extrai capítulo, folhas e recursos do zip, sanitiza o HTML, resolve imagens para blob URLs, junta o CSS sanitizado e envolve as frases em `span.rm-s[data-s]` quando os parágrafos casam (`design.md`).
**Where**: `lib/book-render.ts`, `lib/book-render.test.ts`
**Depends on**: T14
**Reuses**: `sentenceRanges`, `sanitizeCss`, `PARA_SELECTOR`/folha/`collapse` e o parse de `lib/epub.ts`, `fflate`
**Requirement**: EPUB-14, EPUB-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: `<style>` do capítulo e `<link rel=stylesheet>` do zip entram em `css`, com `url()` relativo à folha resolvido (P1-E AC2, AC3)
- [x] Caso: `img src` relativo ao capítulo vira `blob:` listado em `urls`; `src` remoto é removido (P1-E AC3, AC4)
- [x] Caso: `script`, `iframe`, `onclick`, `href="javascript:"` somem (P1-E AC4)
- [x] Caso: cada frase de `block.paragraphs` vira `span.rm-s` com `data-s="p:s"` e o texto visível do capítulo não muda (P1-E AC6)
- [x] Caso: número de parágrafos diferente → HTML sem spans (P1-E AC11)
- [x] Caso: capítulo ausente do zip → `null`
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): render a chapter from the epub with sentence spans`

---

### T16: Capítulo do livro na página Documentos

**What**: Criar `components/BookChapter.tsx` (Shadow DOM, CSS do livro + regras das frases com tokens, clique → `seek`, destaque + scroll da frase ativa, links sem navegação, revoga blob URLs), acrescentar a prop `bookView` ao `BlockList` com fallback para o render com `kinds`, passar `bookView` na página Documentos e criar os tokens `--paper`/`--paper-foreground`.
**Where**: `components/BookChapter.tsx`, `components/BlockList.tsx`, `entrypoints/documents/App.tsx`, `entrypoints/sidepanel/style.css`
**Depends on**: T15
**Reuses**: `loadBook` (T13), `renderChapter` (T15), `sendCommand`
**Requirement**: EPUB-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-E AC2, AC3: "Refactoring" mostra imagens de código e itálico; "TDD by Example" mostra títulos e listas com o CSS do livro (UAT pendente)
- [ ] Manual P1-E AC7, AC8: clique numa frase faz seek; frase lida destacada e rolada para a vista (UAT pendente)
- [ ] Manual P1-E AC5: estilos do livro não vazam para a barra lateral, rodapé e controles (UAT pendente)
- [ ] Manual P1-E AC9: link interno não navega; link `https` abre em nova aba (UAT pendente)
- [ ] Manual P1-E AC10, AC12: livro importado antes da mudança e painel lateral exibem com `kinds` (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): show chapters with the book's own html and css`

---

### T17: Excluir item da biblioteca

**What**: Criar `deleteDocument(id)` em `lib/storage.ts` e, no `LibraryList`, acrescentar por linha um botão Excluir (fora do botão que abre o documento) que pede confirmação num `Dialog` nomeando o documento; confirmar chama `deleteDocument(doc.id)` e `deleteBook(doc.id)`, falha vira Alert "Falha ao excluir" (`design.md` § Excluir da biblioteca).
**Where**: `lib/storage.ts`, `lib/storage.test.ts`, `components/LibraryList.tsx`
**Depends on**: T13
**Reuses**: `deleteBook` (T13), `Dialog`/`Button`/`Alert` de `components/ui/`, padrão do diálogo em `components/useReplaceGuard.tsx`
**Requirement**: EPUB-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Caso: `deleteDocument` remove só o item do id e mantém os demais (P2-B AC3)
- [x] Caso: `deleteDocument` com id inexistente mantém a biblioteca e devolve `{ ok: true }`
- [x] Caso: falha de gravação devolve `{ ok: false, reason: 'quota' }` e mantém a biblioteca (P2-B AC6)
- [ ] Manual P2-B AC1, AC2: cada linha tem Excluir e o diálogo nomeia o documento (UAT pendente)
- [ ] Manual P2-B AC4, AC5: Cancelar não muda nada; excluir o documento aberto não altera o buffer (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: unit
**Gate**: build

**Commit**: `feat(epub): delete documents from the library`

