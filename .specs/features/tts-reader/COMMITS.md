# Commits propostos — fases 1 e 2

O working tree contém T2..T9 juntos. Para reproduzir os commits atômicos,
faça `git add` apenas dos arquivos listados em cada seção, na ordem, e use a
mensagem abaixo dela. Todas as mensagens passaram por `check_commit.py`.

T1 já está commitado como `d4f71d0`.

---

## T2 — arquivos: lib/types.ts, .specs/features/tts-reader/tasks.md

```
feat(types): add shared block, cursor and prefs models

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T3 — arquivos: lib/segment.ts, lib/segment.test.ts, .specs/features/tts-reader/tasks.md

```
feat(segment): split block text into paragraphs and sentences

One paragraph per non-empty line, sentences via Intl.Segmenter in the block
language. Ids derive from the block id plus positional indices so the same
text always yields the same ids. chunkSentence breaks sentences above the
32000 character engine limit on whitespace.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T4 — arquivos: lib/storage.ts, lib/storage.test.ts, .specs/features/tts-reader/tasks.md

```
feat(storage): persist blocks, prefs and reading cursor

appendBlock refuses with reason "full" once the buffer would pass 500000
characters and with reason "quota" when the write fails, leaving the previous
buffer intact in both cases. Prefs default to rate 1.0, navigator.language as
target and the original tab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T5 — arquivos: lib/voices.ts, lib/voices.test.ts, package.json, pnpm-lock.yaml, lib/segment.test.ts, .specs/features/tts-reader/tasks.md

Nota: `@types/chrome` entrou aqui porque `lib/voices.ts` é o primeiro módulo a
tocar `chrome.tts` e `pnpm compile` quebrava sem ele. As mudanças em
`lib/segment.test.ts` trocam indexação direta por `map`/`flatMap` para
satisfazer `noUncheckedIndexedAccess`, que só apareceu ao rodar `compile`.

```
feat(voices): list local voices and pick one per language

listLocalVoices keeps only remote: false voices, so captured text never leaves
the machine. pickVoice prefers a manual choice, then an exact language match,
then a voice sharing the base language.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T6 — arquivos: lib/cursor.ts, lib/cursor.test.ts, .specs/features/tts-reader/tasks.md

```
feat(cursor): add pure cursor arithmetic over the block buffer

nextCursor crosses paragraph and block boundaries and returns null at the end
of the buffer. reconcile keeps a valid cursor, moves to the start of the
following block when the cursor block was removed and returns null once the
buffer is empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T7 — arquivos: lib/messages.ts, lib/messages.test.ts, .specs/features/tts-reader/tasks.md

```
feat(messages): add typed panel to background command contract

The Command union covers play, pause, stop, seek, setRate, setVoice, capture
and state. onCommand returns false for anything that is not a Command so other
listeners keep working, and broadcastState swallows the disconnected-port
rejection raised when no side panel is open.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T8 — arquivos: lib/engine.ts, lib/engine.test.ts, .specs/features/tts-reader/tasks.md

```
feat(engine): add sentence queue with cursor persistence

createEngine speaks one sentence per tts.speak call and writes the cursor to
storage before each call, so a worker killed mid-sentence wakes up knowing
where it was. pause keeps the cursor, stop rewinds to the first sentence and
the end of the buffer marks playing false. An error or unsolicited interrupted
event halts the queue on the failing sentence and publishes the message.

reconcile(blocks, cursor) gained an optional previousBlocks argument, marked
with SPEC_DEVIATION in the source: spec P1-B AC17 asks for the start of the
FOLLOWING block when the cursor block is removed, which cannot be derived from
the new list alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T9 — arquivos: entrypoints/background.ts, .specs/features/tts-reader/tasks.md

```
feat(background): wire the reading engine to the service worker

The worker owns the engine, backed by real chrome.tts and the storage module,
answers the panel commands and reconciles the cursor whenever the stored blocks
change. Clicking the toolbar icon opens the side panel.

Speech events are taken from the onEvent callback in TtsOptions, marked with
SPEC_DEVIATION in the source: design.md names a chrome.tts.onEvent event that
the API does not expose.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Verificação manual pendente (usuário)

- T1 — `pnpm dev` carrega a extensão no Chrome sem erro no console de extensões
- T9 — clicar no ícone abre o side panel
- T9 — com dois blocos no storage, `play` fala e a fala continua com o painel fechado
- T9 — após mais de 40 segundos de fala, reabrir o painel mostra o estado correto

---

# Commits propostos — fases 3 e 4

Mesmo procedimento: `git add` apenas dos arquivos de cada seção, na ordem, com a
mensagem abaixo dela. Todas passaram por `check_commit.py`.

---

## T10 — arquivos: lib/extract.ts, lib/extract.test.ts, .specs/features/tts-reader/tasks.md

```
feat(extract): add text extraction rules for selection and elements

extractFromSelection reads the active selection and extractFromElement reads
innerText, so block children keep their line breaks. Both collapse whitespace
runs and drop blank lines, leaving a spaces-only capture empty. pageLang
returns the language declared by the page, falling back to navigator.language.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T11 — arquivos: entrypoints/content.ts, .specs/features/tts-reader/tasks.md

```
feat(content): add on-demand picker and selection capture

The script is registered at runtime with no match pattern, so it stays out of
the manifest and adds no host permission: the panel injects it per tab. Picker
mode outlines the element under the pointer, captures its text on click and
resolves with null on Escape, while selection mode reads the active selection
without showing the overlay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T12 — arquivos: lib/capture.ts, lib/capture.test.ts, .specs/features/tts-reader/tasks.md

```
feat(capture): orchestrate host permission and content injection

requestAndCapture calls permissions.request as its first await so the click
still counts as user activation, then injects the content script and appends
the captured text as a block. Every refusal has its own reason: unsupported for
browser internal pages and the web stores, denied, inaccessible, cancelled,
empty, full and quota, and none of them touch the buffer.

The tab url is a third parameter instead of being read from chrome.tabs, marked
with SPEC_DEVIATION in the source: reading it would await before the permission
request and spend the user gesture.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T13 — arquivos: entrypoints/sidepanel/App.tsx, entrypoints/sidepanel/main.tsx, .specs/features/tts-reader/tasks.md

Nota: `main.tsx` entra aqui porque o template ainda renderizava `<div />`; sem
essa linha o componente raiz não é montado.

```
feat(sidepanel): add the panel shell subscribed to background state

App asks the background for the playback state on mount and then follows the
broadcasts, so a panel reopened mid-reading catches up instead of guessing.
Blocks and prefs are read from storage and reloaded whenever the store changes,
which is how a capture or a cursor move made elsewhere reaches the panel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T14 — arquivos: components/BlockList.tsx, entrypoints/sidepanel/App.tsx, .specs/features/tts-reader/tasks.md

Nota: `App.tsx` entra aqui só para montar a lista no lugar do texto de buffer
vazio.

```
feat(blocklist): render blocks with sentence highlight and auto-scroll

Each block shows its source url and a remove button, each paragraph a span per
sentence. The sentence under the cursor is highlighted and scrolled to the
middle of the panel, and clicking any sentence seeks the engine to it. Removing
a block writes to storage, which is what makes the background reconcile the
cursor and stop a reading that was inside it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T15 — arquivos: components/Controls.tsx, entrypoints/sidepanel/App.tsx, .specs/features/tts-reader/tasks.md

Nota: `App.tsx` entra aqui só para montar os controles e calcular o idioma
ativo (bloco do cursor, senão o primeiro bloco).

```
feat(controls): add playback controls with local voice selection

The select is fed by listLocalVoices, so only on-device voices are offered. An
empty list shows "Nenhuma voz local instalada neste sistema" and a language
with no installed voice shows "Sem voz instalada para [idioma]"; both keep play
disabled. The rate slider goes through setRate, which applies from the next
sentence and persists the preference.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T16 — arquivos: components/CaptureBar.tsx, entrypoints/sidepanel/App.tsx, .specs/features/tts-reader/tasks.md

Nota: `App.tsx` entra aqui só para montar a barra no topo do painel.

```
feat(capturebar): add capture, picker and clear with failure messages

Each button calls requestAndCapture straight from the click handler, so the
permission prompt still has the user gesture, and every failure reason maps to
the message the spec names. Clear stops the reading before emptying the buffer.

The active tab is tracked in state because chrome.tabs hides the url until the
extension has access to that tab. When the url is hidden the handler requests
<all_urls> instead of the single host, marked with SPEC_DEVIATION in the source.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Verificação manual pendente — fases 3 e 4 (usuário)

- T11 — o contorno acompanha o ponteiro em um artigo e o clique captura o elemento correto
- T11 — `Escape` encerra o modo picker sem capturar e remove o contorno
- T13 — reabrir o painel durante a leitura reflete o estado real em até 1 segundo
- T14 — a frase em leitura fica destacada e centralizada durante toda a leitura
- T14 — clicar numa frase reposiciona a leitura nela
- T14 — remover o bloco em leitura para a fala e não deixa destaque órfão
- T15 — mudar a velocidade afeta a frase seguinte e sobrevive ao fechar e reabrir o painel
- T16 — capturar em site novo com o painel aberto pede permissão e conclui a captura
- T16 — negar a permissão mostra "Sem acesso a este site" e não altera o buffer

Aberto de propósito: o item "Buffer vazio desabilita play, Traduzir, Editar e
Limpar" do T13 só pode ser marcado quando Traduzir (T18) e Editar (T21)
existirem. Play e Limpar já ficam desabilitados.

---

# Commits propostos — fases 5 e 6

## T17 — arquivos: lib/translate.ts, lib/translate.test.ts, .specs/features/tts-reader/tasks.md

```
feat(translate): wrap the Translator API with per-block caching

create runs in the same task as the click that asked for the translation, with
nothing awaited before it, so the language-pack download keeps the user
gesture. A block already translated for the same target with an unchanged text
hash is served from storage instead of the API.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T18 — arquivos: components/TranslatePanel.tsx, components/BlockList.tsx, components/Controls.tsx, entrypoints/sidepanel/App.tsx, .specs/features/tts-reader/tasks.md

Nota: `BlockList.tsx` entra aqui porque a aba Tradução precisa renderizar os
parágrafos traduzidos e o aviso de tradução desatualizada. `Controls.tsx` entra
só para exportar `languageName`, reusada pelo select de idioma de destino.
`App.tsx` entra só para montar o painel e passar a aba ativa.

```
feat(translate-panel): add original and translation tabs

The Traduzir button calls translateBlock for every block straight from the
handler, so the language-pack download keeps the user gesture, and the result
is stored with the block. Switching tabs only writes the preference: the stored
text is reused with no further API call.

BlockList now renders the paragraphs of the active tab and marks a block whose
text changed after translation as "Tradução desatualizada". Its highlight
moved from sentence id to cursor position, because the translation of a block
has its own sentence ids at the same coordinates.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T19 — arquivos: components/Controls.tsx, entrypoints/sidepanel/App.tsx, lib/engine.ts, lib/engine.test.ts, .specs/features/tts-reader/tasks.md

Nota: `lib/engine.ts` entra aqui porque o Success Criteria "ouvir a tradução com
voz portuguesa" exige que o motor leia o texto da aba ativa, não só que a voz
mude. `viewOf(blocks, activeTab)` troca parágrafos e idioma do bloco traduzido
preservando os ids, então o cursor continua válido ao alternar as abas.

```
feat(controls): follow the active tab language for voice and speech

The voice is picked for the language of the tab being read, so the translation
tab speaks with a voice of the target language without a manual choice.
voiceByLang stays keyed by language, so a manual pick survives switching tabs.

The engine reads the buffer through the active tab as well: on the translation
tab a translated block speaks its translation, in the target language, while a
block with no translation keeps its original text.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T20 — arquivos: lib/edit.ts, lib/edit.test.ts, .specs/features/tts-reader/tasks.md

```
feat(edit): apply edited text to a block and re-segment it

The block id is preserved so the reading cursor survives the edit, and the
stored translation is carried over untouched: its hash no longer matches the
new text, which is what isStale reports. An edit that leaves nothing but
whitespace returns null, signalling the caller to drop the block.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T21 — arquivos: components/BlockList.tsx, entrypoints/sidepanel/App.tsx, .specs/features/tts-reader/tasks.md

Nota: `App.tsx` entra aqui só para passar `playing` à lista, que é o que trava a
edição durante a leitura.

```
feat(blocklist): edit a block in place with the reading stopped

Editar is disabled while the reading runs and only on the original tab, which
holds the source of truth. The field is an uncontrolled plaintext-only
contenteditable, so the caret and the undo stack survive re-renders, and blur
runs applyEdit: the block is re-segmented and persisted, or removed when the
edit left nothing behind.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T23 — arquivos: lib/engine.ts, lib/engine.test.ts, .specs/features/tts-reader/tasks.md

Nota: tarefa nova, acrescentada ao `tasks.md` entre T21 e T22. `spec.md` não
precisou mudar: TTS-16 já cobre a frase acima de 32.000 caracteres e a tabela de
rastreabilidade já aponta para esse edge case.

```
fix(engine): chunk oversized sentences before speaking

chunkSentence existed since the segmentation task but nothing called it, so a
sentence above the 32000 character engine limit was handed to chrome.tts whole.
It is now split before speaking: each piece is its own speak call and the
cursor advances once, after the last one. pause and stop drop the remaining
pieces, so the next play restarts the sentence from its first chunk.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## T22 — arquivos: README.md, .specs/features/tts-reader/tasks.md

Nota: o `tasks.md` deste commit também fecha o checkbox "Buffer vazio desabilita
play, Traduzir, Editar e Limpar" do T13 (ver abaixo).

```
docs(readme): document install, permissions and known limits

Covers loading the unpacked build, why the optional host permission is only
asked on the first capture from the panel, and the limits a user hits first:
local voices only, Chrome 138+ for translation, no Firefox, sentence-level
highlight, pages that cannot be captured.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Verificação manual pendente — fases 5 e 6 (usuário)

- T18 — primeira tradução de um par mostra a barra de progresso do download
- T18 — alternar abas depois de traduzir não dispara nova chamada à Translator API
- T19 — capturar artigo em inglês, traduzir para português e ouvir a aba Tradução com voz portuguesa
- T21 — durante a leitura a área fica somente leitura e Editar desabilitado
- T21 — editar com a leitura pausada e sair do campo persiste o texto e re-segmenta
- T21 — apagar todo o conteúdo de um bloco remove o bloco
- T21 — bloco editado que tinha tradução mostra "Tradução desatualizada"
- T22 — instalar `.output/tts-reader-0.1.0-chrome.zip` em perfil limpo do Chrome e executar os quatro Success Criteria

O item "Buffer vazio desabilita play, Traduzir, Editar e Limpar" do T13, que
ficou aberto na fase 4 por falta de Traduzir e Editar, foi marcado agora: com o
buffer vazio o `Traduzir` do T18 fica desabilitado, a lista de blocos (e com ela
o `Editar` do T21) não é renderizada, e `Ler`/`Limpar` já estavam travados. Essa
mudança de checkbox acompanha o commit do T22.

---

# Fix tasks — lacunas do relatório do Verifier (`validation.md`)

Working tree, não commitado. Mesma regra das seções acima: `git add` apenas dos
arquivos listados, na ordem, e a mensagem abaixo de cada seção. Todas passaram
por `check_commit.py`.

---

## F1 — arquivos: lib/edit.ts, lib/edit.test.ts, components/BlockList.tsx, components/TranslatePanel.tsx

Lacuna 1 (BLOCKER) — P2-A AC6: o select de sobrescrita do idioma de origem não
existia. A sobrescrita é **por bloco**, não global: a AC fala do idioma "do
bloco", cada bloco vem de uma página com o seu próprio `lang` e o buffer mistura
páginas. O valor cai em `block.lang`, que `translateBlock`, `segmentBlock` e a
escolha de voz já leem. `TARGET_LANGS` virou `LANGS`, exportado, porque agora
alimenta os dois selects.

```
feat(blocklist): add a source language override per block

Spec P2-A AC6 asks for a select that overrides the language the page declared,
and the language it names is the language of the block, so the select sits in
the block header instead of the translate panel. applyLang re-segments the
block, because sentences are cut by Intl.Segmenter in that language, and
translateBlock already reads block.lang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## F2 — arquivos: lib/extract.ts, lib/extract.test.ts, entrypoints/content.ts, lib/capture.ts, lib/capture.test.ts

Lacuna 2 (MAJOR) — o edge case "iframe cross-origin ou shadow DOM fechado" só
disparava por exceção de `executeScript`. `isInaccessible` testa as duas
condições nomeadas pela spec: `contentDocument` nulo (ou que lança) num
`IFRAME`, e `chrome.dom.openOrClosedShadowRoot` devolvendo uma raiz que
`el.shadowRoot` esconde. O picker responde com `inaccessible: true` e
`requestAndCapture` traduz isso em `reason: 'inaccessible'`, que já está ligado
à mensagem em `CaptureBar`.

```
fix(capture): detect the regions the picker cannot read

The 'Conteúdo inacessível nesta região da página' message only fired when
executeScript itself threw. The two conditions the spec names failed silently:
a closed shadow root returned the host text and a cross-origin iframe did
nothing. isInaccessible now tests both at click time and the picker answers
with an inaccessible payload.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## F3 — arquivos: lib/storage.ts, lib/storage.test.ts, .specs/features/tts-reader/spec.md

Lacuna 3 (MAJOR) — mutante M6. A spec P1-A AC10 diz "atingiu 500.000": limite
inclusivo. A implementação era exclusiva (`>`), então passou para `>=`. Os
testes de fronteira fixam os três totais resultantes: 499.999 aceita, 500.000
recusa, 500.001 recusa (já coberto). Conferido: com `>` de volta, o teste de
500.000 falha.

A linha do `spec.md` deste commit é a da tabela Assumptions que registra a
decisão do limite inclusivo.

```
fix(storage): refuse the capture that reaches the buffer limit

Spec P1-A AC10 reads 'atingiu 500.000', so the limit is inclusive and a
capture landing the buffer on exactly 500000 characters is refused. Boundary
tests pin 499999, 500000 and 500001 resulting characters.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## F4 — arquivos: lib/storage.ts, lib/storage.test.ts, components/CaptureBar.tsx, components/BlockList.tsx, components/TranslatePanel.tsx

Lacuna 4 (MINOR) — o `try/catch` de cota vivia dentro de `appendBlock`, então os
`setBlocks` da edição e da tradução estouravam sem a mensagem. A guarda passou
para `setBlocks`, o ponto por onde todos os chamadores passam; `appendBlock`,
`removeBlock` e `clearBlocks` devolvem o resultado dele. `MESSAGES` de
`CaptureBar` virou export, para que os três componentes usem o mesmo texto.

```
fix(storage): report a quota failure from every buffer write

The try/catch lived inside appendBlock, so the writes after an edit or a
translation lost the 'Armazenamento cheio' message. setBlocks now owns the
guard and returns a result, which is the one point every caller goes through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## F5 — arquivos: .specs/features/tts-reader/spec.md

Lacuna 5 (MINOR, sem código) — o "em até 1 segundo" da P1-B AC10 não é
verificável por teste unitário: `entrypoints/**` e `components/*.tsx` são
`Tests: none` na Test Coverage Matrix. Registrado como decisão na tabela
Assumptions: conferido manualmente no UAT.

Se F3 e F5 forem commitados juntos (as duas linhas são vizinhas na mesma
tabela), use a mensagem do F3 e descarte esta.

```
docs(spec): record the buffer boundary and the one second limit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
