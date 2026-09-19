# Documents — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

**Commits:** o usuário não permite commits do agente (`~/.claude/CLAUDE.md`). Cada tarefa deixa sua mensagem Conventional Commit em `.specs/features/documents/COMMITS.md`, no padrão da feature `tts-reader`, e o usuário commita.

---

**Design**: `.specs/features/documents/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do codebase e da AD-011 (`.specs/STATE.md`). Guidelines found: `.specs/STATE.md` AD-011 (testes só sobre `lib/`), `CLAUDE.md` (UI só com shadcn/ui), `vitest` via `package.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Lógica pura em `lib/` (markdown, document, storage, audio/mp3, tts/export) | unit | Todos os ramos; 1:1 com as ACs da spec que o módulo implementa; todo edge case listado tem teste; fronteiras numéricas em limite-1, limite e limite+1 | `lib/**/*.test.ts` | `pnpm test` |
| Componentes React e hooks (`components/*.tsx`, `components/*.ts`) | none | Sem runner de DOM (AD-011); verificação manual descrita em cada `Done when` | — | build gate + passo manual |
| Entrypoint `entrypoints/documents/*` | none | Apenas fiação; verificação manual | — | build gate + passo manual |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tarefas com testes unitários | `pnpm test` |
| Full | Após tarefas que tocam mais de um módulo de `lib/` | `pnpm compile && pnpm test` |
| Build | Após tarefas de componentes, entrypoints ou dependências | `pnpm compile && pnpm test && pnpm build` |

---

## Execution Plan

### Phase 1: Lógica em `lib/`

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Peças de UI

```
T6 → T7 → T8 → T9 → T10
```

### Phase 3: Página e entrada pelo painel

```
T11 → T12 → T13
```

---

## Task Breakdown

### T1: Remover sintaxe Markdown ✅

**What**: Criar `stripMarkdown(md: string): string` que remove marcadores de título, ênfase (`*`, `_`, `~~`), links `[t](u)` → `t`, imagens `![a](u)` → `a`, linhas de cerca de código (mantendo o conteúdo), marcadores de lista (`-`, `*`, `+`, `1.`), `>` de citação, linhas separadoras de tabela e `|` de tabela, crases de código inline e linhas só com `---`/`***`, preservando as quebras de linha que separam parágrafos.
**Where**: `lib/markdown.ts`
**Depends on**: None
**Reuses**: nada (regex em sequência; ponytail: sem parser, subir para um se aparecer Markdown aninhado mal lido)
**Requirement**: DOC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `lib/markdown.test.ts` tem um caso por construção listada em P1-B AC2
- [x] Caso: texto sem Markdown sai idêntico
- [x] Caso: `.md` só com `#` e `---` sai vazio após `trim()` (edge case da spec)
- [x] Caso: `snake_case_word` e `2 * 3` não são corrompidos
- [x] Gate check passes: `pnpm test`
- [x] Nenhum teste existente removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documents): strip markdown syntax for speech`

---

### T2: Converter arquivo em bloco ✅

**What**: Criar `fileToBlock(name, raw, lang)` retornando `{ ok: true, block }` ou `{ ok: false, reason: 'unsupported' | 'empty' | 'tooLarge' }`, a interface `LibraryDocument` e `toLibraryDocument(blocks, now)`; aceita `.txt`/`.md` sem distinguir maiúsculas, aplica `stripMarkdown` em `.md`, recusa vazio após `trim()` e texto com `>= MAX_BUFFER_CHARS`, e monta o `Block` com `crypto.randomUUID()`, `sourceTitle` e `sourceUrl` = `name`, `segmentBlock(text, lang, id)` e `createdAt`.
**Where**: `lib/document.ts`
**Depends on**: T1
**Reuses**: `segmentBlock` (`lib/segment.ts`), `MAX_BUFFER_CHARS` (`lib/storage.ts`), formato de bloco de `lib/capture.ts`
**Requirement**: DOC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `lib/document.test.ts` cobre P1-B AC1, AC2 (chama `stripMarkdown`), AC3 (`.pdf`, sem extensão), AC4 (vazio, só espaços, `.md` só sintaxe) e AC5
- [x] Fronteira: 499.999 aceito, 500.000 e 500.001 recusados com `tooLarge`
- [x] `NOTAS.MD` aceito como Markdown
- [x] `toLibraryDocument` usa `blocks[0].id` e `blocks[0].sourceTitle` (P2-A AC1)
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(documents): turn txt and md files into reader blocks`

---

### T3: Persistir a biblioteca ✅

**What**: Acrescentar a `lib/storage.ts` o item `local:documents` (`LibraryDocument[]`, fallback `[]`), `getDocuments()` ordenado por `savedAt` decrescente e `saveDocument(doc): Promise<SetResult>` que substitui o item de mesmo `id` ou acrescenta, devolvendo `{ ok: false, reason: 'quota' }` quando a escrita falha.
**Where**: `lib/storage.ts`
**Depends on**: T2
**Reuses**: `storage.defineItem` e o padrão try/catch de `setBlocks`
**Requirement**: DOC-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `lib/storage.test.ts` cobre P2-A AC1 (grava), AC2 (mesmo id atualiza, não duplica), AC3 (ordem decrescente) e AC5 (escrita que lança devolve `quota` e mantém a lista anterior)
- [x] Gate check passes: `pnpm compile && pnpm test`
- [x] Nenhum teste existente removido

**Tests**: unit
**Gate**: full

**Commit**: `feat(storage): save and list library documents`

---

### T4: Codificador MP3 em streaming ✅

**What**: Instalar `@breezystack/lamejs` (`pnpm add @breezystack/lamejs`) e criar `createMp3Encoder(sampleRate)` com `encode(pcm: Float32Array)` (converte para Int16 com clamp em [-1, 1] e codifica em blocos de 1152 amostras) e `finish(): Blob` (`audio/mpeg`, mono, 64 kbps), sem acumular PCM.
**Where**: `lib/audio/mp3.ts`
**Depends on**: T3
**Reuses**: nada (`encodeWav` em `lib/audio/player.ts` é o modelo de estilo)
**Requirement**: DOC-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `package.json` lista `@breezystack/lamejs` em `dependencies`
- [x] `lib/audio/mp3.test.ts`: 1 s de senoide a 24000 Hz gera Blob não vazio de tipo `audio/mpeg` cujos 2 primeiros bytes são sincronismo de frame MP3 (`0xFF`, `& 0xE0 === 0xE0`)
- [x] Teste do clamp: amostras 1,5 e -1,5 viram 32767 e -32768 (conversão exportada como `toInt16`)
- [x] Teste: `encode` chamado em pedaços de tamanhos diferentes de 1152 produz o mesmo tamanho de saída que uma chamada única
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: unit
**Gate**: build

**Commit**: `feat(audio): add streaming mp3 encoder`

---

### T5: Orquestrar a síntese para exportação ✅

**What**: Criar `exportAudio({ post, subscribe }, engine, jobs, onProgress)` que envia `load`, espera `status: 'ready'` do engine (rejeita em `status: 'error'`), sintetiza cada job (`{ text, options }`) em sequência com `requestId` novo, entrega cada `audio` a um encoder criado na primeira amostra com o `sampleRate` recebido, chama `onProgress((i + 1) / jobs.length)` a cada `audio-end`, rejeita em `error` do request corrente e resolve com `encoder.finish()`.
**Where**: `lib/tts/export.ts`
**Depends on**: T4
**Reuses**: `WorkerCommand`/`WorkerEvent` (`lib/tts/worker-protocol.ts`), `createMp3Encoder` (T4)
**Requirement**: DOC-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `lib/tts/export.test.ts` com host falso: 3 jobs geram 3 `synthesize` em ordem, só depois de `ready`
- [x] Progresso chamado com 1/3, 2/3, 1 (P2-B AC2)
- [x] `status: 'error'` no load rejeita com a mensagem do status (P2-B AC4)
- [x] `error` no meio rejeita e nenhum job seguinte é enviado (P2-B AC4)
- [x] Eventos de `requestId` antigo são ignorados
- [x] Gate check passes: `pnpm compile && pnpm test`

**Tests**: unit
**Gate**: full

**Commit**: `feat(tts): drive worker synthesis for audio export`

---

### T6: Extrair o estado do leitor para um hook ✅

**What**: Mover de `entrypoints/sidepanel/App.tsx` para `useReader()` o state do engine (`sendCommand({type:'state'})` + `playbackState`), `blocks` e `prefs` seguindo `storage.local.onChanged`, e fazer o App do painel usá-lo sem mudar comportamento.
**Where**: `components/useReader.ts` (novo) e `entrypoints/sidepanel/App.tsx` (usa o hook)
**Depends on**: None
**Reuses**: código atual de `entrypoints/sidepanel/App.tsx`
**Requirement**: DOC-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `App.tsx` do painel não declara mais `useEffect` de state/blocks/prefs
- [ ] Manual: painel captura, lê, destaca e traduz como antes (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `refactor(sidepanel): extract reader state into useReader hook`

---

### T7: Gate de abertura de documento ✅

**What**: Criar `useReplaceGuard()` que devolve `{ open(blocks, onOpened?), dialog }`: com o buffer vazio grava direto via `setBlocks`; senão mostra `Dialog` (shadcn) com Cancelar, Substituir e Salvar e substituir (este chama `saveDocument(toLibraryDocument(atual))` antes de `setBlocks`); erros de cota viram "Armazenamento cheio".
**Where**: `components/useReplaceGuard.tsx`
**Depends on**: T6
**Reuses**: `components/ui/dialog.tsx`, `getBlocks`/`setBlocks`/`saveDocument` (`lib/storage.ts`), `MESSAGES.quota` (`components/CaptureBar.tsx`)
**Requirement**: DOC-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-B AC6: buffer com captura do painel + importar → diálogo aparece (UAT pendente)
- [ ] Manual P1-B AC7: Cancelar mantém o buffer (UAT pendente)
- [ ] Manual P1-B AC8: Salvar e substituir → item novo na Biblioteca e documento no buffer (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(documents): confirm before replacing the reading buffer`

---

### T8: Botão MP3 ✅

**What**: Criar `Mp3Button` que, no clique, cria `new Worker(ttsWorkerUrl, { type: 'module' })` (import `../entrypoints/offscreen/tts-worker.ts?worker&url`; em `import.meta.env.DEV`, se o construtor lançar, usa `createTtsHost` na página), monta os jobs por parágrafo de `viewOf(blocks, prefs.activeTab)` com `lang` do bloco, `rate` de prefs e `voiceId` de `pickLocalVoice`, chama `exportAudio`, mostra `Progress`, baixa `<nome sem extensão>.mp3` via `<a download>` + `URL.createObjectURL`, e chama `worker.terminate()` em `finally` e no unmount; desabilitado com tooltip "Escolha uma voz neural para gerar MP3" quando `prefs.ttsEngine === 'system'`, e desabilitado durante a geração.
**Where**: `components/Mp3Button.tsx`
**Depends on**: T7
**Reuses**: `exportAudio` (T5), `viewOf` (`lib/engine.ts`), `pickLocalVoice` (`lib/tts/registry.ts`), `createTtsHost` (`lib/tts/local/host.ts`), `components/ui/{button,tooltip,progress,alert}.tsx`
**Requirement**: DOC-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P2-B AC1: Kokoro, documento de 3 parágrafos → `.mp3` baixado toca no player do sistema (UAT pendente)
- [ ] Manual P2-B AC3: voz do sistema → botão desabilitado com o tooltip (UAT pendente)
- [ ] Manual P2-B AC5: gerar MP3 com leitura tocando → a leitura não para (UAT pendente)
- [ ] Manual P2-B AC4: falha de modelo → Alert com a mensagem, nada baixado (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(documents): export document audio as mp3`

---

### T9: Barra de ações do arquivo ✅

**What**: Criar `DocumentActions` com Novo (ícone, `<input type="file" accept=".txt,.md" hidden>` → `file.text()` → `fileToBlock` → `guard.open`), Salvar (`saveDocument(toLibraryDocument(blocks))`), `Mp3Button` e Limpar (`sendCommand({type:'stop'})` + `clearBlocks()`), com Alert para "Formato não suportado", "Arquivo vazio", "Arquivo grande demais (limite de 500.000 caracteres)" e "Armazenamento cheio"; Salvar, MP3 e Limpar desabilitados com buffer vazio.
**Where**: `components/DocumentActions.tsx`
**Depends on**: T8
**Reuses**: `fileToBlock`/`toLibraryDocument` (T2), `saveDocument` (T3), `useReplaceGuard` (T7), `Mp3Button` (T8), padrão de Limpar de `components/CaptureBar.tsx`
**Requirement**: DOC-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-B AC1/AC2/AC3/AC4/AC5 com um arquivo de cada caso (UAT pendente)
- [ ] Manual P1-C AC4: Limpar com leitura tocando para a fala e esvazia (UAT pendente)
- [ ] Manual P2-A AC1/AC2: Salvar duas vezes o mesmo documento deixa um item só (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(documents): add import, save and clear actions`

---

### T10: Lista da biblioteca ✅

**What**: Criar `LibraryList({ onOpened })` que lê `getDocuments()` (e segue `storage.local.onChanged`), lista nome e data (`toLocaleString`) do mais recente ao mais antigo, abre o item clicado com `guard.open(doc.blocks, onOpened)` e mostra "Nenhum documento salvo." quando vazia.
**Where**: `components/LibraryList.tsx`
**Depends on**: T9
**Reuses**: `getDocuments` (T3), `useReplaceGuard` (T7), `components/ui/{card,button}.tsx`
**Requirement**: DOC-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P2-A AC3: dois documentos salvos aparecem em ordem decrescente (UAT pendente)
- [ ] Manual P2-A AC4: clicar abre o conteúdo (com tradução, se havia) e volta para Arquivo (UAT pendente)
- [ ] Manual P2-A AC6: biblioteca vazia mostra a mensagem (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(documents): list and open library documents`

---

### T11: Página Documentos ✅

**What**: Criar o entrypoint `documents` (WXT unlisted page → `/documents.html`): `index.html` (`lang="pt-BR"`, título "ReadMe — Documentos"), `main.tsx` importando `../sidepanel/style.css`, e `App.tsx` com `TooltipProvider`, `Tabs` Arquivo/Biblioteca (Arquivo inicial), Alert de `state.error`, aba Arquivo = `DocumentActions` + `TranslatePanel` + `BlockList` em área rolável ou "Importe um documento para começar.", aba Biblioteca = `LibraryList` (ao abrir, volta para Arquivo), e `Controls` num rodapé `sticky bottom-0` com `bg-background`.
**Where**: `entrypoints/documents/App.tsx` (com `index.html` e `main.tsx` do mesmo entrypoint)
**Depends on**: None (Phase 2 inteira: usa T6–T10)
**Reuses**: `useReader` (T6), `BlockList`, `TranslatePanel`, `Controls`, `components/ui/{tabs,alert,tooltip}.tsx`, layout de `entrypoints/sidepanel/App.tsx`
**Requirement**: DOC-05, DOC-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `pnpm build` gera `.output/chrome-mv3/documents.html`
- [ ] Manual P1-A AC2: abrir `chrome-extension://<id>/documents.html` mostra Arquivo selecionada (UAT pendente)
- [ ] Manual P1-C AC1/AC2: clicar numa frase durante a leitura move a fala para ela (UAT pendente)
- [ ] Manual P1-C AC3: rolar um documento longo mantém o rodapé visível (UAT pendente)
- [ ] Manual P1-D AC1/AC2: traduzir mantém parágrafos; clique funciona na aba Tradução (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(documents): add documents page`

---

### T12: Botão Documentos no painel ✅

**What**: Acrescentar ao `CaptureBar`, entre Escolher elemento e Limpar, um `Button` `variant="outline" size="icon"` com ícone `FileText`, `aria-label` e tooltip "Documentos", que chama `chrome.tabs.create({ url: chrome.runtime.getURL('/documents.html') })`.
**Where**: `components/CaptureBar.tsx`
**Depends on**: T11
**Reuses**: padrão do botão Limpar no mesmo arquivo
**Requirement**: DOC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual P1-A AC1: clicar no botão abre a página Documentos em nova aba (UAT pendente)
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(sidepanel): open documents page from the capture bar`

---

### T13: Correções do Verifier ✅

**What**: Fechar as lacunas do Verifier (`validation.md`): teste que mata o mutante da sobra final do MP3, geração do MP3 sobrevivendo à troca de aba, porcentagem visível, revogação adiada da URL, "Salvar e substituir" com buffer vazio e nome de arquivo do MP3.
**Where**: `lib/audio/mp3.test.ts`, `components/Mp3Button.tsx`, `entrypoints/documents/App.tsx`, `components/useReplaceGuard.tsx`
**Depends on**: T12
**Reuses**: `createMp3Encoder` e `sine` de `lib/audio/mp3.test.ts`; `forceMount` do `TabsContent` do Radix
**Requirement**: DOC-04, DOC-09, DOC-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Teste em `lib/audio/mp3.test.ts`: 5×1152 + 1000 amostras geram MP3 maior que 5×1152 amostras; falha ao remover o ramo da sobra em `finish()`
- [x] Teste em `lib/tts/export.test.ts` mata o mutante N2 (evento de outro motor ignorado no load)
- [ ] Aba Arquivo com `forceMount` + `data-[state=inactive]:hidden`: trocar para Biblioteca durante a geração não cancela o MP3 (UAT pendente)
- [ ] Desmontar o `Mp3Button` durante a geração rejeita `exportAudio` (sem promessa pendente) e encerra o worker (UAT pendente)
- [x] Texto `NN%` visível ao lado da barra de progresso do MP3
- [x] `URL.revokeObjectURL` adiado após o `click()`
- [x] "Salvar e substituir" com buffer vazio só substitui, sem chamar `toLibraryDocument([])`
- [x] Nome do MP3 remove só `.txt`/`.md` finais (sem diferenciar maiúsculas), troca `\/:*?"<>|` por `_` e mantém o fallback `documento`
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: unit
**Gate**: build

**Commit**: `fix(documents): address verifier gaps`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10
Phase 3:  T11 → T12 → T13
```

## Diagram-Definition Cross-Check

| Task | Depends on | Diagram | ✓ |
| ---- | ---------- | ------- | - |
| T1 | None | início da Phase 1 | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | None | início da Phase 2 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | None (fase anterior) | início da Phase 3 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task Tests | ✓ |
| ---- | ----- | --------------- | ---------- | - |
| T1 | `lib/` | unit | unit | ✅ |
| T2 | `lib/` | unit | unit | ✅ |
| T3 | `lib/` | unit | unit | ✅ |
| T4 | `lib/` | unit | unit | ✅ |
| T5 | `lib/` | unit | unit | ✅ |
| T6 | components | none | none | ✅ |
| T7 | components | none | none | ✅ |
| T8 | components | none | none | ✅ |
| T9 | components | none | none | ✅ |
| T10 | components | none | none | ✅ |
| T11 | entrypoint | none | none | ✅ |
| T12 | components | none | none | ✅ |
| T13 | `lib/` + components | unit | unit | ✅ |
