# Validação — EPUB

**Verdict**: FAIL

Verificador independente (autor != verificador). Data: 2026-09-19.

- **Diff verificado**: working tree (não commitado) vs HEAD `5eb3f95` (iterações 1, 2 e 3).
- **Motivo do veredito (iteração 3)**: o defeito de P1-A AC6 foi corrigido e provado (sonda ADEPT com `enc:` → `drm`; sensor da correção mortos). O FAIL vem de um mutante sobrevivente em P1-B AC1: trocar a ordem do spine pela ordem do manifest passa em todos os testes, porque na fixture as duas ordens coincidem. O código está certo (sonda com manifest fora de ordem → ordem do spine); falta o teste discriminar. Detalhes na seção "Iteração 3".
- **Motivo do veredito (iteração 2, histórico)**: a correção da iteração 1 funciona (URI relativa à raiz do contêiner), mas P1-A AC6 continua falhando para `encryption.xml` com prefixo de namespace (`enc:CipherReference`), que é a forma dos exemplos do OCF e do ADEPT. Prova por sonda na seção "Iteração 2". Gate verde, sensor da correção 4/4 mortos.

## Iteração 3 (re-verificação final)

Data: 2026-09-19. Foco: gap 1 da iteração 2 (P1-A AC6 com prefixo `enc:`), P1-B AC1 e AD-016. O resto foi mantido, não refeito.

### Gate

`timeout 3600 pnpm compile && pnpm test && pnpm build` → exit 0. `tsc` sem erros; Vitest **25 arquivos, 281 testes, todos passando** (lib/epub.test.ts: 16); `wxt build` ok (chrome-mv3, 42.19 MB).

### P1-A AC6 e edge case de fontes

- Código: lib/epub.ts:30-33 (`allByLocalName`, casa por `localName`); lib/epub.ts:102-112 (busca `CipherReference` por localName em lib/epub.ts:105, URI resolvida pela raiz do contêiner em lib/epub.ts:108). `rootfile` (lib/epub.ts:75), `item` (lib/epub.ts:84), `itemref` (lib/epub.ts:96) e `meta` (lib/epub.ts:161) também por localName.
- Testes: lib/epub.test.ts:243-273. Sem prefixo: fontes → `ok` com 2 blocos; capítulo por 3 formas de URI → `drm`. Com `xmlns:enc`/`enc:CipherReference`: capítulo → `drm` (lib/epub.test.ts:265-268), só fontes → `ok` (lib/epub.test.ts:269-272). lib/epub.test.ts:275-315: container `c:rootfile` e OPF `opf:package/opf:item/opf:itemref/opf:meta` (EPUB 2) → título, 2 blocos na ordem e capa. Os testes afirmam o resultado da spec (spec.md:85, spec.md:180), não a implementação.

### Sonda spec-anchored (cópia isolada `scratchpad/sensor3`)

EPUB com `mimetype`, OPF em subpasta e `encryption.xml` no formato ADEPT (`xmlns:enc`, `xmlns:ds`, `enc:EncryptionMethod`, `ds:KeyInfo/ds:RetrievalMethod`, `enc:CipherReference`):

| Caso | Esperado | Obtido |
| ---- | -------- | ------ |
| OPF em `OEBPS/`, cifra `OEBPS/Text/c1.xhtml` e `c2.xhtml` | `drm` | `drm` |
| OPF em `a/b/`, cifra `a/b/Text/c2.xhtml` | `drm` | `drm` |
| Cifra só `OEBPS/Fonts/f.otf` | `ok` | `ok` |
| Container com prefixo `ns0:rootfile` + ADEPT no capítulo | `drm` | `drm` |
| EPUB 2 com `opf:` em `OPS/`, manifest `c2,c1`, spine `c1,c2`, container `ns0:` | título, ordem do spine, `dc:language` | `Livro2`, `[Um, Dois]`, `en` |

Todas conforme a spec.

### P1-B AC1 (ordem do spine, href relativo ao OPF, `%XX`)

- Código: lib/epub.ts:18-21 (`resolvePath` contra a pasta do OPF, decodifica `%XX`); lib/epub.ts:95-100 (percorre `itemref` na ordem do documento). Correto; provado pela sonda acima (manifest fora de ordem → ordem do spine).
- Testes: lib/epub.test.ts:87 (2 capítulos em ordem), lib/epub.test.ts:157 (`%20` em subpasta), lib/epub.test.ts:275 (OPF com prefixo). **Não discriminam spine × manifest**: em todas as fixtures (lib/epub.test.ts:42-49, lib/epub.test.ts:289-297) o manifest lista `c1,c2` na mesma ordem do spine. Ver mutante MF.

### Sensor de discriminação da correção

Cópia isolada em `scratchpad/sensor3` (só `lib/`, config, junction para `node_modules`). Junction removida antes de apagar a pasta; `node_modules` real intacto. `git status --porcelain` idêntico antes/depois.

| Mutante | Falha injetada em lib/epub.ts | Resultado |
| ------- | ----------------------------- | --------- |
| MA | `CipherReference` volta a `getElementsByTagName` (:105) | KILLED |
| MB | `item` volta a `getElementsByTagName` (:84) | KILLED |
| MC | `itemref` volta a `getElementsByTagName` (:96) | KILLED |
| MD | `rootfile` volta a `getElementsByTagName` (:75) | KILLED |
| ME | `meta` volta a `getElementsByTagName` (:161) | KILLED |
| MG | helper compara `tagName` em vez de `localName` (:32) | KILLED |
| MF | spine lido na ordem do manifest, não na do `itemref` (:96) | **SURVIVED** |

**6/7 mortos, 1 sobrevivente (MF).** MF não é equivalente: com manifest fora de ordem (comum em EPUBs reais) a saída muda. Correção sugerida (só teste): na fixture `opf()` (lib/epub.test.ts:42-49) listar o manifest como `c2,c1` mantendo o spine `c1,c2`, ou inverter o spine num teste e afirmar a ordem dos blocos.

### AD-016

Fechado. .specs/STATE.md:100-103 agora diz `jsdom`.

## Iteração 2 (re-verificação)

Data: 2026-09-19. Foco: gaps 1 e 3 da iteração 1. O resto da iteração 1 foi mantido, não refeito.

### Gate

`timeout 3600 pnpm compile && pnpm test && pnpm build` → exit 0. `tsc` sem erros; Vitest **25 arquivos, 280 testes, todos passando**; `wxt build` ok (chrome-mv3, 42.19 MB).

### P1-A AC6 e edge case de fontes

- Código: lib/epub.ts:97-107. lib/epub.ts:103 agora usa `resolvePath(uri, '')` (raiz do contêiner, OCF). Correto.
- Teste: lib/epub.test.ts:243-259. Fontes em `OEBPS/fonts/font1.woff` → `ok` com 2 blocos (edge case, spec.md:180). Capítulo por `OEBPS/Text/cap2.xhtml`, `OEBPS/Text/cap%201.xhtml` e `/OEBPS/Text/cap2.xhtml` → `drm` (spec.md:85). O teste afirma o resultado da spec com URIs relativas à raiz; não espelha mais o código.

### Sonda spec-anchored (cópia isolada)

OPF em subpasta, `encryption.xml` no formato do OCF (`xmlns:enc="http://www.w3.org/2001/04/xmlenc#"`, `<enc:CipherReference URI="OEBPS/Text/c1.xhtml"/>`):

| Caso | Esperado | Obtido |
| ---- | -------- | ------ |
| OPF em `OEBPS/`, URI `OEBPS/Text/c1.xhtml`, com prefixo `enc:` | `drm` | **`ok`** |
| OPF em `a/b/`, URI `a/b/Text/c1.xhtml`, com prefixo `enc:` | `drm` | **`ok`** |
| Só fonte `OEBPS/Fonts/f.otf`, com prefixo `enc:` | `ok` | `ok` |
| Os três casos acima sem prefixo | drm/drm/ok | drm/drm/ok |

Causa isolada: `getElementsByTagName('CipherReference')` (lib/epub.ts:100) compara o nome qualificado; `enc:CipherReference` não casa. A resolução pela raiz está certa; a busca do elemento não. O arquivo já tem `firstByLocalName` (lib/epub.ts:23): a correção é iterar por `localName === 'CipherReference'` (ou `getElementsByTagNameNS('http://www.w3.org/2001/04/xmlenc#', 'CipherReference')`) e acrescentar à fixture de lib/epub.test.ts:244 uma variante com `xmlns:enc`/`enc:`.

### Sensor de discriminação da correção

Cópia isolada em `scratchpad/sensor2` (junction para `node_modules`), removida ao fim. `git status --porcelain` idêntico antes/depois.

| Mutante | Falha injetada em lib/epub.ts:103 | Resultado |
| ------- | --------------------------------- | --------- |
| MA | volta ao bug antigo: `resolvePath(uri, opfPath)` | KILLED (teste DRM falha) |
| MB | compara a URI crua, sem resolver nem decodificar `%XX` | KILLED |
| MC | qualquer `CipherReference` vira DRM (fontes também) | KILLED |
| MD | devolve `invalid` em vez de `drm` | KILLED |

**4/4 mortos.** O mutante "só o nome sem prefixo" sobrevive por construção: as fixtures não usam prefixo, e é exatamente o defeito acima.

### Gap 3 (happy-dom)

Fechado. `happy-dom` saiu do package.json (só `jsdom`, package.json:37); design.md:147 registra jsdom. Resta .specs/STATE.md:100-103 (AD-016) ainda dizendo happy-dom (só documentação).

## Gate (iteração 1)

`timeout 3600 pnpm compile && pnpm test && pnpm build` → exit 0.

- `tsc` sem erros.
- Vitest: **25 arquivos, 280 testes, todos passando**.
- `wxt build` ok (chrome-mv3, 42.19 MB).

## Critérios de aceitação

Legenda: **OK** = implementado e testado; **UAT** = implementado, UAT pendente (UI sem teste automatizado, AD-011); **DEFEITO** = comportamento contradiz a spec; **PENDENTE** = depende de tarefa não feita.

### P1-A: Importar EPUB

| AC | Status | Evidência | Teste |
| -- | ------ | --------- | ----- |
| 1 Item "Livro"/"EPUB", seletor `.epub` | UAT | components/NewDocumentMenu.tsx:94, components/NewDocumentMenu.tsx:113-118 | — |
| 2 Grava em `local:documents` com `dc:title`, bloco por capítulo, capa | OK (parser) / UAT (gravação) | lib/epub.ts:108, lib/epub.ts:111-171; components/NewDocumentMenu.tsx:73 | lib/epub.test.ts:87, lib/epub.test.ts:200 |
| 3 Abre via `useReplaceGuard` e seleciona Arquivo | UAT | components/NewDocumentMenu.tsx:77; entrypoints/documents/App.tsx:120 | — |
| 4 Cancelar mantém buffer, livro fica na biblioteca | UAT | components/NewDocumentMenu.tsx:72-77 (salva antes do diálogo) | — |
| 5 "EPUB inválido" | OK | lib/epub.ts:61-76; components/NewDocumentMenu.tsx:24 | lib/epub.test.ts:230 |
| 6 DRM → "EPUB protegido por DRM não é suportado" | OK (iter. 3) | lib/epub.ts:30-33, lib/epub.ts:102-112 (localName + raiz do contêiner); components/NewDocumentMenu.tsx:25 | lib/epub.test.ts:243-273 (com e sem prefixo `enc:`) |
| 7 "Arquivo vazio" | OK | lib/epub.ts:149; components/NewDocumentMenu.tsx:26 | lib/epub.test.ts:317 |
| 8 "Armazenamento cheio" sem alterar buffer | OK (storage) / UAT (UI) | lib/storage.ts:84-88; components/NewDocumentMenu.tsx:73-75 | lib/storage.test.ts:260 |
| 9 Aceita >= 500.000 caracteres | OK | lib/epub.ts (sem limite); components/NewDocumentMenu.tsx:73 (não passa por `fileToBlock`) | lib/epub.test.ts:327 |

### P1-B: Extrair capítulos com formatação

| AC | Status | Evidência | Teste |
| -- | ------ | --------- | ----- |
| 1 Ordem do spine, href relativo ao OPF, `%XX` | **TESTE FRACO (iter. 3)** — código OK, ordem não discriminada | lib/epub.ts:18-21, lib/epub.ts:95-100 | lib/epub.test.ts:87, lib/epub.test.ts:157, lib/epub.test.ts:275 (manifest e spine na mesma ordem; mutante MF sobrevive) |
| 2 Pula `linear="no"` e sem texto | OK | lib/epub.ts:92, lib/epub.ts:133 | lib/epub.test.ts:129 |
| 3 Parágrafo por bloco folha, espaços colapsados, sem script/style, sem repetição | OK | lib/epub.ts:10, lib/epub.ts:120-132 | lib/epub.test.ts:100 |
| 4 `kinds` alinhado a `paragraphs` | OK | lib/epub.ts:38-44, lib/epub.ts:131 | lib/epub.test.ts:100, lib/epub.test.ts:115 |
| 5 `sourceTitle`, `sourceUrl`, `lang`, `paragraphs` | OK | lib/epub.ts:129, lib/epub.ts:137-146 | lib/epub.test.ts:87, lib/epub.test.ts:115, lib/epub.test.ts:123 |
| 6 XHTML malformado lido como HTML | OK | lib/epub.ts:116-119 | lib/epub.test.ts:172 |
| 7 Sem `dc:title` → nome do arquivo | OK | lib/epub.ts:108-109 | lib/epub.test.ts:190 |

### P1-C: Capa

| AC | Status | Evidência | Teste |
| -- | ------ | --------- | ----- |
| 1 `cover-image`, senão `<meta name="cover">`, senão sem capa | OK | lib/epub.ts:151-161 | lib/epub.test.ts:200, lib/epub.test.ts:210 |
| 2 Data URL `data:<media-type>;base64,...` | OK | lib/epub.ts:47-53, lib/epub.ts:163-167 | lib/epub.test.ts:200, lib/epub.test.ts:210 |
| 3 Capa ou ícone na Biblioteca | UAT | components/LibraryList.tsx:53-61 | — |
| 4 Salvar sem capa mantém a existente | OK | lib/storage.ts:79-83 | lib/storage.test.ts:232, lib/storage.test.ts:242, lib/storage.test.ts:252 |

### P1-D: Ler página a página

| AC | Status | Evidência | Teste |
| -- | ------ | --------- | ----- |
| 1 Um bloco por vez, Anterior/Próximo, "N / total" | UAT | entrypoints/documents/App.tsx:53, entrypoints/documents/App.tsx:80-99, entrypoints/documents/App.tsx:147-155, entrypoints/documents/App.tsx:172; components/BlockList.tsx:124 | — |
| 2 Sem `kinds` → empilhado | UAT | entrypoints/documents/App.tsx:53, entrypoints/documents/App.tsx:172 | — |
| 3 Página segue o cursor | UAT | entrypoints/documents/App.tsx:46-50 | — |
| 4 Anterior/Próximo sem comando ao engine | UAT | entrypoints/documents/App.tsx:91 (só `setPage`) | — |
| 5 Novo documento volta à primeira página | UAT | entrypoints/documents/App.tsx:44 | — |
| 6 Estilo por tipo, relativo ao zoom | UAT | components/BlockList.tsx:44-69, components/BlockList.tsx:239-242 | — |
| 7 Clique, destaque e MP3 nas páginas | UAT | components/BlockList.tsx:242-267 (spans de frase preservados) | — |
| 8 Sem botão Editar em bloco com `kinds` | UAT | components/BlockList.tsx:158 | — |
| 9 Original mesmo na aba Tradução | UAT | components/BlockList.tsx:39 | — |
| 10 "Original"/"Ouvir traduzido", sem Traduzir (painel e Documentos) | UAT | components/TranslatePanel.tsx:50, components/TranslatePanel.tsx:124, components/TranslatePanel.tsx:147; entrypoints/sidepanel/App.tsx:43; entrypoints/documents/App.tsx:180 | — |
| 11 Buffer misto: traduz só blocos sem `kinds` | UAT | components/TranslatePanel.tsx:49, components/TranslatePanel.tsx:81-90 | — |

### P2-A: Ouvir traduzido em tempo real

| AC | Status | Evidência | Teste |
| -- | ------ | --------- | ----- |
| 1 Traduz e fala na voz do destino | OK | lib/engine.ts:127-141 | lib/engine.test.ts:592 |
| 2 Aba Original não traduz | OK | lib/engine.ts:127 | lib/engine.test.ts:607 |
| 3 Tela no original, frase original destacada | OK (cursor) / UAT (tela) | lib/engine.ts:121 (cursor persistido na frase original); components/BlockList.tsx:39 | lib/engine.test.ts:592 (`cursorAtSpeak`) |
| 4 Pede adiantada a frase seguinte | OK | lib/engine.ts:155-163 | lib/engine.test.ts:628 |
| 5 Cache em memória por par | OK | lib/translate.ts:153-169 | lib/translate.test.ts:283, lib/translate.test.ts:292 |
| 6 Pausa/parada/seek descartam tradução em andamento | OK | lib/engine.ts:117, lib/engine.ts:138, lib/engine.ts:210, lib/engine.ts:220, lib/engine.ts:231 | lib/engine.test.ts:637 |
| 7 Falha → para, "Falha na tradução: <motivo>", cursor mantido | OK | lib/engine.ts:132-136 | lib/engine.test.ts:655 |
| 8 Preparar par no clique, com progresso | OK (lib) / UAT (UI) | lib/translate.ts:195-211; components/TranslatePanel.tsx:67-74, components/TranslatePanel.tsx:118, components/TranslatePanel.tsx:132 | lib/translate.test.ts:342 |
| 9 Funciona com página e painel fechados | **PENDENTE de spike T8** | entrypoints/background.ts:72; entrypoints/offscreen/main.ts:161-168; lib/translate.ts:135-146 | lib/translate.test.ts:274, lib/translate.test.ts:323 (só o canal; a API no offscreen não foi provada) |
| 10 Nunca grava tradução | OK (estrutural) | lib/engine.ts:31-37 (`EngineStorage` sem escrita de blocos); lib/translate.ts:149-186 (sem storage) | — (garantido por tipo) |

### Edge cases

| Caso | Status | Evidência | Teste |
| ---- | ------ | --------- | ----- |
| `encryption.xml` só com fontes → importa | OK | lib/epub.ts:102-112 | lib/epub.test.ts:249-252, lib/epub.test.ts:269-272 (com prefixo `enc:`) |
| `%20` e subpasta | OK | lib/epub.ts:19-21 | lib/epub.test.ts:157 |
| Capa ausente do zip → sem capa | OK | lib/epub.ts:165-166 | lib/epub.test.ts:221 |
| 600.000 caracteres | OK | lib/epub.ts (sem limite) | lib/epub.test.ts:327 |
| Captura acrescentada vira mais uma página | UAT | entrypoints/documents/App.tsx:53, entrypoints/documents/App.tsx:172 | — |

## Sensor de discriminação (iteração 1)

Cópia isolada em scratchpad (junction para `node_modules`), removida ao fim. `git status --porcelain` idêntico antes/depois; nenhum worktree criado.

| Mutante | Arquivo | Falha injetada | Resultado |
| ------- | ------- | -------------- | --------- |
| M1 | lib/epub.ts | sem tipo `quote` | KILLED |
| M2 | lib/epub.ts | checagem de DRM desligada | KILLED |
| M3 | lib/epub.ts | sem filtro de folha (texto repetido) | KILLED |
| M4 | lib/epub.ts | não pula `linear="no"` | KILLED |
| M5 | lib/epub.ts | sem fallback de capa EPUB 2 | KILLED |
| M6 | lib/epub.ts | sem fallback XHTML→HTML | KILLED |
| M7 | lib/storage.ts | não preserva a capa | KILLED |
| M8 | lib/translate.ts | cache de texto desligado | KILLED |
| M9 | lib/translate.ts | falha fica no cache (sem retry) | KILLED |
| M10 | lib/engine.ts | sem guarda de geração | KILLED |
| M11 | lib/engine.ts | sem prefetch | KILLED |
| M12 | lib/engine.ts | fala no idioma original | KILLED |
| M13 | lib/engine.ts | traduz também na aba Original | KILLED |
| M14 | lib/engine.ts | falha de tradução não para a leitura | KILLED |

**14/14 mortos, 0 sobreviventes.**

### Sonda spec-anchored (DRM)

EPUB mínimo com `META-INF/encryption.xml` cifrando `URI="OEBPS/Text/c1.xhtml"` — caminho relativo à raiz do contêiner, como manda o OCF e como fazem Adobe ADEPT/LCP. `parseEpub` devolveu `ok` em vez de `drm`. A implementação resolve a URI contra a pasta do OPF (`lib/epub.ts:102` → `OEBPS/OEBPS/Text/c1.xhtml`), e o teste `lib/epub.test.ts:243` usa `Text/cap2.xhtml` (relativo ao OPF), então espelha o código em vez da spec. Livros com DRM reais seriam importados como texto lixo.

## UAT pendente

- P1-A AC1, AC2 (gravação real), AC3, AC4, AC8 (mensagem na UI).
- P1-C AC3.
- P1-D AC1–AC11 (todos UI).
- P2-A AC3 (tela), AC8 (progresso na UI), AC9 (depende do spike T8).
- Edge case: captura acrescentada vira mais uma página.
- design.md:152: UAT com EPUBs reais (EPUB 2 e EPUB 3) é obrigatório.

## Gaps ranqueados (após iteração 3)

1. **Médio — P1-B AC1 (novo, iteração 3)**: mutante MF (ordem do manifest no lugar da do spine) sobrevive; o código está certo, mas nenhuma fixture tem manifest fora da ordem do spine. Correção só no teste (lib/epub.test.ts:42-49). *P1-A AC6 com prefixo `enc:` (gap 1 da iteração 2): corrigido e provado.*
2. **Médio — P2-A AC9**: pendente do spike manual T8 (Translator API no offscreen); não é falha, é pendência.
3. **Baixo — P2-A AC10**: sem teste explícito de que a tradução ao vivo nunca é gravada; garantido só pela forma de `EngineStorage` (lib/engine.ts:31-37).
4. **Baixo — XHTML com prefixo HTML** (`<h:p>`): `PARA_SELECTOR` (lib/epub.ts:10) não casa elementos HTML com prefixo; limitação deliberada, rara em EPUBs reais.
5. **Baixo — P1-D inteiro e P1-C AC3**: sem teste automatizado (AD-011); depende do UAT listado acima.
6. *Doc AD-016 (gap 3 da iteração 2): corrigido.*
