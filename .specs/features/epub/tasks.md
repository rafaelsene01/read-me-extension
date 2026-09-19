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
| Lógica pura em `lib/` (epub, storage) | unit | Todos os ramos; 1:1 com as ACs da spec que o módulo implementa; todo edge case listado tem teste | `lib/**/*.test.ts` | `pnpm test` |
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

- [ ] Caso: salvar sem `cover` sobre item com `cover` mantém a `cover` (P1-C AC4)
- [ ] Caso: salvar com `cover` nova substitui a antiga
- [ ] Caso: salvar sem `cover` item novo grava sem `cover`
- [ ] Testes existentes de `saveDocument`/`getDocuments` continuam passando
- [ ] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): keep library cover when re-saving a document`

---

### T2: Parser de EPUB

**What**: Criar `parseEpub(bytes, fileName, fallbackLang): EpubResult` conforme `design.md` § `lib/epub.ts` (container → OPF → spine → parágrafos com tipo → capa), acrescentar `ParagraphKind` e `Block.kinds?` em `lib/types.ts`, adicionar `fflate` (dependência) e `happy-dom` (devDependency). Testes montam EPUBs com `zipSync` do `fflate` e rodam com `// @vitest-environment happy-dom`.
**Where**: `lib/epub.ts`, `lib/epub.test.ts`, `lib/types.ts`, `package.json`, `pnpm-lock.yaml`
**Depends on**: T1
**Reuses**: `segmentBlock` (`lib/segment.ts`), `LibraryDocument` (`lib/document.ts`)
**Requirement**: EPUB-01, EPUB-02, EPUB-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Caso: EPUB 3 com 2 capítulos gera 2 blocos na ordem do spine, `name`/`sourceTitle` = `dc:title`, `lang` = `dc:language`, `doc.id` = `blocks[0].id` (P1-A AC2, P1-B AC1, AC5)
- [ ] Caso: `h1` + `p` + `blockquote > p` + `ul > li` gera `kinds` `['h1','p','quote','li']` sem texto repetido; `script`/`style` ignorados (P1-B AC3, AC4)
- [ ] Caso: `paragraphs` igual a `segmentBlock(text, lang, id)` e `kinds.length === paragraphs.length`
- [ ] Caso: `sourceUrl` = texto do primeiro `h1`..`h3`; capítulo sem título → "Capítulo N" (P1-B AC5)
- [ ] Caso: `linear="no"` e capítulo sem texto pulados (P1-B AC2)
- [ ] Caso: `href` com `%20` em subpasta relativa ao OPF é encontrado (edge case)
- [ ] Caso: capítulo com XHTML malformado é lido como HTML (P1-B AC6)
- [ ] Caso: sem `dc:title` → nome do arquivo sem `.epub`; sem `dc:language` → `fallbackLang` (P1-B AC7)
- [ ] Caso: capa por `properties="cover-image"` e por `<meta name="cover">` vira `data:image/...;base64,` com os bytes certos; capa ausente do zip → sem `cover` (P1-C AC1, AC2, edge case)
- [ ] Caso: bytes que não são zip, zip sem `container.xml`, OPF ilegível → `invalid` (P1-A AC5)
- [ ] Caso: `encryption.xml` cifrando capítulo do spine → `drm`; só fonte → ok (P1-A AC6, edge case)
- [ ] Caso: nenhum capítulo com texto → `empty` (P1-A AC7)
- [ ] Caso: livro com 600.000 caracteres → ok (P1-A AC9)
- [ ] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(epub): parse epub chapters, formatting and cover`

---

### T3: Tipos de parágrafo e bloco visível no BlockList

**What**: No `BlockList`, aceitar `visible?: string` (renderiza só esse bloco; as gravações continuam sobre `blocks` inteiro) e renderizar cada parágrafo pela tag/classe do seu tipo quando `block.kinds?.length === paragraphs.length`, senão como hoje (`design.md` § UI).
**Where**: `components/BlockList.tsx`
**Depends on**: None (Phase 1 inteira)
**Reuses**: `cn`, classes de tamanho em `em` para seguir o `textSize`
**Requirement**: EPUB-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-D AC6: título do capítulo maior que o texto, citação recuada com borda, item de lista com marcador, e tudo cresce com o zoom (UAT pendente)
- [ ] Manual P1-D AC7: editar um capítulo mudando o número de linhas renderiza tudo como parágrafo comum (UAT pendente)
- [ ] Manual P1-D AC8: clique numa frase de título ou citação faz seek; destaque aparece; aba Tradução mantém os tipos (UAT pendente)
- [ ] Manual: painel lateral e documentos `.txt` renderizam como antes (UAT pendente)
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): render paragraph kinds and a single visible block`

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
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

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
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

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
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(epub): page through book chapters`
