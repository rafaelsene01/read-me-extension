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

---

## Handoff

- **Última fase concluída**: Tasks (spec, design e tasks escritos e validados).
- **Artefatos**: `.specs/features/tts-reader/spec.md`, `design.md`, `tasks.md`.
- **Gates**: `validate_spec.py` 0 erros; `validate_tasks.py` 0 erros, 12 avisos de `Tests: none` confirmados contra a Test Coverage Matrix.
- **Próximo passo**: Execute — começar por T1 (scaffold WXT). Nenhum código escrito ainda; a pasta do projeto contém apenas `.specs/`.
- **Git**: repositório ainda não inicializado; T1 deve criar o repo antes do primeiro commit atômico.
