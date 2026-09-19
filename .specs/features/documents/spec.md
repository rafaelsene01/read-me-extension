# Documents — Especificação

## Problem Statement

O painel lateral lê o que se captura de uma página, mas não há como ler um arquivo
próprio (anotações, rascunhos, documentação em Markdown). O usuário quer uma página
da extensão, aberta em aba própria como um site, onde importa um `.txt` ou `.md`,
lê em voz alta com o mesmo foco por clique e a mesma tradução do painel, guarda o
documento numa biblioteca e exporta o áudio em MP3.

## Goals

- [ ] Abrir a página Documentos a partir de um botão no topo do painel.
- [ ] Importar `.txt` e `.md` e ler o conteúdo com clique-para-focar, voz, play/pause e velocidade fixos no rodapé.
- [ ] Traduzir o documento mantendo a estrutura de parágrafos e frases.
- [ ] Salvar documentos numa biblioteca local e reabri-los.
- [ ] Gerar um arquivo `.mp3` do conteúdo com a voz neural selecionada.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| PDF, DOC/DOCX, EPUB | Pedido explícito: começar por TXT e MD; os demais serão planejados depois. |
| Excluir/renomear itens da biblioteca | Não pedido; entra quando a biblioteca crescer. |
| Renderizar Markdown (títulos, negrito) | A leitura e o foco por clique operam sobre frases de texto puro; renderizar exigiria dependência nova e um segundo modelo de exibição. |
| MP3 com a voz do sistema (`chrome.tts`) | `chrome.tts` não expõe o áudio gerado; não há como capturá-lo. |
| Buffer separado do painel | Decidido em council: um único buffer e um único engine; a página é outra vista dele. |
| Arrastar e soltar arquivo | Não pedido; o botão Novo cobre a importação. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Onde vive o documento aberto | No buffer compartilhado `local:blocks`, como um `Block` | Council unânime: `BlockList`, `TranslatePanel`, `Controls` e o engine funcionam sem mudança; foco por clique e tradução vêm prontos | n |
| Proteção do buffer ao abrir documento | Diálogo único (Cancelar / Substituir / Salvar e substituir) sempre que o buffer não está vazio, usado por toda entrada | Council: substituir em silêncio perde capturas do painel; um só gate evita caminho esquecido | n |
| Markdown | Sintaxe removida por `stripMarkdown()` antes de segmentar; o bloco guarda o texto limpo | Council unânime: TTS não pode ler "#" e "\*\*"; sem dependência nova | n |
| Onde fica o botão Novo | Barra de ações da aba Arquivo, ao lado de Salvar, MP3 e Limpar | "na primeira opção podemos ter um ícone de new" — a primeira aba é Arquivo | n |
| Botão Documentos no painel | Botão só com ícone e tooltip "Documentos", ao lado de Escolher elemento | Três botões com rótulo não cabem na largura do painel | n |
| Formato do áudio | MP3 mono 64 kbps via `@breezystack/lamejs` | Pedido explícito de MP3; não há codificador MP3 nativo no navegador | n |
| Onde roda a síntese do MP3 | Worker próprio da página (mesmo `tts-worker.ts`), encerrado ao terminar | O host do offscreen cancela qualquer síntese anterior ao receber uma nova: exportar por ele interromperia a leitura; PCM não atravessa `runtime.sendMessage` | n |
| Texto exportado | O da aba ativa (Original ou Tradução), com a voz e a velocidade atuais | Mesma regra que a leitura já usa (`viewOf`) | n |
| Codificação do arquivo | UTF-8 (`File.text()`) | Padrão de `.txt`/`.md` modernos; Latin-1 fica fora | n |
| Idioma do documento | `navigator.language`, alterável pelo select de idioma do bloco | O arquivo não declara idioma; o select já existe no `BlockList` | n |
| Nome e identidade na biblioteca | Nome = nome do arquivo (`sourceTitle` do primeiro bloco); id = id do primeiro bloco | Salvar de novo um documento reaberto atualiza o mesmo item em vez de duplicar | n |
| Rodapé fixo | Componente `Controls` inteiro do painel (motor, voz, play/pause, parar, velocidade) | Reuso direto; o pedido (voz, play/pause, velocidade) está contido nele | n |
| Limite de tamanho | Mesmo limite inclusivo de 500.000 caracteres do buffer | Coerente com `MAX_BUFFER_CHARS` | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1-A: Abrir a página Documentos ⭐ MVP

**User Story**: Como leitor, quero abrir uma página de documentos a partir do painel, para trabalhar com arquivos em tela cheia.

**Why P1**: É a porta de entrada da feature.

**Acceptance Criteria**:

1. WHEN o usuário aciona o botão Documentos no topo do painel THEN o sistema SHALL abrir uma nova aba com a página `documents.html` da extensão.
2. WHEN a página Documentos é aberta THEN o sistema SHALL exibir as abas "Arquivo" e "Biblioteca", com "Arquivo" selecionada.

**Independent Test**: Clicar em Documentos no painel e ver a nova aba com Arquivo selecionada.

---

### P1-B: Importar TXT e MD ⭐ MVP

**User Story**: Como leitor, quero importar um arquivo `.txt` ou `.md`, para ouvir seu conteúdo.

**Why P1**: Sem importação a página não tem conteúdo.

**Acceptance Criteria**:

1. WHEN o usuário aciona Novo e escolhe um arquivo `.txt` THEN o sistema SHALL substituir o buffer por um bloco com o texto do arquivo, `sourceTitle` e `sourceUrl` iguais ao nome do arquivo e idioma `navigator.language`.
2. WHEN o arquivo escolhido é `.md` THEN o sistema SHALL remover a sintaxe Markdown (marcadores de título `#`, ênfase `*`/`_`/`~~`, links `[t](u)` → `t`, imagens `![a](u)` → `a`, linhas de cerca de código, marcadores de lista, `>` de citação, barras e linhas separadoras de tabela, código inline em crases) antes de segmentar o texto.
3. IF a extensão do arquivo não é `.txt` nem `.md` THEN o sistema SHALL exibir "Formato não suportado" e não alterar o buffer.
4. IF o texto do arquivo está vazio após remover espaços (e sintaxe, no caso de `.md`) THEN o sistema SHALL exibir "Arquivo vazio" e não alterar o buffer.
5. IF o texto do arquivo tem 500.000 caracteres ou mais THEN o sistema SHALL exibir "Arquivo grande demais (limite de 500.000 caracteres)" e não alterar o buffer.
6. IF o buffer não está vazio quando um documento vai ser aberto (importação ou biblioteca) THEN o sistema SHALL exibir um diálogo com as ações Cancelar, Substituir e Salvar e substituir antes de alterar o buffer.
7. WHEN o usuário escolhe Cancelar no diálogo THEN o sistema SHALL manter o buffer inalterado.
8. WHEN o usuário escolhe Salvar e substituir no diálogo THEN o sistema SHALL gravar o buffer atual na biblioteca e só então substituí-lo pelo documento.

**Independent Test**: Importar um `.md` com títulos e links e ver as frases sem `#` nem URLs; importar um `.pdf` e ver "Formato não suportado".

---

### P1-C: Ler com foco por clique e controles fixos ⭐ MVP

**User Story**: Como leitor, quero clicar em qualquer frase do documento para a leitura seguir dali, com os controles sempre à mão.

**Why P1**: É o pedido central de leitura.

**Acceptance Criteria**:

1. The página SHALL exibir o conteúdo do buffer na aba Arquivo com o mesmo componente de frases do painel, destacando a frase em leitura.
2. WHEN o usuário clica numa frase THEN o sistema SHALL mover a leitura para essa frase (comando `seek`).
3. The página SHALL manter fixos no rodapé a escolha de voz, o play/pause e a velocidade, visíveis enquanto o conteúdo rola.
4. WHEN o usuário aciona Limpar THEN o sistema SHALL parar a leitura e esvaziar o buffer.
5. WHILE o buffer está vazio a aba Arquivo SHALL exibir "Importe um documento para começar."

**Independent Test**: Importar um `.txt`, dar play, clicar numa frase do meio e ouvir a leitura seguir dali; rolar e ver o rodapé fixo.

---

### P1-D: Traduzir mantendo a estrutura ⭐ MVP

**User Story**: Como leitor, quero traduzir o documento e ouvir a tradução com a mesma divisão em parágrafos e frases.

**Why P1**: Pedido explícito do usuário.

**Acceptance Criteria**:

1. The aba Arquivo SHALL oferecer as abas Original/Tradução, o idioma de destino e o botão Traduzir do painel.
2. WHEN a tradução termina THEN o sistema SHALL exibir o texto traduzido dividido em parágrafos e frases, com clique-para-focar funcionando na aba Tradução.

**Independent Test**: Traduzir um documento de 3 parágrafos e ver 3 parágrafos na aba Tradução; clicar numa frase traduzida e ouvir a leitura seguir dali.

---

### P2-A: Biblioteca

**User Story**: Como leitor, quero salvar documentos e reabri-los depois.

**Why P2**: Útil, mas a leitura funciona sem ela.

**Acceptance Criteria**:

1. WHEN o usuário aciona Salvar com o buffer não vazio THEN o sistema SHALL gravar em `local:documents` um item com id do primeiro bloco, nome igual ao `sourceTitle` do primeiro bloco, os blocos do buffer e a data de gravação.
2. WHEN o usuário salva um buffer cujo primeiro bloco já tem item na biblioteca THEN o sistema SHALL atualizar esse item em vez de criar outro.
3. The aba Biblioteca SHALL listar os documentos salvos com nome e data, do mais recente para o mais antigo.
4. WHEN o usuário escolhe um item da biblioteca THEN o sistema SHALL abrir os blocos desse item no buffer (passando pelo diálogo do P1-B AC6) e selecionar a aba Arquivo.
5. IF a gravação falha por falta de espaço THEN o sistema SHALL exibir "Armazenamento cheio" e manter a biblioteca anterior.
6. WHILE a biblioteca está vazia a aba Biblioteca SHALL exibir "Nenhum documento salvo."

**Independent Test**: Salvar um documento, limpar, abrir pela Biblioteca e ver o mesmo conteúdo (e a tradução, se havia).

---

### P2-B: Exportar MP3

**User Story**: Como leitor, quero baixar o áudio do documento em MP3, para ouvir fora do navegador.

**Why P2**: Pedido explícito, mas depende de motor neural.

**Acceptance Criteria**:

1. WHEN o usuário aciona MP3 com um motor neural selecionado THEN o sistema SHALL sintetizar o texto da aba ativa (Original ou Tradução) com a voz e a velocidade atuais e baixar o arquivo `<nome sem extensão>.mp3`.
2. WHILE o MP3 está sendo gerado o sistema SHALL exibir o progresso em porcentagem de parágrafos concluídos e manter o botão MP3 desabilitado.
3. WHERE o motor selecionado é a voz do sistema o sistema SHALL manter o botão MP3 desabilitado com o tooltip "Escolha uma voz neural para gerar MP3".
4. IF a síntese ou o carregamento do modelo falha THEN o sistema SHALL exibir a mensagem de erro e não baixar arquivo.
5. The geração de MP3 SHALL não interromper a leitura em andamento.
6. WHEN a geração termina, falha ou a página é fechada THEN o sistema SHALL encerrar o worker de síntese da página.

**Independent Test**: Com Kokoro selecionado, gerar MP3 de um documento curto e tocar o arquivo baixado.

---

## Edge Cases

- IF o arquivo tem exatamente 499.999 caracteres THEN o sistema SHALL aceitá-lo; com 500.000 SHALL recusá-lo (fronteira inclusiva).
- IF o `.md` tem só sintaxe (ex.: `---` e `#`) THEN o sistema SHALL tratá-lo como "Arquivo vazio".
- IF a extensão vem em maiúsculas (`NOTAS.MD`) THEN o sistema SHALL aceitá-la como `.md`.
- WHEN o buffer é substituído durante a leitura THEN o sistema SHALL parar a fala (comportamento existente de `blocksChanged`).
- IF a aba ativa é Tradução e um bloco não tem tradução THEN o MP3 SHALL usar o texto original desse bloco (regra de `viewOf`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| DOC-01 | P1-A: Abrir a página Documentos | Tasks | Pending |
| DOC-02 | P1-B: Importar TXT e MD (conversão e validação) | Tasks | Pending |
| DOC-03 | P1-B: Importar TXT e MD (Markdown) | Tasks | Pending |
| DOC-04 | P1-B: Diálogo de substituição | Tasks | Pending |
| DOC-05 | P1-C: Ler com foco por clique e controles fixos | Tasks | Pending |
| DOC-06 | P1-D: Traduzir mantendo a estrutura | Tasks | Pending |
| DOC-07 | P2-A: Biblioteca (persistência) | Tasks | Pending |
| DOC-08 | P2-A: Biblioteca (lista e abrir) | Tasks | Pending |
| DOC-09 | P2-B: Exportar MP3 (codificação) | Tasks | Pending |
| DOC-10 | P2-B: Exportar MP3 (síntese e UI) | Tasks | Pending |
