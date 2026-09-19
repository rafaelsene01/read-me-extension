# EPUB — Especificação

## Problem Statement

A página Documentos importa só `.txt` e `.md`. O usuário quer importar livros em
EPUB: o arquivo é processado e salvo direto na biblioteca, a capa do livro aparece
na lista da biblioteca, e ao abrir o livro para leitura ele aparece página a página,
com a formatação do conteúdo (títulos, citações, listas) em vez de texto corrido.

## Goals

- [ ] Importar um `.epub` pelo menu Novo, salvando-o na biblioteca e abrindo-o no leitor.
- [ ] Mostrar a capa do livro na lista da biblioteca.
- [ ] Ler o livro um capítulo por página, com anterior/próximo, seguindo a leitura em voz alta.
- [ ] Exibir títulos, citações e itens de lista com estilo próprio, mantendo clique-para-focar, destaque, tradução e MP3.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| CSS do próprio livro, fontes embutidas | Council unânime: o CSS é não confiável, conflita com o tema/dark mode e com os spans de frase que dão seek e destaque. |
| Imagens dentro dos capítulos | Mesmo motivo; só a capa foi pedida. |
| Negrito/itálico dentro da frase | As frases são texto puro (`Sentence.text`); inline exigiria mudar o modelo de frase, o engine e a tradução. |
| Paginação por tela (estilo Kindle) | Council unânime: recalcular páginas a cada zoom/resize quebra auto-scroll e destaque; um capítulo por página reusa tudo. |
| Sumário (TOC/nav) navegável | Não pedido; anterior/próximo e o indicador "N / total" cobrem a navegação. |
| EPUB com DRM | Conteúdo cifrado não é legível sem a chave do distribuidor. |
| Posição de leitura por livro | Não pedido; o cursor continua global, como hoje. |
| PDF, DOC/DOCX | Planejados à parte. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Modelo de renderização | Um spine item (capítulo) vira um `Block`; cada parágrafo ganha um tipo (`h1`..`h6`, `p`, `quote`, `li`) em `Block.kinds`, renderizado com Tailwind | Council unânime (Q1): seek, destaque, tradução, engine e MP3 dependem de frases; CSS do livro fica fora | n |
| O que é uma "página" | Um capítulo (bloco) por vez, com anterior/próximo e "N / total"; capítulos longos rolam | Council unânime (Q5): paginação por tela é um motor de layout à parte | n |
| Onde vale a paginação | Só quando o buffer tem algum bloco de livro (`kinds` presente); `.txt`, `.md` e capturas continuam empilhados | Council 3 de 4 (Q6): evita "1 / 1" morto em documentos comuns; dissent (Architect): paginar tudo | n |
| Buffer misto (livro + captura) | Paginação vale para o buffer inteiro; a captura vira mais uma página | Critic (Q6): o flag por bloco não pode deixar parte paginada e parte empilhada | n |
| Importar = salvar e abrir | Salva na biblioteca sempre; depois abre pelo `useReplaceGuard` (diálogo quando o buffer não está vazio; Cancelar mantém o livro salvo) | Council 3 de 4 (Q3); dissent (Skeptic): só salvar | n |
| Limite de 500.000 caracteres | Não se aplica a EPUB | Council unânime (Q4): romances passam de 500k; `unlimitedStorage` já existe e `setBlocks` não aplica o limite | n |
| Descompactação | `fflate` (`unzipSync` com filtro de entradas) | Council unânime (Q2): parser zip à mão erra em data descriptors, zip64 e nomes | n |
| Parse de XML/XHTML | `DOMParser`; XHTML inválido cai para `text/html` | Plataforma nativa; EPUBs reais costumam violar XHTML | n |
| Testes do parser | `happy-dom` como devDependency, só em `lib/epub.test.ts` (`// @vitest-environment happy-dom`) | Vitest roda em Node sem `DOMParser`; AD-011 cobre só `lib/` | n |
| Capa | Item do manifest com `properties` contendo `cover-image` (EPUB 3), senão `<meta name="cover">` (EPUB 2), senão sem capa; guardada como data URL em `LibraryDocument.cover`, sem redimensionar | Os dois formatos cobrem os EPUBs comuns; `unlimitedStorage` absorve o tamanho | n |
| Salvar de novo um livro aberto | `saveDocument` mantém a capa existente quando o documento novo não traz capa | Salvar e "Salvar e substituir" recriam o documento a partir dos blocos, sem capa | n |
| Título e idioma | `dc:title` (senão nome do arquivo sem `.epub`); `dc:language` (senão `navigator.language`) | Metadados do próprio livro; o select de idioma por bloco continua corrigindo | n |
| Rótulo do capítulo | `sourceUrl` = texto do primeiro título (`h1`..`h3`) do capítulo, senão "Capítulo N" | O cabeçalho do card já mostra `sourceUrl`; evita parsear o TOC | n |
| Itens do spine | `linear="no"` e capítulos sem texto são pulados | Capa, página em branco e notas fora do fluxo não viram página vazia | n |
| DRM | Recusado quando `META-INF/encryption.xml` cifra algum item do spine; ofuscação só de fontes é aceita | Fontes ofuscadas são comuns em EPUB sem DRM | n |
| Página ao abrir e ao ler | Abre na primeira página; quando o cursor muda de bloco, a página passa a ser a do cursor; anterior/próximo só troca a página exibida, sem mexer no áudio | Página e áudio só se reencontram quando a leitura avança de capítulo | n |
| Edição de um capítulo | Os tipos só são aplicados quando `kinds.length` é igual ao número de parágrafos exibidos; senão tudo é parágrafo comum | Editar pode mudar o número de linhas; trocar idioma e traduzir preservam (tradução é linha a linha) | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1-A: Importar EPUB para a biblioteca ⭐ MVP

**User Story**: Como leitor, quero importar um livro EPUB, para que ele fique na biblioteca e abra no leitor.

**Why P1**: É a porta de entrada do formato.

**Acceptance Criteria**:

1. The menu Novo SHALL oferecer o item "Livro" com a descrição "EPUB", que abre o seletor de arquivos filtrado por `.epub`.
2. WHEN o usuário escolhe um `.epub` válido THEN o sistema SHALL gravar em `local:documents` um item com nome igual ao `dc:title` do livro, um bloco por capítulo com texto e a capa, quando houver.
3. WHEN o livro foi gravado THEN o sistema SHALL abri-lo no leitor pelo mesmo diálogo de substituição do P1-B AC6 de Documents e selecionar a aba Arquivo.
4. WHEN o usuário escolhe Cancelar no diálogo THEN o sistema SHALL manter o buffer inalterado e o livro na biblioteca.
5. IF o arquivo não é um zip, não tem `META-INF/container.xml` ou o pacote OPF não pode ser lido THEN o sistema SHALL exibir "EPUB inválido" e não alterar biblioteca nem buffer.
6. IF `META-INF/encryption.xml` cifra algum capítulo do spine THEN o sistema SHALL exibir "EPUB protegido por DRM não é suportado" e não alterar biblioteca nem buffer.
7. IF nenhum capítulo do spine tem texto THEN o sistema SHALL exibir "Arquivo vazio" e não alterar biblioteca nem buffer.
8. IF a gravação na biblioteca falha por falta de espaço THEN o sistema SHALL exibir "Armazenamento cheio" e não alterar o buffer.
9. The importação de EPUB SHALL aceitar livros com 500.000 caracteres ou mais.

**Independent Test**: Importar um EPUB de romance, ver o livro na Biblioteca e o primeiro capítulo aberto em Arquivo.

---

### P1-B: Extrair capítulos com formatação ⭐ MVP

**User Story**: Como leitor, quero que o conteúdo do livro chegue com títulos, citações e listas distintos, na ordem de leitura.

**Why P1**: Sem extração não há o que ler nem o que formatar.

**Acceptance Criteria**:

1. The extração SHALL seguir a ordem do spine do OPF, resolvendo cada `href` relativo à pasta do OPF e decodificando `%XX`.
2. The extração SHALL pular itens do spine com `linear="no"` e capítulos sem texto.
3. The extração SHALL gerar um parágrafo por elemento de bloco folha (`p`, `h1`..`h6`, `li`, `blockquote`, `pre`, `div`, `dt`, `dd`, `figcaption`, `td`, `th` sem outro desses dentro), com espaços colapsados, ignorando `script` e `style`, sem repetir texto.
4. The extração SHALL registrar o tipo de cada parágrafo em `Block.kinds`, alinhado por índice a `Block.paragraphs`: `h1`..`h6` pelo nível do título, `quote` quando o elemento está dentro de `blockquote`, `li` para item de lista, `p` nos demais.
5. The bloco de cada capítulo SHALL ter `sourceTitle` igual ao título do livro, `sourceUrl` igual ao texto do primeiro `h1`..`h3` do capítulo (ou "Capítulo N", com N a partir de 1 na ordem dos capítulos com texto), `lang` igual ao `dc:language` (ou `navigator.language`) e `paragraphs` igual a `segmentBlock(text, lang, id)`.
6. IF um capítulo não é XHTML bem-formado THEN o sistema SHALL lê-lo como HTML em vez de descartá-lo.
7. WHERE o livro não tem `dc:title` o sistema SHALL usar o nome do arquivo sem a extensão `.epub`.

**Independent Test**: Um EPUB com `h1`, parágrafos, `blockquote > p` e `ul > li` gera um bloco cujo `kinds` é `['h1','p','quote','li']` e cujo texto não repete a citação.

---

### P1-C: Capa na biblioteca ⭐ MVP

**User Story**: Como leitor, quero ver a capa de cada livro na biblioteca, para reconhecê-lo de relance.

**Why P1**: Pedido explícito.

**Acceptance Criteria**:

1. The extração SHALL tomar como capa o item do manifest com `properties` contendo `cover-image`; na falta dele, o item apontado por `<meta name="cover" content="id">`; na falta dos dois, o livro fica sem capa.
2. WHEN há capa com `media-type` de imagem THEN o sistema SHALL guardá-la em `LibraryDocument.cover` como data URL `data:<media-type>;base64,...`.
3. The aba Biblioteca SHALL exibir a capa ao lado do nome e da data de cada item que tem capa, e um ícone de documento no mesmo espaço nos demais.
4. WHEN um documento é salvo sem capa sobre um item que já tem capa THEN o sistema SHALL manter a capa existente.

**Independent Test**: Importar um EPUB 3 e um EPUB 2 com capa e ver as duas capas na Biblioteca; salvar o livro aberto e ver a capa continuar.

---

### P1-D: Ler página a página, formatado ⭐ MVP

**User Story**: Como leitor, quero ler o livro um capítulo por vez, com títulos e citações formatados, sem perder o clique-para-focar.

**Why P1**: É o pedido central de leitura.

**Acceptance Criteria**:

1. WHILE o buffer tem algum bloco com `kinds` a aba Arquivo SHALL exibir um bloco por vez, com botões Anterior e Próximo e o indicador "N / total".
2. WHILE nenhum bloco do buffer tem `kinds` a aba Arquivo SHALL exibir os blocos empilhados, como hoje.
3. WHEN o cursor de leitura passa para outro bloco THEN a página exibida SHALL passar a ser a desse bloco.
4. WHEN o usuário aciona Anterior ou Próximo THEN o sistema SHALL trocar só a página exibida, sem comando ao engine.
5. WHEN o buffer é substituído por outro documento THEN a página exibida SHALL voltar para a primeira.
6. The página SHALL renderizar parágrafo `h1`..`h6` como título de tamanho decrescente, `quote` com recuo e borda à esquerda, `li` como item de lista com marcador e `p` como hoje, com tamanhos relativos ao zoom.
7. IF `kinds.length` difere do número de parágrafos exibidos THEN o sistema SHALL renderizar todos os parágrafos do bloco como `p`.
8. The clique numa frase, o destaque da frase lida, a aba Tradução e a exportação MP3 SHALL continuar funcionando nas páginas do livro.

**Independent Test**: Abrir um livro, dar play, ver a página avançar sozinha no fim do capítulo; clicar Próximo sem o áudio mudar; ver o título do capítulo maior que o texto.

---

## Edge Cases

- IF o EPUB tem `encryption.xml` só com ofuscação de fontes THEN o sistema SHALL importá-lo normalmente.
- IF o `href` do spine tem `%20` ou está em subpasta (`OEBPS/Text/cap 1.xhtml`) THEN o sistema SHALL encontrar o arquivo.
- IF o item de capa aponta para um arquivo ausente do zip THEN o sistema SHALL importar o livro sem capa.
- IF o livro tem 600.000 caracteres THEN o sistema SHALL importá-lo (sem limite de 500k).
- IF uma captura do painel é acrescentada a um livro aberto THEN ela SHALL aparecer como mais uma página.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| EPUB-01 | P1-B: Extrair capítulos com formatação | Tasks | Pending |
| EPUB-02 | P1-A: Importar EPUB (erros: inválido, DRM, vazio, sem limite) | Tasks | Pending |
| EPUB-03 | P1-C: Capa (extração) | Tasks | Pending |
| EPUB-04 | P1-C: Capa (preservar ao salvar de novo) | Tasks | Pending |
| EPUB-05 | P1-A: Importar EPUB (menu, salvar e abrir) | Tasks | Pending |
| EPUB-06 | P1-C: Capa (exibir na biblioteca) | Tasks | Pending |
| EPUB-07 | P1-D: Renderizar tipos de parágrafo | Tasks | Pending |
| EPUB-08 | P1-D: Paginação por capítulo | Tasks | Pending |
