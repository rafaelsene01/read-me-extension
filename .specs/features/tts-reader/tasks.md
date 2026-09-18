# TTS Reader — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/tts-reader/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do design e da spec. Projeto greenfield: não há testes existentes para amostrar, nem `AGENTS.md`, `CONTRIBUTING.md` ou config de cobertura no repositório. Guidelines encontradas: nenhuma — defaults fortes aplicados, restritos ao que é testável sem runner de navegador.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Lógica de domínio em `lib/` (segment, cursor, storage, voices, messages, engine, extract, capture, translate, edit) | unit | Todos os ramos; 1:1 com as ACs da spec que o módulo implementa; todo edge case listado tem teste | `lib/*.test.ts` | `pnpm test` |
| Entrypoints de navegador (`entrypoints/background.ts`, `entrypoints/content.ts`) | none | Apenas fiação para `lib/`; verificação manual descrita em cada `Done when` | — | build gate + passo manual |
| Componentes React (`components/*.tsx`, `entrypoints/sidepanel/*`) | none | Sem runner de DOM nesta v1; toda lógica testável vive em `lib/`; verificação manual descrita em cada `Done when` | — | build gate + passo manual |
| Configuração (`wxt.config.ts`, `vitest.config.ts`, `lib/types.ts`, `README.md`) | none | — (build gate apenas) | — | build gate |

## Gate Check Commands

> Gerada do scaffold definido em T1.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tarefas com testes unitários | `pnpm test` |
| Full | Após tarefas que tocam mais de um módulo de `lib/` | `pnpm compile && pnpm test` |
| Build | Após conclusão de fase, entrypoints, componentes e tarefas só de configuração | `pnpm compile && pnpm test && pnpm build` |

---

## Execution Plan

### Phase 1: Fundação

```
T1 -> T2 -> T3 -> T4
```

### Phase 2: Motor de fala

```
T4 -> T8 -> T9
T2 -> T5 -> T9
T3 -> T6 -> T8
T2 -> T7 -> T9
```

### Phase 3: Captura

```
T2 -> T10 -> T11 -> T12
T7 -> T11
T4 -> T12
```

### Phase 4: Painel

```
T9 -> T13 -> T14
T7 -> T13
T6 -> T14
T13 -> T15
T5 -> T15
T13 -> T16
T12 -> T16
```

### Phase 5: Tradução

```
T2 -> T17 -> T18 -> T19
T13 -> T18
T15 -> T19
```

### Phase 6: Edição e entrega

```
T3 -> T20 -> T21 -> T22
T17 -> T20
T14 -> T21
T19 -> T22
```

---

## Task Breakdown

### T1: Inicializar o projeto WXT com React, TypeScript e Vitest ✅

**What**: Rodar o template WXT React nesta pasta e deixar `wxt.config.ts` com `manifest` declarando `permissions: ["storage","tts","sidePanel","scripting","activeTab"]` e `optional_host_permissions: ["<all_urls>"]`, mais os scripts `dev`, `build`, `zip`, `compile` e `test`.
**Where**: `wxt.config.ts`
**Depends on**: None
**Reuses**: template `wxt@0.21` React
**Requirement**: TTS-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `pnpm dev` carrega a extensão no Chrome sem erro no console de extensões
- [x] `vitest` instalado e `pnpm test` roda com zero testes sem falhar
- [x] O manifest gerado em `.output/` contém as permissões e `optional_host_permissions` acima
- [x] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `chore(setup): scaffold WXT + React + TypeScript + Vitest`

---

### T2: Definir o modelo de dados compartilhado

**What**: Declarar `Sentence`, `Paragraph`, `Block`, `Cursor`, `Prefs`, `PlaybackState` e `Voice` exatamente como o design especifica.
**Where**: `lib/types.ts`
**Depends on**: T1
**Reuses**: seção Data Models do design
**Requirement**: TTS-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Todos os tipos do design declarados e exportados
- [ ] `translation.sourceTextHash` presente para detecção de tradução desatualizada
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

**Commit**: `feat(types): add shared block, cursor and prefs models`

---

### T3: Segmentar texto em parágrafos e frases

**What**: Implementar `segmentBlock(text, lang, blockId)` usando `Intl.Segmenter` com granularidade de frase e `chunkSentence(text, max)` partindo frases acima do limite do motor de voz.
**Where**: `lib/segment.ts`
**Depends on**: T2
**Reuses**: `Intl.Segmenter`, `lib/types.ts`
**Requirement**: TTS-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Parágrafos separados por linha em branco ou quebra de linha, descartando linhas vazias
- [ ] Frases geradas por `Intl.Segmenter(lang, { granularity: 'sentence' })`
- [ ] Ids de frase e parágrafo derivados do id do bloco e estáveis para o mesmo texto
- [ ] `chunkSentence` parte em pedaços de no máximo 32.000 caracteres sem cortar no meio de palavra
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T4: Implementar a camada de persistência

**What**: Escrever leitura e escrita de `blocks`, `prefs` e `cursor` em `storage.local`, com `appendBlock` recusando acima de 500.000 caracteres e tratando erro de cota sem perder o buffer anterior.
**Where**: `lib/storage.ts`
**Depends on**: T3
**Reuses**: `wxt/storage`, `lib/types.ts`
**Requirement**: TTS-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `appendBlock` acrescenta ao final e preserva os blocos existentes
- [ ] `appendBlock` retorna `{ok:false, reason:'full'}` acima de 500.000 caracteres
- [ ] Erro de cota retorna `{ok:false, reason:'quota'}` e mantém o buffer anterior
- [ ] `removeBlock` remove só o id pedido; `clearBlocks` esvazia
- [ ] Preferências têm padrões: `rate` 1.0, `targetLang` de `navigator.language`, `activeTab` `original`
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T5: Listar e escolher vozes locais

**What**: Implementar `listLocalVoices()` filtrando `remote: false` e `pickVoice(voices, lang, manual)` com precedência da escolha manual por idioma e casamento de idioma por prefixo.
**Where**: `lib/voices.ts`
**Depends on**: T2
**Reuses**: `chrome.tts.getVoices`
**Requirement**: TTS-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Vozes com `remote: true` nunca aparecem no resultado
- [ ] `pickVoice` devolve a voz manual do idioma quando existir
- [ ] `pt-BR` casa com voz `pt` quando não há voz exata
- [ ] Lista vazia e ausência de voz do idioma retornam `null` sem lançar
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T6: Implementar a aritmética do cursor

**What**: Escrever `firstCursor`, `nextCursor`, `sentenceAt` e `reconcile` como funções puras sobre a lista de blocos.
**Where**: `lib/cursor.ts`
**Depends on**: T3
**Reuses**: `lib/types.ts`
**Requirement**: TTS-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `nextCursor` atravessa fim de parágrafo e fim de bloco e devolve `null` no fim do buffer
- [ ] `reconcile` reposiciona no início do bloco seguinte quando o bloco do cursor sumiu
- [ ] `reconcile` devolve `null` quando o buffer ficou vazio
- [ ] `sentenceAt` devolve `null` para cursor fora de faixa em vez de lançar
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 10 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T7: Definir o contrato de mensagens painel/background

**What**: Declarar o union `Command`, o payload `PlaybackState` e os helpers tipados `sendCommand`, `onCommand` e `broadcastState`.
**Where**: `lib/messages.ts`
**Depends on**: T2
**Reuses**: `chrome.runtime`, `lib/types.ts`
**Requirement**: TTS-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Union cobre `play`, `pause`, `stop`, `seek`, `setRate`, `setVoice`, `capture`, `state`
- [ ] `onCommand` ignora mensagem de formato desconhecido sem lançar
- [ ] `broadcastState` não rejeita quando não há painel aberto para receber
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T8: Implementar o motor de leitura

**What**: Escrever `createEngine({ tts, storage, broadcast })` com `play`, `pause`, `stop`, `seek`, `setRate`, avanço de cursor por frase, persistência do cursor antes de cada fala e tratamento de `error`/`interrupted`.
**Where**: `lib/engine.ts`
**Depends on**: T4, T6
**Reuses**: `lib/cursor.ts`, `lib/storage.ts`
**Requirement**: TTS-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Uma frase por chamada de `tts.speak`, com o cursor persistido antes de cada chamada
- [ ] `pause` mantém o cursor; `play` seguinte retoma da mesma frase
- [ ] `stop` volta o cursor para a primeira frase do buffer
- [ ] Fim do buffer marca `playing:false` e reposiciona o cursor no início
- [ ] Evento `error` para a fila, mantém o cursor na frase que falhou e publica a mensagem no estado
- [ ] `setRate` afeta a próxima frase e persiste a preferência
- [ ] Cursor é reconciliado quando o bloco em leitura é removido
- [ ] Estado reconstruído de `storage` quando o motor é recriado no meio da leitura
- [ ] Gate check passes: `pnpm compile && pnpm test`
- [ ] Test count: 14 tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

---

### T9: Ligar o motor ao service worker

**What**: Registrar `onCommand`, `chrome.tts.onEvent` e `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, instanciando o motor com `chrome.tts` real.
**Where**: `entrypoints/background.ts`
**Depends on**: T5, T7, T8
**Reuses**: `lib/engine.ts`, `lib/messages.ts`, `lib/voices.ts`
**Requirement**: TTS-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Clicar no ícone da extensão abre o side panel
- [ ] Manual: com dois blocos no storage, `play` fala; fechar o painel mantém a fala até o fim
- [ ] Manual: esperar mais de 40 segundos de fala, reabrir o painel e ver o estado correto
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T10: Implementar as regras de extração de texto

**What**: Escrever `extractFromSelection(doc)`, `extractFromElement(el)` e `pageLang(doc)` com normalização de espaços e preservação de quebra de parágrafo.
**Where**: `lib/extract.ts`
**Depends on**: T2
**Reuses**: DOM padrão
**Requirement**: TTS-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Seleção vazia devolve string vazia
- [ ] `extractFromElement` usa `innerText` e preserva quebras entre blocos filhos
- [ ] `pageLang` devolve `documentElement.lang` e cai para `navigator.language` quando ausente ou vazio
- [ ] Texto só com espaços é normalizado para string vazia
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 7 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T11: Implementar o picker no content script

**What**: Overlay que contorna o elemento sob o ponteiro, captura no clique, cancela no `Escape` e devolve texto, URL, título e idioma por mensagem.
**Where**: `entrypoints/content.ts`
**Depends on**: T7, T10
**Reuses**: `lib/extract.ts`, `lib/messages.ts`
**Requirement**: TTS-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual: contorno acompanha o ponteiro em um artigo e o clique captura o elemento correto
- [ ] Manual: `Escape` encerra o modo sem capturar e remove o contorno
- [ ] Modo seleção devolve a seleção ativa sem ativar o overlay
- [ ] Nenhum content script declarado no manifest — injeção só sob demanda
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T12: Orquestrar permissão e injeção de captura

**What**: Escrever `isCapturable(url)`, `needsPermission(url, granted)` e `requestAndCapture(tabId, mode)` chamando `permissions.request` no clique e injetando com `scripting.executeScript`.
**Where**: `lib/capture.ts`
**Depends on**: T4, T11
**Reuses**: `chrome.permissions`, `chrome.scripting`
**Requirement**: TTS-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `isCapturable` falso para `chrome://`, `edge://`, Chrome Web Store e `about:`
- [ ] `needsPermission` falso quando a origem já está concedida
- [ ] Permissão negada devolve `{ok:false, reason:'denied'}` e não altera o buffer
- [ ] Falha de `executeScript` devolve `{ok:false, reason:'inaccessible'}`
- [ ] Texto vazio devolve `{ok:false, reason:'empty'}`
- [ ] Gate check passes: `pnpm compile && pnpm test`
- [ ] Test count: 9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

---

### T13: Montar a casca do side panel

**What**: Componente raiz que assina o estado do background, lê blocos e preferências do storage e distribui para os filhos.
**Where**: `entrypoints/sidepanel/App.tsx`
**Depends on**: T7, T9
**Reuses**: `lib/messages.ts`, `lib/storage.ts`
**Requirement**: TTS-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Painel pede o estado ao abrir e aplica os `broadcastState` seguintes
- [ ] Manual: reabrir o painel durante a leitura reflete o estado real em até 1 segundo
- [ ] Buffer vazio desabilita play, Traduzir, Editar e Limpar
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T14: Renderizar os blocos com destaque e auto-scroll

**What**: Lista de blocos com um `<p>` por parágrafo, `<span>` por frase, destaque na frase do cursor, `scrollIntoView({block:'center'})`, clique para reposicionar e botão de remover bloco.
**Where**: `components/BlockList.tsx`
**Depends on**: T6, T13
**Reuses**: `lib/cursor.ts`
**Requirement**: TTS-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual: a frase em leitura fica destacada e centralizada durante toda a leitura
- [ ] Manual: clicar numa frase reposiciona a leitura nela
- [ ] Cada bloco mostra a URL de origem e um botão de remover
- [ ] Manual: remover o bloco em leitura para a fala e não deixa destaque órfão
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T15: Construir os controles de reprodução

**What**: Play/pause/stop, slider de velocidade, select de voz e os estados "Nenhuma voz local instalada" e "Sem voz instalada para [idioma]".
**Where**: `components/Controls.tsx`
**Depends on**: T5, T13
**Reuses**: `lib/voices.ts`, `lib/messages.ts`
**Requirement**: TTS-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Select lista apenas vozes locais
- [ ] Lista vazia desabilita os controles e mostra "Nenhuma voz local instalada neste sistema"
- [ ] Sem voz do idioma ativo mostra "Sem voz instalada para [idioma]" e mantém play desabilitado
- [ ] Manual: mudar a velocidade afeta a frase seguinte e sobrevive ao fechar e reabrir o painel
- [ ] Erro publicado pelo motor aparece no painel
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T16: Construir a barra de captura

**What**: Botões Capturar seleção, Modo picker e Limpar, com as mensagens de erro de permissão, página não capturável, buffer cheio e nada para capturar.
**Where**: `components/CaptureBar.tsx`
**Depends on**: T12, T13
**Reuses**: `lib/capture.ts`
**Requirement**: TTS-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `permissions.request` é chamado no próprio handler do clique, sem `await` anterior
- [ ] Manual: capturar em site novo com o painel aberto pede permissão e conclui a captura
- [ ] Manual: negar a permissão mostra "Sem acesso a este site" e não altera o buffer
- [ ] Mensagens de "Não é possível capturar desta página", "Buffer cheio — limpe ou remova blocos" e "Nada para capturar" ligadas aos respectivos retornos
- [ ] Limpar esvazia o buffer e para a leitura
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T17: Envolver a Translator API

**What**: Implementar `translationSupport()`, `availability(source,target)`, `translateBlock(block,target,onProgress)` e `isStale(block)` com cache por bloco via `sourceTextHash`.
**Where**: `lib/translate.ts`
**Depends on**: T2
**Reuses**: `Translator` global, `lib/types.ts`
**Requirement**: TTS-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `translationSupport` devolve `unsupported` quando o global `Translator` não existe
- [ ] `create` é chamado sem `await` anterior dentro da função, preservando o gesto do usuário
- [ ] Progresso do `monitor` repassado a `onProgress`
- [ ] Bloco já traduzido para o mesmo destino e com hash igual não chama a API de novo
- [ ] `isStale` verdadeiro quando o texto mudou após a tradução
- [ ] Falha de `create` ou de `translate` propaga erro e mantém o bloco intacto
- [ ] Gate check passes: `pnpm compile && pnpm test`
- [ ] Test count: 11 tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

---

### T18: Construir o painel de tradução

**What**: Abas Original/Tradução com View Transitions, select de idioma de destino com `Intl.DisplayNames`, botão Traduzir, barra de progresso e os estados de indisponibilidade.
**Where**: `components/TranslatePanel.tsx`
**Depends on**: T13, T17
**Reuses**: `lib/translate.ts`
**Requirement**: TTS-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sem Translator API o botão aparece desabilitado com "Tradução não suportada neste navegador"
- [ ] `availability` `unavailable` mostra "Par de idiomas não disponível" e mantém o botão desabilitado
- [ ] Manual: primeira tradução de um par mostra a barra de progresso do download
- [ ] Manual: alternar abas depois de traduzir não dispara nova chamada à API
- [ ] Idioma de destino persistido entre sessões
- [ ] Aba Tradução mostra "Tradução desatualizada" quando `isStale` é verdadeiro
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T19: Amarrar a voz ao idioma da aba ativa

**What**: Ao trocar de aba, selecionar a voz local do idioma correspondente via `pickVoice`, respeitando a escolha manual salva por idioma.
**Where**: `components/Controls.tsx`
**Depends on**: T15, T18
**Reuses**: `lib/voices.ts`
**Requirement**: TTS-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual: capturar artigo em inglês, traduzir para português e ver a voz mudar para portuguesa ao abrir a aba Tradução
- [ ] Escolha manual de voz para um idioma sobrevive à troca de abas
- [ ] Sem voz do idioma da aba, play fica desabilitado com a mensagem do T15
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T20: Implementar a aplicação de edição a um bloco

**What**: Escrever `applyEdit(block, newText)` que re-segmenta, atualiza `text`, marca a tradução como desatualizada e sinaliza remoção quando o texto fica vazio.
**Where**: `lib/edit.ts`
**Depends on**: T3, T17
**Reuses**: `lib/segment.ts`, `lib/translate.ts`
**Requirement**: TTS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Texto novo re-segmentado em parágrafos e frases com o id do bloco preservado
- [ ] Bloco com tradução passa a `isStale` verdadeiro após a edição
- [ ] Texto vazio ou só com espaços devolve `null`, sinalizando remoção do bloco
- [ ] Edição sem mudança real devolve o bloco inalterado
- [ ] Gate check passes: `pnpm test`
- [ ] Test count: 6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T21: Ligar o modo de edição na lista de blocos

**What**: Botão Editar por bloco, habilitado apenas com a leitura parada ou pausada, aplicando `contenteditable="plaintext-only"` não controlado e persistindo no `blur` via `applyEdit`.
**Where**: `components/BlockList.tsx`
**Depends on**: T14, T20
**Reuses**: `lib/edit.ts`
**Requirement**: TTS-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Manual: durante a leitura a área fica somente leitura e Editar desabilitado
- [ ] Manual: editar com a leitura pausada e sair do campo persiste o texto e re-segmenta
- [ ] Manual: apagar todo o conteúdo de um bloco remove o bloco
- [ ] Manual: bloco editado que tinha tradução mostra "Tradução desatualizada"
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

### T22: Empacotar e documentar

**What**: Escrever o README com instalação, permissões pedidas, limitação de vozes remotas e requisito do Chrome 138+ para tradução, e gerar o pacote com `pnpm zip`.
**Where**: `README.md`
**Depends on**: T19, T21
**Reuses**: `wxt zip`
**Requirement**: TTS-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] README cobre instalação em modo desenvolvedor, permissões e limitações conhecidas
- [ ] `pnpm zip` produz o pacote em `.output/`
- [ ] Manual: instalar o pacote em perfil limpo do Chrome e executar os quatro Success Criteria da spec
- [ ] Gate check passes: `pnpm compile && pnpm test && pnpm build`

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6
```

Execução estritamente sequencial: um agente por vez, uma tarefa por vez, na ordem.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 arquivo de configuração | ✅ Granular |
| T2 | 1 arquivo de tipos | ✅ Granular |
| T3 | 2 funções coesas, 1 arquivo | ✅ Granular |
| T4 | 1 módulo de persistência | ✅ Granular |
| T5 | 2 funções coesas, 1 arquivo | ✅ Granular |
| T6 | 4 funções puras coesas, 1 arquivo | ✅ Granular |
| T7 | 1 contrato de mensagens | ✅ Granular |
| T8 | 1 motor, 1 arquivo | ✅ Granular |
| T9 | 1 entrypoint de fiação | ✅ Granular |
| T10 | 3 funções coesas, 1 arquivo | ✅ Granular |
| T11 | 1 content script | ✅ Granular |
| T12 | 3 funções coesas, 1 arquivo | ✅ Granular |
| T13 | 1 componente raiz | ✅ Granular |
| T14 | 1 componente | ✅ Granular |
| T15 | 1 componente | ✅ Granular |
| T16 | 1 componente | ✅ Granular |
| T17 | 1 módulo de tradução | ✅ Granular |
| T18 | 1 componente | ✅ Granular |
| T19 | 1 alteração em 1 componente | ✅ Granular |
| T20 | 1 função pura | ✅ Granular |
| T21 | 1 alteração em 1 componente | ✅ Granular |
| T22 | 1 documento + comando de empacotamento | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 | ✅ Match |
| T3 | T2 | T2 | ✅ Match |
| T4 | T3 | T3 | ✅ Match |
| T5 | T2 | T2 | ✅ Match |
| T6 | T3 | T3 | ✅ Match |
| T7 | T2 | T2 | ✅ Match |
| T8 | T4, T6 | T4, T6 | ✅ Match |
| T9 | T5, T7, T8 | T5, T7, T8 | ✅ Match |
| T10 | T2 | T2 | ✅ Match |
| T11 | T7, T10 | T7, T10 | ✅ Match |
| T12 | T4, T11 | T4, T11 | ✅ Match |
| T13 | T7, T9 | T7, T9 | ✅ Match |
| T14 | T6, T13 | T6, T13 | ✅ Match |
| T15 | T5, T13 | T5, T13 | ✅ Match |
| T16 | T12, T13 | T12, T13 | ✅ Match |
| T17 | T2 | T2 | ✅ Match |
| T18 | T13, T17 | T13, T17 | ✅ Match |
| T19 | T15, T18 | T15, T18 | ✅ Match |
| T20 | T3, T17 | T3, T17 | ✅ Match |
| T21 | T14, T20 | T14, T20 | ✅ Match |
| T22 | T19, T21 | T19, T21 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Configuração | none | none | ✅ OK |
| T2 | Configuração (tipos) | none | none | ✅ OK |
| T3 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T4 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T5 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T6 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T7 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T8 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T9 | Entrypoint de navegador | none | none | ✅ OK |
| T10 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T11 | Entrypoint de navegador | none | none | ✅ OK |
| T12 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T13 | Componente React | none | none | ✅ OK |
| T14 | Componente React | none | none | ✅ OK |
| T15 | Componente React | none | none | ✅ OK |
| T16 | Componente React | none | none | ✅ OK |
| T17 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T18 | Componente React | none | none | ✅ OK |
| T19 | Componente React | none | none | ✅ OK |
| T20 | Lógica de domínio `lib/` | unit | unit | ✅ OK |
| T21 | Componente React | none | none | ✅ OK |
| T22 | Configuração / documentação | none | none | ✅ OK |
