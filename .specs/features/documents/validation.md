# Documents Validation — iteração 2

**Date**: 2026-09-19
**Spec**: `.specs/features/documents/spec.md`
**Iteração anterior**: iteração 1 = FAIL (MAJOR 1 mutante M5; MAJOR 2 troca de aba cancelando o MP3).
Correção: T13 (`tasks.md:391-418`).
**Diff range**: working tree (não commitado) — T1–T13 vivem no working tree. Superfície verificada =
`git status --porcelain`: modificados `.specs/STATE.md`, `components/CaptureBar.tsx`,
`entrypoints/sidepanel/App.tsx`, `lib/storage.ts`, `lib/storage.test.ts`, `package.json`,
`pnpm-lock.yaml`; novos `components/{DocumentActions,LibraryList,Mp3Button}.tsx`,
`components/useReader.ts`, `components/useReplaceGuard.tsx`, `entrypoints/documents/*`,
`lib/audio/mp3{,.test}.ts`, `lib/document{,.test}.ts`, `lib/markdown{,.test}.ts`,
`lib/tts/export{,.test}.ts`. Arquivos tocados pela T13 relidos por inteiro:
`components/Mp3Button.tsx`, `entrypoints/documents/App.tsx`, `components/useReplaceGuard.tsx`,
`lib/audio/mp3.test.ts`.
**Verifier**: sub-agente independente (autor ≠ verificador), regra evidência-ou-zero.

**Veredito: ✅ PASS**
**Result**: PASS

As duas lacunas MAJOR da iteração 1 estão fechadas (M5 agora morre; aba Arquivo com `forceMount`).
Gates verdes (239 testes). Sensor: 4 de 5 mutantes mortos; o sobrevivente (N2) é equivalente no
único chamador — ver Discrimination Sensor. Nenhuma lacuna BLOCKER/MAJOR aberta. O PASS fica
**condicionado** aos itens de UAT manual listados abaixo (AD-011: UI sem testes automatizados).

---

## Estado das lacunas da iteração 1

| # | Severidade | Lacuna | Estado | Evidência (iteração 2) |
| - | ---------- | ------ | ------ | ---------------------- |
| 1 | MAJOR | M5: sobra `< 1152` amostras em `finish()` sem discriminação | ✅ Fechada | Teste novo `lib/audio/mp3.test.ts:45-55` (5×1152 + 1000 amostras > 5×1152). Re-executado: remover `lib/audio/mp3.ts:45` → `encodes the tail shorter than one frame on finish` falha (1 falha) |
| 2 | MAJOR | Trocar para Biblioteca durante o MP3 desmontava `Mp3Button` e deixava `exportAudio` pendente | ✅ Fechada (código) / UAT | `entrypoints/documents/App.tsx:43-47` `TabsContent value="file" forceMount className="… data-[state=inactive]:hidden"` — o `Mp3Button` (`components/DocumentActions.tsx:76`) não desmonta mais na troca. Regra presente no build: `.output/chrome-mv3/assets/style-GXjX6T0g.css` contém `.data-\[state\=inactive\]\:hidden[data-state=inactive]{display:none}` (especificidade 0,2,0 > `.flex` 0,1,0). Desmontagem real (fechar a página) agora liquida a promessa: `components/Mp3Button.tsx:60-63` emite `status: 'error'` "Geração do MP3 cancelada" (`:29-34`) antes de `terminate()`, e `lib/tts/export.ts:59-60` rejeita com ela |
| 3 | MINOR | Progresso sem texto "NN%" | ✅ Fechada | `components/Mp3Button.tsx:180` `<span …>{progress}%</span>` ao lado da `<Progress>` `:179`; `progress` = `Math.round(fraction * 100)` `:137` |
| 4 | MINOR | `revokeObjectURL` logo após `click()` | ✅ Fechada | `components/Mp3Button.tsx:111` `setTimeout(() => URL.revokeObjectURL(url), 10_000)` |
| 5 | MINOR | "Salvar e substituir" com buffer esvaziado → `toLibraryDocument([])` lança | ✅ Fechada | `components/useReplaceGuard.tsx:58-59` `const current = save ? await getBlocks() : []`; só salva se `current.length > 0`, depois substitui `:64` |
| 6 | MINOR | Nome do MP3 cortava "Node.js" | ✅ Fechada | `components/Mp3Button.tsx:107` remove só `/\.(txt|md)$/i` e troca `\/:*?"<>|` por `_`; fallback `documento` `:108` |
| 7 | MINOR | `stripMarkdown`: setext `===`, HTML embutido, `__init__` | ⚪ Aberta — risco aceito | `lib/markdown.ts:25-34` sem regra de setext/HTML; aceito em `design.md:91` ("Markdown aninhado ou HTML embutido pode sobrar em fala. Aceito (council).") |

---

## Gates

| Gate | Comando | Resultado |
| ---- | ------- | --------- |
| Compile | `timeout 900 pnpm compile` (`tsc --noEmit`) | ✅ exit 0 |
| Test | `timeout 900 pnpm test` | ✅ exit 0 — 24 arquivos, 239 testes (+1 vs. iteração 1) |
| Build | `timeout 900 pnpm build` | ✅ exit 0 — `.output/chrome-mv3/documents.html` existe (662 B) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | Testes unitários em `lib/`; lacuna de discriminação da T4 fechada pela T13 |
| T6–T12 | ⚠️ Parcial | `Tests: none` por AD-011; itens `Manual:` desmarcados em `tasks.md` |
| T13 | ⚠️ Parcial | Itens automatizáveis ✅; dois itens de UAT desmarcados (`tasks.md:407-408`) — ver UAT 18 e 19 |

---

## Spec-Anchored Acceptance Criteria

### P1-A: Abrir a página Documentos

| Criterion | `file:line` | Result |
| --------- | ----------- | ------ |
| AC1 Botão Documentos abre nova aba com `documents.html` | `components/CaptureBar.tsx:106` `aria-label="Documentos"`, `:109` `chrome.tabs.create({ url: chrome.runtime.getURL('/documents.html') })`, tooltip `:116`; build gera `documents.html` | ⚠️ Manual (UAT 1) |
| AC2 Abas Arquivo e Biblioteca, Arquivo selecionada | `entrypoints/documents/App.tsx:15` `useState('file')`; `:36-40` `Tabs value={tab}` com triggers Arquivo/Biblioteca | ⚠️ Manual (UAT 2) |

### P1-B: Importar TXT e MD

| Criterion | Implementação | Teste (valor asserido) | Result |
| --------- | ------------- | ---------------------- | ------ |
| AC1 `.txt` → bloco, `sourceTitle`/`sourceUrl` = nome, idioma `navigator.language` | `lib/document.ts:21-42`; `components/DocumentActions.tsx:36` passa `navigator.language` | `lib/document.test.ts:12-21` | ✅ PASS (lib); `navigator.language` = manual |
| AC2 `.md` → sintaxe removida antes de segmentar | `lib/document.ts:25`; `lib/markdown.ts:7-43` | `lib/document.test.ts:23-29`; um caso por construção `lib/markdown.test.ts:5-49`; N3/N4 mortos | ✅ PASS |
| AC3 Extensão não suportada → "Formato não suportado", buffer intacto | `lib/document.ts:22-23`; texto `DocumentActions.tsx:14`; retorno antes de `guard.open` `:37-41` | `lib/document.test.ts:35-38` | ✅ PASS (texto exibido = manual) |
| AC4 Vazio após trim (e sintaxe) → "Arquivo vazio" | `lib/document.ts:26`; texto `DocumentActions.tsx:15` | `lib/document.test.ts:40-45` | ✅ PASS |
| AC5 ≥ 500.000 → mensagem exata | `lib/document.ts:27`; texto `DocumentActions.tsx:16` | `lib/document.test.ts:47-52` | ✅ PASS |
| AC6 Buffer não vazio → diálogo Cancelar/Substituir/Salvar e substituir | `components/useReplaceGuard.tsx:43-52` (lê `getBlocks()` `:46`); diálogo `:67-86`; mesma porta em `DocumentActions.tsx:41` e `LibraryList.tsx:51` | none (AD-011) | ⚠️ Manual (UAT 3) |
| AC7 Cancelar mantém o buffer | `useReplaceGuard.tsx:77` e `:68` só `setPending(null)` | none | ⚠️ Manual (UAT 4) |
| AC8 Salvar e substituir grava e só então substitui | `useReplaceGuard.tsx:58-59` `saveDocument(toLibraryDocument(current))` antes de `replace` `:64`; falha de cota aborta `:60-62`; buffer já vazio pula o save (gap 5) | none | ⚠️ Manual (UAT 5) |

### P1-C: Ler com foco por clique e controles fixos

| Criterion | `file:line` | Result |
| --------- | ----------- | ------ |
| AC1 Mesmo componente de frases, destaque | `entrypoints/documents/App.tsx:56-61` `<BlockList cursor={state.cursor} …>` | ⚠️ Manual (UAT 6) |
| AC2 Clique numa frase → `seek` | `components/BlockList.tsx:188-189` `sendCommand({ type: 'seek', … })` | ⚠️ Manual (UAT 6) |
| AC3 Voz, play/pause, velocidade fixos no rodapé | `App.tsx:72` `footer className="sticky bottom-0 border-t bg-background"`, `Controls` `:74-81`; página rola (`min-h-screen` `:25`) | ⚠️ Manual (UAT 7) |
| AC4 Limpar para a leitura e esvazia | `DocumentActions.tsx:52-53` `sendCommand({type:'stop'})` + `clearBlocks()`; botão `:77` | ⚠️ Manual (UAT 8) |
| AC5 Buffer vazio → "Importe um documento para começar." | `App.tsx:50-55` | ⚠️ Manual (UAT 2) |

Regressão T13 checada: com `forceMount`, a aba Arquivo inativa fica montada e com `display:none`;
o `scrollIntoView` do `BlockList` (`components/BlockList.tsx:75`) é no-op em elemento oculto, e o
diálogo do `DocumentActions` só abre por importação, que exige a aba visível. Sem efeito colateral
encontrado.

### P1-D: Traduzir mantendo a estrutura

| Criterion | `file:line` | Result |
| --------- | ----------- | ------ |
| AC1 Abas Original/Tradução, idioma, Traduzir | `App.tsx:49` `<TranslatePanel>` reusado; `BlockList activeTab={prefs.activeTab}` `:59` | ⚠️ Manual (UAT 9) |
| AC2 Tradução em parágrafos/frases, clique funciona | Reuso de `TranslatePanel` + `BlockList` sem mudança | ⚠️ Manual (UAT 9) |

### P2-A: Biblioteca

| Criterion | Implementação | Teste (valor asserido) | Result |
| --------- | ------------- | ---------------------- | ------ |
| AC1 Salvar grava id/nome/blocos/data em `local:documents` | `lib/storage.ts:18`, `:77-86`; `lib/document.ts:45-48`; `DocumentActions.tsx:46-47,72` | `lib/storage.test.ts:210`; `lib/document.test.ts:56-65` | ✅ PASS |
| AC2 Mesmo id atualiza | `lib/storage.ts:78` | `lib/storage.test.ts:214-221` | ✅ PASS |
| AC3 Lista nome e data, mais recente primeiro | `lib/storage.ts:73`; `LibraryList.tsx:53,55` | `lib/storage.test.ts:224-229` | ✅ PASS (render = UAT 10) |
| AC4 Abrir item → diálogo e aba Arquivo | `LibraryList.tsx:51` `guard.open(doc.blocks, onOpened)`; `useReplaceGuard.tsx:40`; `App.tsx:66` `onOpened={() => setTab('file')}` | none | ⚠️ Manual (UAT 11) |
| AC5 Cota → "Armazenamento cheio", biblioteca anterior | `lib/storage.ts:79-84`; `CaptureBar.tsx:18`; `DocumentActions.tsx:47`; `useReplaceGuard.tsx:61` | `lib/storage.test.ts:241-242` | ✅ PASS |
| AC6 Biblioteca vazia → "Nenhum documento salvo." | `LibraryList.tsx:41` | none | ⚠️ Manual (UAT 10) |

### P2-B: Exportar MP3

| Criterion | Implementação | Teste (valor asserido) | Result |
| --------- | ------------- | ---------------------- | ------ |
| AC1 Aba ativa, voz e velocidade atuais, baixa `<nome sem extensão>.mp3` | `components/Mp3Button.tsx:86-101` (`viewOf` `:88`, `pickLocalVoice` `:89`, `rate: prefs.rate` `:96`); `download` `:103-112` (nome `:107-108`); `lib/tts/export.ts:25-78`; `lib/audio/mp3.ts:19-50` | `lib/tts/export.test.ts:37-61`; `lib/audio/mp3.test.ts:19-55` | ✅ PASS (lib); download real = UAT 12 |
| AC2 Progresso em %, botão desabilitado | `lib/tts/export.ts:69`; `Mp3Button.tsx:137` `Math.round(fraction * 100)`, barra `:179` + texto `NN%` `:180`, `disabled={… busy …}` `:152` | `lib/tts/export.test.ts:37-61` (`[1/3, 2/3, 1]`) | ✅ PASS |
| AC3 Voz do sistema → desabilitado + tooltip | `Mp3Button.tsx:122,152`, tooltip no `span` `:165-173` | none | ⚠️ Manual (UAT 13) |
| AC4 Falha → mensagem, nada baixado | `lib/tts/export.ts:60,72`; `Mp3Button.tsx:140-141` → Alert `:183-188`; `download` só no caminho feliz `:139` | `lib/tts/export.test.ts:63-82` | ✅ PASS |
| AC5 Não interromper a leitura | Worker próprio da página `Mp3Button.tsx:36`, sem passar pelo offscreen | none | ⚠️ Manual (UAT 14) |
| AC6 Encerrar worker ao terminar, falhar ou fechar a página | `finally` `Mp3Button.tsx:142-146` chama `dispose` (`:60-63` → `worker.terminate()` `:62`); unmount `:119`. Troca de aba não desmonta mais (gap 2) | none | ✅ por leitura (+ UAT 18/19) |

Regressão T13 checada no caminho de cancelamento: ao desmontar, `dispose` (`:61`) emite o evento
falso de erro → `exportAudio` chama `fail` → `unsubscribe()` e `reject` (`lib/tts/export.ts:39-42`);
o `finally` (`Mp3Button.tsx:143`) chama `dispose` pela segunda vez: `listeners` já vazio e
`terminate()` é idempotente — inofensivo. No caminho feliz, `exportAudio` desinscreve antes de
resolver (`export.ts:47`), então o evento de cancelamento do `finally` não alcança ninguém. O
`setError` após desmontar é no-op no React 19.

### Edge Cases

| Edge case | Evidência | Result |
| --------- | --------- | ------ |
| 499.999 aceito; 500.000 recusado | `lib/document.test.ts:47-52` | ✅ PASS |
| `.md` só com sintaxe → "Arquivo vazio" | `lib/document.test.ts:40-45`; `lib/markdown.test.ts:60-62` | ✅ PASS |
| `NOTAS.MD` aceito como `.md` | `lib/document.ts:22` `toLowerCase()`; `lib/document.test.ts:31-33`; N1 morto | ✅ PASS |
| Buffer substituído durante leitura → fala para | `entrypoints/background.ts:118`; `lib/engine.test.ts:378,390` | ✅ PASS (reuso) |
| Aba Tradução sem tradução → MP3 usa original | `lib/engine.ts:49-56` `viewOf`; `Mp3Button.tsx:88` | ✅ por leitura |

**Contagem**: 34 critérios (29 ACs + 5 edge cases) — 34 com evidência de implementação, 0 falhos;
19 dependem de UAT manual (AD-011).

---

## Regras do projeto (`CLAUDE.md`)

| Regra | Evidência | Result |
| ----- | --------- | ------ |
| UI só de shadcn/ui | Novos elementos da T13: texto `NN%` é um `span` de texto (`Mp3Button.tsx:180`), sem controle hand-rolled; restante inalterado | ✅ |
| Tailwind tokens, sem `style={{}}`, sem cores fixas | `Mp3Button.tsx:180` `text-xs text-muted-foreground tabular-nums`; `App.tsx:46` `data-[state=inactive]:hidden`; nenhum `style={` nos arquivos da T13 | ✅ |
| Import via `@/` | UI via `@/components/ui/*` | ✅ |
| Texto de UI em pt-BR | "Geração do MP3 cancelada" (`Mp3Button.tsx:33`) em pt-BR | ✅ |

---

## Discrimination Sensor

Procedimento: backup em `scratchpad/verifier2/` → mutação → `timeout 900 pnpm test` → restauração
por cópia → `cmp` byte a byte (todos "restored OK"). SHA-256 dos 10 arquivos `lib/` da feature
(`lib/audio/mp3{,.test}.ts`, `lib/document{,.test}.ts`, `lib/markdown{,.test}.ts`,
`lib/tts/export{,.test}.ts`, `lib/storage{,.test}.ts`) conferidos com `sha256sum -c` no fim: todos OK.
`git status --porcelain` idêntico ao baseline.

| # | Arquivo | Mutação | Resultado |
| - | ------- | ------- | --------- |
| M5 | `lib/audio/mp3.ts:45` | remove o ramo da sobra em `finish()` (re-execução da iteração 1) | ✅ morto — `encodes the tail shorter than one frame on finish` |
| N1 | `lib/document.ts:22` | remove `toLowerCase()` da extensão | ✅ morto — `accepts NOTAS.MD as Markdown` |
| N2 | `lib/tts/export.ts:59` | remove o filtro `event.engine !== engine` | ⚪ sobreviveu — **equivalente** no único chamador |
| N3 | `lib/markdown.ts:16` | linhas dentro da cerca viram `''` (conteúdo descartado) | ✅ morto — `drops code fence lines and keeps their content` |
| N4 | `lib/markdown.ts:19` | remove a regra de linha separadora de tabela | ✅ morto — `turns table rows into readable lines and drops separator rows` |

**4/5 mortos; 1 equivalente.** N2 é equivalente em produção: o único chamador de `exportAudio`
(`components/Mp3Button.tsx:136`) usa um worker novo por exportação que só recebe `load` do motor
pedido, e o host só emite `status` para esse motor (`lib/tts/local/host.ts:36,39-43,48,58-61`).
Não há evento de outro motor para filtrar; por isso não conta como falha de discriminação
(registrado como MINOR 1 abaixo).

---

## Verificações manuais de UAT (pendentes — o PASS depende delas)

1. P1-A AC1 — no painel, clicar no ícone Documentos (tooltip "Documentos") abre `documents.html` em nova aba.
2. P1-A AC2 / P1-C AC5 — a página abre com Arquivo selecionada e mostra "Importe um documento para começar." com buffer vazio.
3. P1-B AC6 — com uma captura no painel, importar um `.txt` → diálogo com Cancelar / Substituir / Salvar e substituir.
4. P1-B AC7 — Cancelar mantém a captura.
5. P1-B AC8 — Salvar e substituir → item novo na Biblioteca e documento no leitor.
6. P1-C AC1/AC2 — dar play, clicar numa frase do meio: destaque e fala seguem dali.
7. P1-C AC3 — rolar um documento longo: rodapé com voz, play/pause e velocidade continua visível.
8. P1-C AC4 — Limpar durante a leitura para a fala e esvazia.
9. P1-D AC1/AC2 — traduzir documento de 3 parágrafos → 3 parágrafos na aba Tradução; clique numa frase traduzida move a leitura.
10. P2-A AC3/AC6 — biblioteca vazia mostra "Nenhum documento salvo."; dois documentos aparecem do mais recente ao mais antigo, com data.
11. P2-A AC4 — clicar num item abre o conteúdo (com tradução, se havia) e volta para Arquivo.
12. P2-B AC1 — com Kokoro, gerar MP3 de 3 parágrafos: baixa `<nome>.mp3` que toca no player do sistema.
13. P2-B AC3 — com voz do sistema, MP3 desabilitado e tooltip "Escolha uma voz neural para gerar MP3".
14. P2-B AC5 — gerar MP3 com leitura tocando: a leitura não para.
15. P2-B AC4 — falha de modelo → Alert com a mensagem, nada baixado.
16. P1-B AC1–AC5 — importar `.txt`, `.md`, `.pdf`, arquivo vazio e arquivo ≥ 500.000 caracteres e conferir as mensagens exatas.
17. T6 — painel lateral captura, lê, destaca e traduz como antes (refactor `useReader`).
18. T13 (gap 2) — iniciar MP3, trocar para Biblioteca e voltar: barra e `NN%` continuam avançando e o arquivo baixa; a aba Arquivo não aparece por baixo da Biblioteca.
19. T13 (gap 2) — iniciar MP3 e fechar a aba: no Gerenciador de tarefas do Chrome não sobra worker da página.
20. T13 (gap 5) — abrir o diálogo pela Biblioteca, limpar o buffer pelo painel, clicar "Salvar e substituir": documento abre, nenhum item vazio na Biblioteca, sem erro no console.

---

## Lacunas (ranqueadas)

### BLOCKER / MAJOR

Nenhuma.

### MINOR

1. **Mutante N2 sobrevive (equivalente).** `lib/tts/export.ts:59` — nenhum teste emite `status`
   de outro motor. Equivalente hoje (ver sensor), mas vira bug real se `exportAudio` passar a usar
   um host compartilhado. Correção barata: em `lib/tts/export.test.ts`, emitir
   `{ type:'status', engine:'supertonic', status:'error' }` antes do `ready` e exigir que não rejeite.
2. **Caminho de cancelamento sem teste.** `components/Mp3Button.tsx:27-83` (`startHost`/`dispose`)
   só é verificável por UAT 18/19 (AD-011). `dispose` roda duas vezes na desmontagem (`:119` e
   `:143`) — inofensivo (`terminate()` idempotente, `listeners` já vazio), só registro.
3. **Markdown residual (aceito).** Lacuna 7 da iteração 1, `design.md:91`.

---

## `validate_state.py documents`

```

validate_state: 0 error(s) across [documents]
```
