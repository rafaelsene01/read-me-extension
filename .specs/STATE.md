# Project State

Projeto: extensão de navegador leitora de texto com tradução on-device.
Stack: WXT 0.21 + React 19 + TypeScript, alvo Chromium (Chrome/Edge/Brave).

---

## Decisions

### AD-001 — WXT como framework de extensão

- **Status**: active
- **Decisão**: Usar WXT 0.21 em vez de Vite + CRXJS ou config manual.
- **Razão**: Gera o manifest por convenção de pastas, dá HMR em content script e empacota com `wxt zip`. Next.js foi descartado: SSR e router não rodam sob MV3.

### AD-002 — Side panel é a superfície principal

- **Status**: active
- **Decisão**: A UI vive no side panel (`chrome.sidePanel`), aberto pelo clique no ícone.
- **Razão**: O fluxo do produto é capturar, navegar e voltar; o popup fecha ao primeiro clique na página.

### AD-003 — Áudio no background com `chrome.tts`

- **Status**: active
- **Decisão**: A fala roda no service worker via `chrome.tts`, nunca no documento do painel.
- **Razão**: `speechSynthesis` não existe em service worker MV3 e morre junto com o painel; `chrome.tts` sobrevive ao painel fechado.

### AD-004 — Estado de verdade em `storage.local`

- **Status**: active
- **Decisão**: Buffer, preferências e cursor de leitura vivem em `storage.local`; nada de estado de sessão em variável do worker.
- **Razão**: O service worker MV3 é encerrado em torno de 30 segundos de ociosidade.

### AD-005 — `activeTab` mais `optional_host_permissions`

- **Status**: active
- **Decisão**: Manifest declara `activeTab` e `optional_host_permissions: ["<all_urls>"]`; o painel chama `permissions.request` no próprio clique quando falta acesso ao host.
- **Razão**: `activeTab` é concedido por gesto na action, não por interação dentro do side panel; sem isso, capturar pelo painel falha em todo site novo.

### AD-006 — Só vozes locais

- **Status**: active
- **Decisão**: A lista de vozes filtra `remote: false`; lista vazia é um estado de UI de primeira classe.
- **Razão**: As vozes padrão do Chrome são sintetizadas em servidor do Google e enviariam o texto para fora, quebrando a premissa on-device.

### AD-007 — Frase como unidade de fala e de destaque

- **Status**: active
- **Decisão**: `Intl.Segmenter` com granularidade de frase define a unidade enfileirada, destacada e retomada.
- **Razão**: Contorna o limite de tamanho do motor de voz, dá feedback visual em parágrafos longos e cria um ponto de retomada barato.

### AD-008 — Cursor ancorado em id de bloco

- **Status**: active
- **Decisão**: O cursor é `{blockId, paraIndex, sentIndex}`, nunca um índice global posicional.
- **Razão**: Remover ou editar um bloco durante a leitura corromperia um índice posicional.

### AD-009 — Tradução pela Translator API nativa

- **Status**: active
- **Decisão**: Tradução via `Translator`/`Translator.availability` (Chrome 138+), criada no handler do clique, com cache por bloco.
- **Razão**: On-device, sem chave nem servidor; o download do pacote de idiomas exige ativação do usuário na mesma tarefa.

### AD-010 — Firefox fora da v1

- **Status**: active
- **Decisão**: v1 entrega apenas Chromium. O caminho Firefox fica isolado atrás de `lib/engine.ts` e `lib/voices.ts` para ser acrescentado depois.
- **Razão**: Firefox exige um segundo caminho de áudio (background page com `speechSynthesis`) e não expõe Translator API.

### AD-011 — Testes só sobre `lib/`

- **Status**: active
- **Decisão**: Vitest cobre a lógica pura em `lib/`; entrypoints e componentes React são verificados manualmente com passos escritos no `Done when`.
- **Razão**: Montar runner de DOM e e2e de extensão custa mais do que entrega nesta v1; toda lógica não trivial foi empurrada para `lib/`.

### AD-012 — Documentos compartilham o buffer do painel

- **Status**: active
- **Decisão**: A página Documentos (`/documents.html`) grava o documento aberto em `local:blocks`; toda entrada passa por um diálogo único (Cancelar / Substituir / Salvar e substituir) quando o buffer não está vazio.
- **Razão**: Council unânime. Foco por clique, tradução, controles e engine funcionam sem mudança; um segundo buffer exigiria trocar a fonte do engine e refatorar `BlockList`/`TranslatePanel`.

### AD-013 — MP3 sintetizado num worker da própria página

- **Status**: active
- **Decisão**: A exportação cria seu próprio worker (`tts-worker.ts`) e codifica MP3 em streaming com `@breezystack/lamejs`; só motores neurais.
- **Razão**: O host do offscreen cancela qualquer síntese anterior ao receber outra, então exportar por ele interromperia a leitura; PCM não atravessa `runtime.sendMessage`; `chrome.tts` não expõe áudio.

### AD-014 — EPUB vira capítulos no modelo de frases

- **Status**: active
- **Decisão**: Cada item do spine vira um `Block`; a formatação é só o tipo de cada parágrafo (`Block.kinds`: `h1`..`h6`, `p`, `quote`, `li`) renderizado com Tailwind. CSS, fontes e imagens do livro ficam fora.
- **Razão**: Council unânime. Seek, destaque, tradução, engine e MP3 dependem de `paragraphs`/`sentences`; CSS do livro é não confiável e conflita com o tema.

### AD-015 — Página = capítulo, só para livros

- **Status**: active
- **Decisão**: A página Documentos mostra um bloco por vez quando o buffer tem algum bloco com `kinds`; a página segue o cursor quando ele muda de bloco. Demais buffers continuam empilhados.
- **Razão**: Council (unânime em página = capítulo; 3 de 4 em só livros). Paginação por tela exigiria recalcular a cada zoom e quebraria o auto-scroll.

### AD-016 — `fflate` + `DOMParser` para EPUB; `happy-dom` só nos testes

- **Status**: active
- **Decisão**: `unzipSync` do `fflate` com filtro de entradas, XML/XHTML por `DOMParser` (XHTML inválido cai para `text/html`); `lib/epub.test.ts` roda em `happy-dom`.
- **Razão**: Council unânime: parser zip à mão erra em data descriptors, zip64 e nomes; o `unzip` assíncrono do `fflate` usa workers por blob URL, recusados pela CSP.

### AD-017 — Importar EPUB salva e abre; sem limite de 500k

- **Status**: active
- **Decisão**: A importação grava o livro (com capa em data URL) em `local:documents` e abre pelo `useReplaceGuard`. `MAX_BUFFER_CHARS` não se aplica ao EPUB. `saveDocument` preserva a capa existente.
- **Razão**: Council 3 de 4 (dissent: só salvar) e unânime no limite: romances passam de 500k, `unlimitedStorage` já existe e `setBlocks` não aplica o limite.

---

## Handoff

- **Última fase concluída**: Execute — 23 de 23 tarefas implementadas (T1..T22 do plano original mais T23, acrescentada durante a execução).
- **Verifier**: PASS na iteração 2. `.specs/features/tts-reader/validation.md`; `validate_state.py tts-reader` 0 erros. Iteração 1 devolveu FAIL com 5 lacunas, todas fechadas (select de idioma de origem, detecção de iframe/shadow DOM, fronteira dos 500.000, cota em `setBlocks`, lacuna de precisão registrada na spec).
- **Gates**: `pnpm compile && pnpm test && pnpm build` verde; 135 testes, 0 falhas; sensor de discriminação 8/8 mutantes mortos; `pnpm zip` gera `.output/tts-reader-0.1.0-chrome.zip`.
- **Git**: apenas `d4f71d0` (scaffold T1) está commitado. **T2..T23 e os fixes vivem no working tree, não commitados**, a pedido do usuário. As mensagens de commit atômicas por tarefa, na ordem, estão em `.specs/features/tts-reader/COMMITS.md` — commitar tudo de uma vez perde a granularidade.
- **Próximo passo**: UAT manual no Chrome (18 itens listados em `validation.md`), depois commitar seguindo `COMMITS.md`.
- **Decisão pendente do usuário**: `components/CaptureBar.tsx` pede `<all_urls>` em vez do host específico, porque sem a permissão `tabs` o Chrome oculta a URL da aba. Funciona, mas amplia a permissão de forma permanente, contra a intenção da AD-005.
- **Lições**: 6 candidatas registradas em `.specs/lessons.json` (`lessons.py list`).
