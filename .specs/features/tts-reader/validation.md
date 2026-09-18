# TTS Reader Validation — iteração 2

**Date**: 2026-09-18
**Spec**: `.specs/features/tts-reader/spec.md`
**Diff range**: `d4f71d0..working tree (não commitado)` — só T1 está commitado; T2–T23 e todos os
fixes da iteração 1 vivem no working tree. Superfície verificada = `git status --porcelain` +
`git diff HEAD` + arquivos não rastreados (`lib/`, `components/`, `entrypoints/content.ts`,
`entrypoints/sidepanel/App.tsx`, `README.md`, `.specs/.../COMMITS.md`).
**Verifier**: sub-agente independente e fresco (autor ≠ verificador), regra evidência-ou-zero.
Cobertura re-derivada da spec; nada herdado do relatório da iteração 1.

**Veredito: ✅ PASS** — 0 ACs sem evidência, 8/8 mutantes mortos, gates verdes (135 testes),
5/5 lacunas da iteração 1 fechadas. **Condicionado às 18 verificações manuais de UAT** listadas
abaixo, que a decisão AD-011 (`entrypoints/**` e `components/*.tsx` = `Tests: none`) e a linha
de Assumptions da P1-B AC10 colocam fora do alcance de qualquer teste unitário.

---

## Estado das 5 lacunas da iteração 1

| # | Lacuna da iteração 1 | Estado | Evidência desta iteração |
| - | -------------------- | ------ | ------------------------ |
| 1 | **BLOCKER** — P2-A AC6: select de sobrescrita do idioma de origem não existia | ✅ **Fechada** (render do select = manual) | `lib/edit.ts:23` `applyLang(block, lang)`; `components/BlockList.tsx:90-101` `<select aria-label="Idioma de origem" value={block.lang} onChange={… persistLang(block, event.target.value)}>`; testes `lib/edit.test.ts:84,92,99,108` |
| 2 | **MAJOR** — edge case iframe cross-origin / shadow DOM fechado não tratado | ✅ **Fechada** com ressalva residual | `lib/extract.ts:37-46` `isInaccessible`; testes `lib/extract.test.ts:89,95,101-102,108`; fiação `entrypoints/content.ts:59-61`; tradução `lib/capture.ts:82` + teste `lib/capture.test.ts:145-146`. Ressalva em "Limitações residuais" |
| 3 | **MAJOR** — mutante M6 sobreviveu: fronteira de 500.000 não discriminada | ✅ **Fechada** | Decisão registrada em `spec.md:49` (limite **inclusivo**); `lib/storage.ts:48` `>= MAX_BUFFER_CHARS`; testes de fronteira `lib/storage.test.ts:51` (499.999 → `ok:true`), `:60` (500.000 → `full`), `:43` (500.001 → `full`); mutação M1 desta iteração (`>=` → `>`) **morta** |
| 4 | **MINOR** — erro de cota tratado só no caminho de captura | ✅ **Fechada** | Guarda movida para o ponto compartilhado `lib/storage.ts:35-43` `setBlocks`; `appendBlock` (`:50`), `removeBlock` (`:55`) e `clearBlocks` (`:59`) passam por ele; teste dedicado `lib/storage.test.ts:102-113`; consumo nos chamadores `components/BlockList.tsx:31-32` e `components/TranslatePanel.tsx:64-65` com `MESSAGES.quota`; mutação M2 **morta** |
| 5 | **MINOR** — P1-B AC10 "em até 1 segundo" sem critério verificável | ✅ **Fechada como decisão de spec** | `spec.md:50` registra que o limite é verificado manualmente no UAT, não por teste, porque vive em `entrypoints/sidepanel/App.tsx` (`Tests: none` por AD-011). Deixa de ser lacuna de precisão e vira item de UAT (#3 e #6 da lista de manuais) |

Advisory 6 da iteração 1 (**D3**, `<all_urls>` em vez do host) permanece **decisão pendente do
usuário** — registrada, não tratada como falha. Advisory 7 (select de voz sem opção vazia)
permanece aberta como cosmética.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T8, T10, T12, T17, T20, T23 | ✅ Done | Cobertas por testes unitários em `lib/` |
| T9, T11, T13, T14, T15, T16, T18, T19, T21, T22 | ⚠️ Parcial | `Tests: none` por AD-011; itens `Manual:` ainda desmarcados em `tasks.md` |

Nenhuma tarefa bloqueada. A entrega do select de idioma de origem (fix da lacuna 1) caiu em
`components/BlockList.tsx` + `lib/edit.ts`, sem tarefa nova em `tasks.md`.

---

## Spec-Anchored Acceptance Criteria

### P1-A: Capturar texto da página

| Criterion | Resultado esperado pela spec | `file:line` + asserção | Result |
| --------- | ---------------------------- | ---------------------- | ------ |
| AC1 Capturar com seleção ativa → bloco com texto, URL e idioma | bloco acrescentado com os 3 campos | `lib/capture.test.ts:101-103` — `expect(blocks.map((b) => [b.sourceUrl, b.sourceTitle, b.lang])).toEqual([[PAGE, 'Artigo', 'pt-BR']])`; `:104-106` asserta as frases segmentadas | ✅ PASS |
| AC2 Picker desenha contorno e captura `innerText` no clique | contorno segue o ponteiro; clique → bloco com `innerText` | impl `entrypoints/content.ts:44-53` (`outline.style.top/left/width/height` de `getBoundingClientRect`) e `:63` `finish(payload(target ? extractFromElement(target) : ''))`; `innerText` testado em `lib/extract.test.ts:60` | ⚠️ **Verificação manual pendente** (entrypoint = `Tests: none`) |
| AC3 `Escape` encerra o picker sem capturar | modo encerrado, buffer intacto | impl `entrypoints/content.ts:66-70` `if (event.key !== 'Escape') return; … finish(null)`; efeito a jusante testado: `lib/capture.test.ts:164-165` — `expect(result).toEqual({ ok: false, reason: 'cancelled' })` e `expect(await getBlocks()).toEqual([])` | ⚠️ **Manual** para a tecla; ✅ para o efeito no buffer |
| AC4 Nova captura preserva os existentes e vai ao final | ordem `[antigos…, novo]` | `lib/capture.test.ts:116` — `expect(blocks.map((b) => b.text)).toEqual(['antigo', PAYLOAD.text])`; `lib/storage.test.ts:40` — `toEqual(['a','b','c'])` | ✅ PASS |
| AC5 Remover exclui só aquele bloco | demais mantidos | `lib/storage.test.ts:122` — `expect((await getBlocks()).map((b) => b.id)).toEqual(['a', 'c'])` | ✅ PASS |
| AC6 Limpar esvazia o buffer e para a leitura | buffer `[]` + fala interrompida | `lib/storage.test.ts:130` — `expect(await getBlocks()).toEqual([])`; a parada é impl `components/CaptureBar.tsx:82-83` `await sendCommand({ type: 'stop' }); await clearBlocks();` | ✅ para o buffer; ⚠️ **Manual** para a parada da fala |
| AC7 `permissions.request({origins:[host]})` no mesmo clique | request antes de qualquer injeção, sem await anterior | `lib/capture.test.ts:86-89` — `const running = requestAndCapture(7, PAGE, 'selection'); expect(request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });` **sem await entre as linhas**, e `expect(executeScript).not.toHaveBeenCalled()` | ✅ PASS (ver desvio D3) |
| AC8 Permissão negada → "Sem acesso a este site", buffer intacto | `{ok:false,reason:'denied'}` + buffer preservado + texto exato | `lib/capture.test.ts:125-127` — `expect(result).toEqual({ ok: false, reason: 'denied' })`, `expect(executeScript).not.toHaveBeenCalled()`, `expect((await getBlocks()).map((b) => b.id)).toEqual(['a'])`; texto em `components/CaptureBar.tsx:8` | ✅ para o retorno; ⚠️ **Manual** para a exibição |
| AC9 Texto vazio após trim → descartar + "Nada para capturar" | `{ok:false,reason:'empty'}` + buffer intacto | `lib/capture.test.ts:155-156` — `expect(result).toEqual({ ok: false, reason: 'empty' })` e `toEqual(['a'])`; normalização `lib/extract.test.ts:48` — `expect(extractFromSelection(docWithSelection('   \n\t  \n '))).toBe('')`; texto `components/CaptureBar.tsx:12` | ✅ PASS |
| AC10 Buffer atingiu 500.000 → recusar + "Buffer cheio — limpe ou remova blocos" | limite **inclusivo** (`spec.md:49`): a captura que deixa o total em exatamente 500.000 já é recusada | `lib/storage.test.ts:65-66` — `expect(result).toEqual({ ok: false, reason: 'full' })` e `expect((await getBlocks()).map((b) => b.id)).toEqual(['a'])` com total resultante **exatamente 500.000**; `:56-57` aceita 499.999; `:48` recusa 500.001; ponta a ponta `lib/capture.test.ts:174`; impl `lib/storage.ts:48` `total + block.text.length >= MAX_BUFFER_CHARS`; texto `components/CaptureBar.tsx:13` | ✅ PASS (era lacuna de precisão; resolvida na spec) |
| AC11 Id único e estável enquanto o bloco existir | id não muda por edição, troca de idioma ou reordenação | impl `lib/capture.ts:85` `const id = crypto.randomUUID();`; estabilidade sob edição `lib/edit.test.ts:38` — `expect(edited?.id).toBe('b1')`; sob troca de idioma `lib/edit.test.ts:90` — `expect(relanged.id).toBe('b1')`; ids derivados `lib/segment.test.ts:36,49` | ✅ PASS (a unicidade em si é garantia de plataforma de `crypto.randomUUID`) |

### P1-B: Ouvir o texto com destaque

| Criterion | Resultado esperado pela spec | `file:line` + asserção | Result |
| --------- | ---------------------------- | ---------------------- | ------ |
| AC1 Parágrafos por quebra de linha, frases por `Intl.Segmenter` no idioma do bloco | 1 parágrafo por linha não vazia; frases segmentadas | `lib/segment.test.ts:8-12` — `expect(paragraphs).toHaveLength(2)` + textos `[['Primeira linha.'],['Segunda linha.']]`; `:26` — `toEqual(['Bom dia.','Como vai?','Tudo bem!'])`; `:56` descarta entrada só com espaços | ✅ PASS |
| AC2 Play enfileira do cursor atual, uma frase por `chrome.tts.speak` | exatamente 1 `speak` com a frase do cursor | `lib/engine.test.ts:93-94` — `expect(h.speakCalls).toHaveLength(1)` e `expect(h.speakCalls[0]!.text).toBe('a0.')` | ✅ PASS |
| AC3 Fim de frase → avança o cursor e **persiste antes** de falar a seguinte | cursor gravado antes de cada `speak` | `lib/engine.test.ts:136-140` — `expect(h.speakCalls.map((c) => c.cursorAtSpeak)).toEqual([cursorOf('a',0,0), cursorOf('a',0,1), cursorOf('a',1,0)])`; avanço isolado `:127-128` | ✅ PASS |
| AC4 Destaque da frase + `scrollIntoView({block:'center'})` | span destacado e centralizado | impl `components/BlockList.tsx:60` `activeRef.current?.scrollIntoView({ block: 'center' })` e `:166` `background: active ? '#fef08a' : 'transparent'` | ⚠️ **Verificação manual pendente** (componente = `Tests: none`) |
| AC5 Pause interrompe a fala e mantém o cursor | `tts.stop()` + cursor inalterado + `playing:false` | `lib/engine.test.ts:164-166` — `expect(h.stop).toHaveBeenCalled()`, `expect(h.store.cursor).toEqual(cursorOf('a',0,1))`, `expect((await h.engine.getState()).playing).toBe(false)` | ✅ PASS |
| AC6 Play após pause retoma da frase do cursor | fala a mesma frase | `lib/engine.test.ts:176` — `expect(h.speakCalls.at(-1)!.text).toBe('a1.')` | ✅ PASS |
| AC7 Stop interrompe e move o cursor para a 1ª frase do buffer | cursor = `firstCursor` | `lib/engine.test.ts:185-186` — `expect(h.store.cursor).toEqual(cursorOf('a', 0, 0))` + `playing:false` | ✅ PASS |
| AC8 Clique numa frase move o cursor e, se lendo, continua dali | cursor na frase clicada + fala dela | `lib/engine.test.ts:262-263` — `expect(h.store.cursor).toEqual(cursorOf('b',0,0))` e `expect(h.speakCalls.at(-1)!.text).toBe('b0.')`; caso pausado `:269-270` (`speakCalls` vazio); clique em si impl `components/BlockList.tsx:159-164` | ✅ para o motor; ⚠️ **Manual** para o clique na UI |
| AC9 Painel fechado durante a leitura → continua falando até o fim | fala não interrompida | impl `entrypoints/background.ts` (motor no service worker) + `lib/messages.test.ts:83` — `await expect(broadcastState(state)).resolves.toBeUndefined()` (sem painel para receber) | ⚠️ **Verificação manual pendente** |
| AC10 Painel reaberto reflete **em até 1 segundo** o estado real | estado real em ≤ 1 s — `spec.md:50`: verificado no UAT, não por teste | impl `entrypoints/sidepanel/App.tsx:25-27` `void sendCommand({ type: 'state' }).then(…)` + `:32` assinatura dos broadcasts | ⚠️ **Verificação manual pendente** (decisão de spec registrada; não é mais lacuna de precisão) |
| AC11 Nova velocidade a partir da próxima frase + persistida | frase atual mantém a rate antiga | `lib/engine.test.ts:238` — `expect(h.speakCalls.map((c) => c.options.rate)).toEqual([1.0, 2.0])`; persistência `:229` — `expect(h.store.prefs.rate).toBe(1.75)` | ✅ PASS |
| AC12 Só vozes `remote: false` na lista | remotas nunca aparecem | `lib/voices.test.ts:25` — `expect(voices.map((v) => v.voiceName)).toEqual(['Local PT', 'Local EN'])` | ✅ PASS |
| AC13 Fim do buffer → parar, inativo, cursor na 1ª frase | `{playing:false, cursor:first, error:null}` | `lib/engine.test.ts:149-153` — `expect(await h.engine.getState()).toEqual({ playing: false, cursor: cursorOf('a',0,0), error: null })` (estado inteiro) | ✅ PASS |
| AC14 `error`/`interrupted` não solicitado → parar, manter o cursor da frase que falhou, exibir a mensagem | estado com cursor preservado + mensagem do evento | `lib/engine.test.ts:197-202` — `toEqual({ playing: false, cursor: cursorOf('a',0,1), error: 'engine busy' })` + `expect(h.states.at(-1)!.error).toBe('engine busy')`; `:211-212` para `interrupted` externo; `:221` confirma que o `interrupted` do próprio pause **não** vira erro | ✅ PASS |
| AC15 Nenhuma voz local → desabilitar controles + "Nenhuma voz local instalada neste sistema" | play/parar desabilitados + texto exato | impl `components/Controls.tsx:42` `const blocked = empty \|\| voice === null;` e `:92-96` o texto exato; base testada `lib/voices.test.ts:31` — `expect(await listLocalVoices()).toEqual([])` | ⚠️ **Verificação manual pendente** |
| AC16 Sem voz do idioma ativo → "Sem voz instalada para [idioma]" + play desabilitado até escolher outra | texto com o nome do idioma + play travado | impl `components/Controls.tsx:97-101`; `pickVoice` devolve `null` nesse caso `lib/voices.test.ts:64` — `expect(pickVoice(voices, 'ja-JP', {})).toBeNull()`; escolha manual destrava `:43-48` | ⚠️ **Verificação manual pendente** |
| AC17 Bloco removido durante a leitura contendo o cursor → parar e ir ao início do bloco seguinte | `tts.stop()` + cursor no bloco seguinte + `playing:false` | `lib/engine.test.ts:283-286` — `expect(h.stop).toHaveBeenCalled()`, `expect(h.store.cursor).toEqual(cursorOf('a',0,0))`, `playing:false`, `expect(h.speakCalls).toHaveLength(spoken)`; aritmética `lib/cursor.test.ts:92-96` — `expect(reconcile(remaining, {blockId:'b',…}, previous)).toEqual({blockId:'c',paraIndex:0,sentIndex:0})` | ✅ PASS |

### P2-A: Traduzir mantendo o original

| Criterion | Resultado esperado pela spec | `file:line` + asserção | Result |
| --------- | ---------------------------- | ---------------------- | ------ |
| AC1 Translator API presente → botão Traduzir habilitado | botão ativo | `lib/translate.test.ts:50` — `expect(translationSupport()).toBe('ok')`; impl `components/TranslatePanel.tsx:29,38` `blocked = !supported \|\| …` | ✅ para a lógica; ⚠️ **Manual** para o botão |
| AC2 `Translator.create` na mesma tarefa do clique, sem `await` anterior | `create` chamado sincronamente | `lib/translate.test.ts:74-75` — `void translateBlock(…); expect(api.create).toHaveBeenCalledTimes(1)` **sem await entre as linhas**; `lib/translate.ts:76` não é `async`; no componente `components/TranslatePanel.tsx:46` mapeia todos os blocos na mesma tarefa | ✅ PASS |
| AC3 Progresso do `monitor` `downloadprogress` exibido | valor `loaded` repassado | `lib/translate.test.ts:96` — `expect(progress).toEqual([0.5])`; exibição impl `components/TranslatePanel.tsx:110` `<progress value={progress} max={1} />` | ✅ para o repasse; ⚠️ **Manual** para a barra |
| AC4 Tradução guardada junto do bloco e não retraduzida até edição | cache por `target` + `sourceTextHash` | `lib/translate.test.ts:115-116` — `expect(translated).toBe('Olá guardado.')` **e** `expect(api.create).not.toHaveBeenCalled()`; retradução por mudança de texto `:154-155` e de destino `:135-136`; persistência impl `components/TranslatePanel.tsx:50-64` | ✅ PASS |
| AC5 Alternar abas mostra o texto guardado, sem nova chamada à API | nenhuma chamada na troca de aba | impl `components/TranslatePanel.tsx:81` — o handler da aba só faz `setPrefs({ activeTab: tab })`; leitura vem de `components/BlockList.tsx:20-23` `block.translation?.paragraphs` | ⚠️ **Verificação manual pendente** (nenhum teste prova a ausência de chamada na troca de aba) |
| AC6 Idioma de origem = `documentElement.lang`, fallback `navigator.language`, **sobrescrevível em um select** | 3 cláusulas | (a) declarado: `lib/extract.test.ts:76` — `expect(pageLang(docWithLang('pt-BR'))).toBe('pt-BR')`, gravado no bloco `lib/capture.test.ts:101-103`; (b) fallback: `lib/extract.test.ts:80-81` — `expect(pageLang(docWithLang(''))).toBe(navigator.language)`; (c) sobrescrita: `lib/edit.test.ts:84` — `expect(applyLang(block('Um. Dois.'), 'en').lang).toBe('en')`, re-segmentação `:92` — `expect(relanged.paragraphs[0]?.sentences.map((s) => s.text)).toEqual(['Um.', 'Dois.'])`, persistência `:108` — `expect((await getBlocks()).map((b) => b.lang)).toEqual(['en'])`; select impl `components/BlockList.tsx:90-101`; consumo `lib/translate.ts:91` `sourceLanguage: block.lang` | ✅ PASS para a lógica das 3 cláusulas; ⚠️ **Manual** para o render do select (**era o GAP nº 1 da iteração 1**) |
| AC7 Idioma de destino persistido e reutilizado | `prefs.targetLang` gravado e relido | impl `components/TranslatePanel.tsx:96-97` `onChange={… setPrefs({ targetLang: event.target.value })}`; persistência parcial `lib/storage.test.ts:144-151` — `setPrefs({rate:1.75})` → `expect(prefs.rate).toBe(1.75)` e `expect(prefs.activeTab).toBe('original')`; default `:139` `expect(prefs.targetLang).toBe(navigator.language)` | ✅ para a persistência; ⚠️ **Manual** para o select |
| AC8 Troca de aba → voz local do idioma da aba, salvo escolha manual | voz do idioma da aba ativa | impl `components/Controls.tsx:40-41`; precedência manual testada `lib/voices.test.ts:43-48` — `pickVoice(voices,'pt-BR',{'pt-BR':'Joana'})` `toEqual({voiceName:'Joana',…})`; casamento por prefixo `:60` | ⚠️ **Verificação manual pendente** |
| AC9 Sem Translator API → botão desabilitado + "Tradução não suportada neste navegador" | texto exato + botão travado | `lib/translate.test.ts:45` — `expect(translationSupport()).toBe('unsupported')`; `:188-190` — `rejects.toThrow('Tradução não suportada neste navegador')`; impl `components/TranslatePanel.tsx:112-116` | ✅ para a lógica; ⚠️ **Manual** para o botão |
| AC10 `availability` `unavailable` → "Par de idiomas não disponível" + botão desabilitado | texto exato + botão travado | `lib/translate.test.ts:57` — `expect(await availability('en','pt')).toBe('unavailable')`; impl `components/TranslatePanel.tsx:37-38` `unavailablePair` entra em `blocked`, texto `:117-121` | ✅ para a lógica; ⚠️ **Manual** para o botão + ⚠️ ressalva (ver Limitações residuais) |
| AC11 Falha de criação/tradução → texto original intacto + mensagem no painel | bloco inalterado + erro exibido | `lib/translate.test.ts:166-168` — `rejects.toThrow('download recusado')` **e** `expect(target.text).toBe('Hello there.')` **e** `expect(target.translation).toBeUndefined()`; idem `:181-183` para falha de `translate`; exibição impl `components/TranslatePanel.tsx:67-69,122-126` | ✅ PASS |

### P2-B: Ajustar o texto capturado

| Criterion | Resultado esperado pela spec | `file:line` + asserção | Result |
| --------- | ---------------------------- | ---------------------- | ------ |
| AC1 Leitura ativa → texto somente leitura e Editar desabilitado | botão `disabled`, área não editável | impl `components/BlockList.tsx:105` `disabled={playing \|\| editingId === block.id}`; a área só vira `contentEditable` quando `editingId === block.id` (`:122-126`), estado que só o botão define. O select de idioma também trava (`:93`) | ⚠️ **Verificação manual pendente** |
| AC2 Editar com leitura parada/pausada → `contenteditable="plaintext-only"` | atributo exato | impl `components/BlockList.tsx:126` `contentEditable="plaintext-only"` | ⚠️ **Verificação manual pendente** |
| AC3 Fim da edição → re-segmentar e persistir | parágrafos/frases recalculados, id preservado, texto gravado | `lib/edit.test.ts:38-44` — `expect(edited?.id).toBe('b1')` + `expect(edited?.paragraphs[0]?.sentences.map((s) => s.text)).toEqual(['Novo um.','Novo dois.'])` + `expect(edited?.paragraphs[0]?.id).toBe('b1:p0')`; `:50-53` um parágrafo por linha; `:57` — `expect(applyEdit(block('Um.'),'Dois.')?.text).toBe('Dois.')`; persistência impl `components/BlockList.tsx:31-42` | ✅ PASS |
| AC4 Bloco editado com tradução → tradução desatualizada + "Tradução desatualizada" na aba Tradução | `isStale` verdadeiro + texto exato | `lib/edit.test.ts:63-64` — `expect(edited?.translation?.text).toBe('Translated.')` **e** `expect(isStale(edited as Block)).toBe(true)`; `lib/translate.test.ts:217` idem; texto impl `components/BlockList.tsx:116-120` | ✅ PASS |
| AC5 Edição esvazia o bloco → remover o bloco | `applyEdit` → `null`, bloco removido | `lib/edit.test.ts:68` — `expect(applyEdit(block('Um.'), '')).toBeNull()`; `:72` só espaços; remoção impl `components/BlockList.tsx:38-41` `if (!edited) { await removeBlock(block.id); return; }` | ✅ PASS |

**Status**: ✅ **44 ACs, 0 sem evidência.** 33 com asserção de teste que bate com o resultado
definido pela spec (24 integralmente, 9 apenas na parte testável, com a exibição na UI pendente
de verificação manual) · 11 cobertas só pela linha de implementação em `entrypoints/**` ou
`components/*.tsx` (verificação manual pendente por AD-011) · **0 lacunas de precisão de spec**
(as 2 da iteração 1 foram resolvidas em `spec.md:49-50`).

---

## Edge Cases

| Edge case | Evidência | Result |
| --------- | --------- | ------ |
| Página interna (`chrome://`, Web Store) → "Não é possível capturar desta página", sem injetar | `lib/capture.test.ts:54-56` — `expect(isCapturable('chrome://settings')).toBe(false)` (+ `edge://`, `about:`); `:60-61` para as lojas; `:183-185` — `expect(result).toEqual({ ok: false, reason: 'unsupported' })` **e** `expect(request).not.toHaveBeenCalled()` **e** `expect(executeScript).not.toHaveBeenCalled()`; texto `components/CaptureBar.tsx:7` | ✅ Coberto |
| Elemento em iframe cross-origin ou shadow DOM fechado → "Conteúdo inacessível nesta região da página" | Detecção `lib/extract.ts:37-46`; testes `lib/extract.test.ts:89` — `expect(isInaccessible(iframe(null))).toBe(true)`, `:95` — `expect(isInaccessible(host(null))).toBe(true)` com `chrome.dom.openOrClosedShadowRoot` devolvendo um root fechado, negativos `:101-102` e `:108`; fiação `entrypoints/content.ts:59-61` `finish({ ...payload(''), inaccessible: true })`; tradução `lib/capture.ts:82` `if (payload.inaccessible) return { ok: false, reason: 'inaccessible' }` com teste `lib/capture.test.ts:145-146` — `expect(result).toEqual({ ok: false, reason: 'inaccessible' })` **e** buffer intacto; texto `components/CaptureBar.tsx:9` | ✅ Coberto na lógica (**era o GAP nº 2**); ⚠️ ressalva de alcance em "Limitações residuais" |
| Frase acima de 32.000 caracteres → partir em pedaços ≤ 32.000 antes do `chrome.tts` | `lib/segment.test.ts:70-72` — `expect(chunks.length).toBeGreaterThan(1)`, `for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(32_000)`, `expect(chunks.join(' ')).toBe(sentence)`; no motor `lib/engine.test.ts:396-398` — `expect(t.speakCalls).toHaveLength(3)` + `every((call) => call.text.length <= 32_000)` `toBe(true)` + junção idêntica; cursor avança uma vez só `:405-414` | ✅ Coberto |
| `storage.local` com erro de cota → manter o buffer anterior + "Armazenamento cheio" | Guarda única em `lib/storage.ts:35-43`; `lib/storage.test.ts:111-112` — `expect(result).toEqual({ ok: false, reason: 'quota' })` **e** `expect((await getBlocks()).map((b) => b.id)).toEqual(['a'])` (caminho `setBlocks`); `:85` e `:97` para `appendBlock`; consumo nos chamadores `components/BlockList.tsx:31-32` e `components/TranslatePanel.tsx:64-65` (`MESSAGES.quota`); texto `components/CaptureBar.tsx:14` | ✅ Coberto (**era o GAP nº 4**) |
| Service worker encerrado e reativado por evento de `chrome.tts` → reconstruir de `storage.local` e continuar do cursor | `lib/engine.test.ts:311-312` — um motor novo sobre o mesmo storage recebe `onTtsEvent({type:'end'})` e `expect(revived.speakCalls.map((c) => c.text)).toEqual(['a2.'])` + `expect((await revived.engine.getState()).playing).toBe(true)` | ✅ Coberto |
| Buffer vazio → desabilitar play, Traduzir, Editar e Limpar | play `components/Controls.tsx:42`; Traduzir `components/TranslatePanel.tsx:38` (`blocks.length === 0` em `blocked`); Limpar `components/CaptureBar.tsx:95` `disabled={empty}`; Editar — `BlockList` nem é montado com buffer vazio (`entrypoints/sidepanel/App.tsx:84-86`) | ⚠️ **Verificação manual pendente** |

---

## Discrimination Sensor

**Isolamento**: `git worktree` e `git stash` proibidos (quase nada commitado). Método: cópia dos
6 arquivos-alvo em
`/tmp/claude-1000/-home-sene-Documentos-extension/c5f3178b-be97-499f-bbb4-f1f1dc5714e5/scratchpad/backup/`,
mutação no original via `perl -i -pe` ancorado na linha, execução do arquivo de teste
correspondente, **restauração imediata da cópia**, e conferência por `diff -q` +
`md5sum -c baseline.md5` + `git status --porcelain | diff - baseline.porcelain` após **cada**
mutação. Baseline pré-sensor: 6 modificados + 6 não rastreados, md5 de todo `lib/`,
`components/` e `entrypoints/`, 135 testes verdes. Baseline pós-sensor: **idêntico**
(`md5sum -c` sem divergência, `PORCELAIN_IDENTICAL`, `pnpm test` 135/135).

| # | File:line | Mutação | Teste | Killed? |
| - | --------- | ------- | ----- | ------- |
| M1 | `lib/storage.ts:48` | Fronteira do buffer: `total + block.text.length >= MAX_BUFFER_CHARS` → `>` (reverte o fix F3) | `lib/storage.test.ts` | ✅ **Killed** (1 falhou / 13) |
| M2 | `lib/storage.ts:40` | Guarda de cota compartilhada: `return { ok: false, reason: 'quota' }` → `return { ok: true }` (reverte o fix F4) | `lib/storage.test.ts` | ✅ **Killed** (2 falharam / 13) |
| M3 | `lib/extract.ts:46` | `isInaccessible`, ramo shadow DOM fechado: `chrome.dom?.openOrClosedShadowRoot(el) != null` → `== null` | `lib/extract.test.ts` | ✅ **Killed** (2 falharam / 13 — pega os dois sentidos) |
| M4 | `lib/extract.ts:40` | `isInaccessible`, ramo iframe: `contentDocument === null` → `!== null` | `lib/extract.test.ts` | ✅ **Killed** (2 falharam / 13) |
| M5 | `lib/edit.ts:26` | `applyLang` deixa de re-segmentar: remove `paragraphs: segmentBlock(block.text, lang, block.id)` do retorno | `lib/edit.test.ts` | ✅ **Killed** (1 falhou / 11) |
| M6 | `lib/capture.ts:82` | Remove a tradução do marcador: apaga `if (payload.inaccessible) return { ok: false, reason: 'inaccessible' }` | `lib/capture.test.ts` | ✅ **Killed** (1 falhou / 15) |
| M7 | `lib/engine.ts:229` | Motor deixa de avançar: `cursor ? nextCursor(blocks, cursor) : firstCursor(blocks)` → `cursor ? cursor : firstCursor(blocks)` | `lib/engine.test.ts` | ✅ **Killed** (9 falharam / 33) |
| M8 | `lib/cursor.ts:69` | `reconcile` ignora o bloco seguinte: `return firstCursorFrom(blocks, at)` → `return firstCursor(blocks)` | `lib/cursor.test.ts` | ✅ **Killed** (1 falhou / 12) |

**Sensor depth**: reforçado — 8 mutações, com pelo menos uma em **cada** ponto corrigido
(`lib/storage.ts` fronteira **e** guarda de cota, `lib/extract.ts` nos dois ramos de
`isInaccessible`, `lib/edit.ts` `applyLang`, `lib/capture.ts` `reason:'inaccessible'`), mais
`lib/engine.ts` e `lib/cursor.ts`.
**Resultado**: **8/8 mortos — ✅ PASS**. O mutante sobrevivente da iteração 1 (M6 daquele
relatório, `>` → `>=` em `lib/storage.ts`) foi reproduzido aqui como **M1 em sentido inverso** e
morreu.

---

## Regra payload/conjunção

Asserções sobre objetos emitidos/persistidos são sobre **valor/estado**, não sobre a chamada ter
ocorrido:

| Objeto | Asserção de valor | Onde |
| ------ | ----------------- | ---- |
| `Block` | `toEqual([[PAGE, 'Artigo', 'pt-BR']])` sobre `[sourceUrl, sourceTitle, lang]` + frases segmentadas; `lang` após override `toEqual(['en'])` | `lib/capture.test.ts:101,104`; `lib/edit.test.ts:108` |
| `Cursor` | `toEqual(cursorOf('a',0,0))` em pause/stop/seek/fim de buffer; sequência completa de cursores no instante de cada `speak` | `lib/engine.test.ts:100,128,136,165,185,262,414` |
| `PlaybackState` | `toEqual({ playing: false, cursor: cursorOf('a',0,1), error: 'engine busy' })` — objeto inteiro | `lib/engine.test.ts:149-153`, `:197-201` |
| `translation` | valor retornado (`toBe('Olá guardado.')`) **junto** com a ausência da chamada (`create` `not.toHaveBeenCalled()`); `isStale` sobre o hash | `lib/translate.test.ts:115-116`; `lib/edit.test.ts:63-64` |
| `Prefs` | `toBe(1.75)`, `toEqual({'pt-BR':'Luciana'})`, defaults campo a campo (`rate`, `targetLang`, `activeTab`, `voiceByLang`) | `lib/storage.test.ts:138-141,149-150`; `lib/engine.test.ts:229,244` |
| `SetResult` | `toEqual({ ok: false, reason: 'quota' })` **e** buffer anterior preservado no mesmo teste | `lib/storage.test.ts:111-112` |
| `AppendResult` | `toEqual({ ok: true })` e `toEqual({ ok: false, reason: 'full' \| 'quota' })` — objeto inteiro em todos os ramos, incluindo os 3 testes de fronteira | `lib/storage.test.ts:39,48,56,65,85` |
| `CaptureResult` | `toEqual({ ok: false, reason: 'denied' \| 'inaccessible' \| 'empty' \| 'cancelled' \| 'full' \| 'unsupported' })` | `lib/capture.test.ts:125,135,145,155,164,174,183` |

Nenhuma asserção do tipo "só verifica que foi chamado" substitui uma asserção de valor.
`expect(h.stop).toHaveBeenCalled()` aparece sempre **junto** com a asserção de cursor/estado
(`lib/engine.test.ts:164-166`, `:283-286`).

---

## `// SPEC_DEVIATION:` — julgamento

Os 4 marcadores da iteração 1 continuam; **nenhum novo foi introduzido pelos fixes**
(`grep -rn "SPEC_DEVIATION" lib components entrypoints wxt.config.ts` → 4 ocorrências).

| # | Local | Desvio | Veredito |
| - | ----- | ------ | -------- |
| D1 | `lib/cursor.ts:46-51` | `reconcile` ganha um 3º parâmetro `previousBlocks` que o design não declarava | ✅ **Justificado.** P1-B AC17 exige "início do **bloco seguinte**"; a posição do bloco removido é indeterminável a partir da lista nova. Aditivo, opcional, degrada para a 1ª frase do buffer. Coberto por `lib/cursor.test.ts:92,102` e discriminado pela mutação M8 |
| D2 | `lib/capture.ts:54-58` | `requestAndCapture` ganha o parâmetro `url` | ✅ **Justificado pela API real.** Ler o url com `chrome.tabs.get` seria um `await` antes de `permissions.request` e o Chrome rejeitaria por perda de ativação do usuário — exatamente o que a AC7 exige evitar. Comprovado por `lib/capture.test.ts:86-89` |
| D3 | `components/CaptureBar.tsx:60-66` | Quando o url da aba não é visível, o painel pede `<all_urls>` em vez do host da aba | ⏸️ **Decisão pendente do usuário — registrado, não tratado como falha.** Sem a permissão `tabs`, `chrome.tabs.query` omite `url` enquanto a extensão não tem acesso àquela aba, e esse é o cenário mais comum (primeira captura num site novo). A cláusula "no mesmo clique" da AC7 é respeitada. O que muda é o **escopo**: a AC7 diz `origins:[host]`; com `<all_urls>` concedido a extensão passa a ter acesso permanente a todos os sites, contra a intenção de acesso mínimo de AD-005. Alternativa: declarar `tabs` no manifest e voltar a pedir só o host |
| D4 | `entrypoints/background.ts:11-14` | `chrome.tts.onEvent` de topo não existe; o callback `onEvent` é registrado por enunciado em `TtsOptions` | ✅ **Justificado pela API real.** É a única forma de receber eventos de `chrome.tts` e é o que reativa o service worker. O motor trata o evento igual, coberto por `lib/engine.test.ts:305-312` |

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ Os fixes somaram 1 função pura (`applyLang`, 5 linhas), 1 função de detecção (`isInaccessible`, 11 linhas), 1 `setBlocks` compartilhado e 2 exports reaproveitados (`MESSAGES`, `LANGS`). Nenhuma abstração especulativa |
| Mudanças cirúrgicas | ✅ Arquivos tocados = exatamente os 5 pontos apontados pela iteração 1 + `spec.md` |
| Sem scope creep | ✅ Nenhum arquivo novo; nenhuma AC nova implementada por conta própria |
| Casa com os padrões do projeto | ✅ Injeção de dependência, comentários de intenção e nomes consistentes com o resto de `lib/` |
| Reuso em vez de duplicação | ✅ F4 escolheu a guarda no ponto compartilhado (`setBlocks`) em vez de `try/catch` em cada chamador; F1 reusou `LANGS` e `languageName` em vez de novas listas |
| Checagem de resultado ancorada na spec | ✅ 0 lacunas de precisão — as 2 da iteração 1 viraram decisão explícita em `spec.md:49-50` |
| Expectativa de cobertura por camada | ⚠️ `lib/` tem mapeamento 1:1 com as ACs; `entrypoints/**` e `components/*.tsx` são `Tests: none` por AD-011 — 18 verificações manuais pendentes |
| Todo teste mapeia para um requisito — sem testes órfãos | ✅ Os 12 testes novos mapeiam para P2-A AC6 (4 em `edit.test.ts`), o edge case de iframe/shadow (4 em `extract.test.ts`, 1 em `capture.test.ts`), P1-A AC10 (2 em `storage.test.ts`) e o edge case de cota (1 em `storage.test.ts`) |
| Guidelines documentadas seguidas | ✅ Nenhuma no repositório — defaults fortes aplicados, conforme a Test Coverage Matrix |

---

## Gate Check

- **Comando (Build gate de `tasks.md`)**: `pnpm compile && pnpm test && pnpm build`
- **`pnpm compile`** (`tsc --noEmit`): **exit 0**, zero erros
- **`pnpm test`** (`vitest run --passWithNoTests`): **135 passed (135)**, 10 arquivos, 0 falhas, 0 skipped
  - `translate` 17 · `edit` 11 · `capture` 15 · `storage` 13 · `segment` 9 · `engine` 33 · `messages` 5 · `cursor` 12 · `voices` 7 · `extract` 13
- **`pnpm build`**: **exit 0** — `.output/chrome-mv3/` gerado (manifest 266 B, background 14,71 kB, sidepanel 244,18 kB, content 5,46 kB; total 264,93 kB)
- **Contagem antes da feature**: 0 (greenfield) · **iteração 1**: 123 · **iteração 2**: 135
- **Delta desta iteração**: **+12** (`edit` +4, `extract` +4, `storage` +3, `capture` +1)
- **Skipped**: nenhum (`grep -rn "\.skip\|\.todo\|\.only\|xit(\|xdescribe" lib/*.test.ts` → nada)
- **Integridade dos testes**: **nenhum arquivo perdeu testes**; nenhuma contagem por arquivo
  diminuiu; nenhuma asserção da iteração 1 foi enfraquecida. Conferido caso a caso nos pontos de
  maior risco de regressão:
  - **`appendBlock` (mudou de forma no F4)**: continua acrescentando ao final preservando os
    existentes (`lib/storage.test.ts:39-40`) e continua devolvendo `{ok:false,reason:'quota'}`
    com buffer preservado (`:85`, `:97`); agora delega a escrita a `setBlocks`, e
    `lib/capture.ts:97` propaga `appended.reason` ('full' e 'quota' ambos em `CaptureFailure`).
    `pnpm compile` confirma o encaixe de tipos.
  - **Segmentação (o F1 re-segmenta o bloco)**: `applyLang` preserva `id` e `text` e recalcula as
    frases no novo idioma (`lib/edit.test.ts:90-93`), e devolve o bloco **intacto por identidade**
    quando o idioma não muda (`:99` `toBe(original)`), evitando escrita e re-render supérfluos.
    `applyEdit` continua com as 7 asserções originais intactas. O select fica `disabled` durante a
    leitura (`components/BlockList.tsx:93`), e um cursor deslocado por re-segmentação é absorvido
    por `reconcile` (`lib/cursor.ts:62-63`, teste `lib/cursor.test.ts:102`).
- **`spec.md`**: `git diff HEAD` mostra **apenas +2 linhas** na tabela de Assumptions. Nenhuma AC
  foi reescrita, removida ou enfraquecida para acomodar a implementação.

**Gate: ✅ PASS**

---

## Limitações residuais (não bloqueantes, mas registradas)

1. **Alcance real da detecção de iframe cross-origin.** `isInaccessible` reconhece o **elemento
   `<iframe>`** (`lib/extract.ts:38-45`), não um elemento *dentro* dele — e num iframe
   cross-origin o evento de clique nunca chega ao documento de topo, então a mensagem só aparece
   se o clique cair no próprio iframe. A detecção de **shadow DOM fechado** não tem esse problema:
   o evento é retargetado ao host, que é exatamente o que `chrome.dom.openOrClosedShadowRoot`
   identifica (`lib/extract.ts:46`). Fecha a lacuna nº 2 da iteração 1; o comportamento de ponta a
   ponta no iframe entra no UAT (item 5).
2. **`availability` usa só o idioma do primeiro bloco.** `components/TranslatePanel.tsx:30`
   (`blocks[0]?.lang`) decide o estado do par para todo o buffer. Com a sobrescrita por bloco
   entregue no F1, um buffer com idiomas de origem diferentes pode mostrar "Par de idiomas não
   disponível" (ou o contrário) com base num bloco só. P2-A AC10 fala em "o par escolhido" e não
   desambigua buffers mistos.
3. **Select de voz sem opção vazia** (`components/Controls.tsx:76-89`): com `voices.length > 0` e
   `pickVoice` devolvendo `null`, o `<select>` recebe `value=''` sem uma `<option value="">`
   correspondente e exibe a primeira voz da lista enquanto nenhuma está de fato selecionada.
   Cosmético, mas confunde com a mensagem "Sem voz instalada para …" logo abaixo. (Carregado da
   iteração 1.)

---

## Verificações manuais pendentes (UAT)

Consequência de AD-011 (`entrypoints/**` e `components/*.tsx` = `Tests: none`) e de `spec.md:50`.
Nenhuma foi executada; todas seguem desmarcadas em `tasks.md`.

1. T9 — Clicar no ícone da extensão abre o side panel
2. T9 — Com dois blocos, `play` fala; fechar o painel mantém a fala até o fim (P1-B AC9)
3. T9 — Após 40 s de fala, reabrir o painel mostra o estado correto (P1-B AC10, inclusive o 1 s)
4. T11 — O contorno acompanha o ponteiro e o clique captura o elemento certo (P1-A AC2)
5. T11 — `Escape` encerra o modo sem capturar e remove o contorno (P1-A AC3); **e** clicar em um
   iframe cross-origin / conteúdo em shadow DOM fechado exibe "Conteúdo inacessível nesta região
   da página" (edge case, fix F2)
6. T13 — Reabrir o painel durante a leitura reflete o estado real em até 1 s (P1-B AC10)
7. T14 — A frase em leitura fica destacada e centralizada (P1-B AC4)
8. T14 — Clicar numa frase reposiciona a leitura (P1-B AC8)
9. T14 — Remover o bloco em leitura para a fala sem deixar destaque órfão (P1-B AC17)
10. T14 — **Novo (fix F1)**: trocar o "Idioma de origem" de um bloco muda a contagem de frases e
    faz a próxima tradução usar o idioma escolhido (P2-A AC6)
11. T15 — Mudar a velocidade afeta a frase seguinte e sobrevive a fechar/reabrir (P1-B AC11)
12. T15 — Sem voz local: controles desabilitados e mensagem exata (P1-B AC15/AC16)
13. T16 — Capturar em site novo com o painel aberto pede permissão e conclui (P1-A AC7)
14. T16 — Negar a permissão mostra "Sem acesso a este site" e não altera o buffer (P1-A AC8)
15. T18 — A primeira tradução de um par mostra a barra de progresso (P2-A AC3)
16. T18 — Alternar abas após traduzir não dispara nova chamada à API (P2-A AC5)
17. T19 — Traduzir EN→PT muda a voz para portuguesa ao abrir a aba Tradução (P2-A AC8)
18. T21/T22 — Edição bloqueada durante a fala, persiste no blur, esvaziar remove o bloco, tradução
    vira desatualizada (P2-B AC1–AC5); e instalar o pacote em perfil limpo executando os 4 Success
    Criteria da spec

---

## Lacunas ranqueadas

Nenhuma bloqueante. Em ordem de risco residual:

### 1. ADVISORY — D3: `<all_urls>` pedido em vez do host da aba
**Decisão pendente do usuário**, não falha. Ver a tabela de `SPEC_DEVIATION`. Caminho de saída:
declarar `tabs` no manifest, recuperar o url da aba e voltar a pedir só o host, como AD-005
pretendia.

### 2. ADVISORY — 18 verificações manuais de UAT não executadas
Fora do alcance de teste por AD-011. Devem rodar em Chrome real antes de considerar a feature
entregue. O item 10 é novo desta iteração e cobre o fix F1.

### 3. ADVISORY — `availability` decidido pelo idioma do primeiro bloco
`components/TranslatePanel.tsx:30`. Ver Limitações residuais nº 2. Fix possível em uma linha:
computar a disponibilidade pelo conjunto `new Set(blocks.map((b) => b.lang))`.

### 4. COSMÉTICO — select de voz sem `<option value="">`
`components/Controls.tsx:76-89`. Ver Limitações residuais nº 3.

---

## Requirement Traceability Update

| Requirement | Previous (iteração 1) | New (iteração 2) |
| ----------- | --------------------- | ---------------- |
| TTS-01 | ✅ Verificado | ✅ Verificado (`lib/capture.test.ts`, `lib/extract.test.ts`) |
| TTS-02 | ⚠️ Manual pendente | ⚠️ Manual pendente (picker e `Escape` em `entrypoints/content.ts`) |
| TTS-03 | ⚠️ Fronteira não discriminada | ✅ **Verificado** — fronteira de 500k fixada na spec e por 3 testes; mutante M1 morto |
| TTS-04 | ✅ com desvio D3 | ✅ Verificado, com D3 aguardando decisão do usuário |
| TTS-05 | ✅ Verificado | ✅ Verificado (`lib/storage.test.ts`, incluindo o `setBlocks` compartilhado) |
| TTS-06 | ✅ Verificado | ✅ Verificado (`lib/segment.test.ts`) |
| TTS-07 | ✅ Verificado | ✅ Verificado (`lib/engine.test.ts`, `lib/cursor.test.ts`) |
| TTS-08 | ⚠️ Manual pendente | ⚠️ Manual pendente (painel fechado / limite de 1 s, agora decisão de spec `spec.md:50`) |
| TTS-09 | ✅ lógica / UI manual | ✅ lógica verificada; mensagens de UI pendentes de verificação manual |
| TTS-10 | ✅ Verificado | ✅ Verificado (`lib/engine.test.ts:229,238`) |
| TTS-11 | ⚠️ Manual pendente | ⚠️ Manual pendente (destaque, auto-scroll, clique) |
| TTS-12 | ✅ Verificado | ✅ Verificado (`lib/translate.test.ts`) |
| TTS-13 | ❌ Precisa de correção | ✅ **Verificado** — `applyLang` + select por bloco; 4 testes novos; mutante M5 morto; render do select no UAT |
| TTS-14 | ✅ lógica / botões manual | ✅ lógica verificada; botões pendentes de verificação manual |
| TTS-15 | ✅ Verificado | ✅ Verificado (`lib/edit.test.ts`); modo de edição pendente de verificação manual |
| TTS-16 | ⚠️ Parcial | ✅ **Verificado** — >32k e erros de TTS cobertos; edge case de iframe/shadow agora detectado e testado; cota guardada no ponto compartilhado |

---

## Summary

**Overall**: ✅ **Pronto**, condicionado ao UAT.

**Checagem ancorada na spec**: 44 ACs — 33 com asserção de teste batendo com o resultado definido
pela spec (24 integralmente, 9 na parte testável) · 11 cobertas só pela linha de implementação em
`entrypoints/**` ou `components/*.tsx` (verificação manual pendente, AD-011) · **0 sem evidência**
· **0 lacunas de precisão de spec**.
**Sensor**: 8 mutações, **8 mortas, 0 sobreviveram**.
**Gate**: `pnpm compile && pnpm test && pnpm build` → exit 0, **135/135** testes, 0 skipped.
**Iteração 1**: **5/5 lacunas fechadas**.

**O que funciona**: toda a lógica de domínio em `lib/` — segmentação, aritmética do cursor,
persistência com fronteira inclusiva de 500k e guarda de cota no ponto compartilhado, seleção de
voz local, contrato de mensagens, motor de fala com chunking de frases longas, reconstrução após
restart do service worker, extração com detecção de região inacessível, orquestração de captura
com permissão no gesto do clique, cache de tradução por hash, edição com re-segmentação e
sobrescrita do idioma de origem por bloco. Gates verdes e pacote gerado.

**Problemas encontrados**: nenhum bloqueante. Quatro advisories: (1) D3 — `<all_urls>` aguardando
decisão do usuário; (2) 18 verificações manuais de UAT ainda não executadas; (3) `availability`
decidido pelo idioma do primeiro bloco; (4) select de voz sem opção vazia.

**Próximos passos**: executar as 18 verificações manuais em Chrome real (UAT), com atenção aos
itens 5 e 10, que cobrem os fixes F2 e F1; levar D3 ao usuário para decisão explícita; opcional,
tratar os advisories 3 e 4.
