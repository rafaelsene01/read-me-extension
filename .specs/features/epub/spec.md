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
- [ ] Exibir títulos, citações e itens de lista com estilo próprio, mantendo clique-para-focar, destaque e MP3.
- [ ] Livro é só leitura: sem edição e sem tradução gravada.
- [ ] Ouvir o livro traduzido em tempo real: cada frase é traduzida na hora de ser falada, a tela segue no original.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Scripts, formulários interativos e links navegáveis do livro | Conteúdo não confiável; a página Documentos não executa nem navega pelo HTML do livro. |
| Carregar recursos remotos (`http(s)://`) do CSS ou do HTML do livro | Vazaria leitura para fora e quebraria a premissa on-device. |
| Sumário clicável (links internos do livro) | Não pedido; anterior/próximo cobrem a navegação. |
| Negrito/itálico dentro da frase | As frases são texto puro (`Sentence.text`); inline exigiria mudar o modelo de frase, o engine e a tradução. |
| Paginação por tela (estilo Kindle) | Council unânime: recalcular páginas a cada zoom/resize quebra auto-scroll e destaque; um capítulo por página reusa tudo. |
| Sumário (TOC/nav) navegável | Não pedido; anterior/próximo e o indicador "N / total" cobrem a navegação. |
| EPUB com DRM | Conteúdo cifrado não é legível sem a chave do distribuidor. |
| Editar texto de capítulo EPUB | Pedido do usuário: livro não é editável. |
| Tradução gravada ou exibida de capítulo EPUB | Pedido do usuário: livro não é traduzido; só o áudio sai traduzido, em tempo real. |
| MP3 traduzido de livro | O MP3 continua exportando o original do livro; a tradução em tempo real vive só na leitura. |
| Posição de leitura por livro | Não pedido; o cursor continua global, como hoje. |
| PDF, DOC/DOCX | Planejados à parte. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Modelo de renderização | Um spine item (capítulo) vira um `Block` com o texto por frases (engine, seek, tradução ao vivo, MP3); na página Documentos o capítulo é exibido com o HTML original do livro, o CSS do livro e as imagens, num Shadow DOM, com cada frase envolvida em `<span>` para clique e destaque. `Block.kinds` segue como marca de livro e como formatação no painel lateral | Pedido do usuário (opção 2), revendo o council Q1: o `kinds` sozinho não formata livros convertidos (tudo `p.calibre1`, código em imagem) | y |
| Onde fica o arquivo do livro | Bytes do `.epub` no Cache Storage da extensão, chave = id do livro; cada bloco guarda `epub: { book, path }` | O HTML, o CSS e as imagens são relidos do zip só para o capítulo exibido; não pesam em `storage.local`, que o engine lê a cada frase | y |
| Livros importados antes desta mudança | Sem `epub` no bloco nem bytes guardados: exibidos com `kinds` como antes; reimportar para ver o original | Sem migração para dados de teste | y |
| Tema escuro | O capítulo é exibido numa "folha" clara (tokens `--paper`/`--paper-foreground`, claros nos dois temas) | CSS de livro costuma fixar texto preto; sobre fundo escuro ficaria ilegível | n |
| Destaque e clique dentro do HTML do livro | Estilos das frases dentro do Shadow DOM usam os tokens do tema via `var(--highlight)`/`var(--muted)` | Tailwind não atravessa Shadow DOM; variáveis CSS atravessam | y |
| Frase não localizada no HTML | Fica sem `<span>` (sem clique nem destaque); se o número de parágrafos não bate, o capítulo é exibido sem spans | Nunca quebrar a exibição do livro por causa do mapeamento | n |
| O que é uma "página" | Um capítulo (bloco) por vez, com anterior/próximo e "N / total"; capítulos longos rolam | Council unânime (Q5): paginação por tela é um motor de layout à parte | n |
| Onde vale a paginação | Só quando o buffer tem algum bloco de livro (`kinds` presente); `.txt`, `.md` e capturas continuam empilhados | Council 3 de 4 (Q6): evita "1 / 1" morto em documentos comuns; dissent (Architect): paginar tudo | n |
| Buffer misto (livro + captura) | Paginação vale para o buffer inteiro; a captura vira mais uma página | Critic (Q6): o flag por bloco não pode deixar parte paginada e parte empilhada | n |
| Importar = salvar e abrir | Salva na biblioteca sempre; depois abre pelo `useReplaceGuard` (diálogo quando o buffer não está vazio; Cancelar mantém o livro salvo) | Council 3 de 4 (Q3); dissent (Skeptic): só salvar | n |
| Limite de 500.000 caracteres | Não se aplica a EPUB | Council unânime (Q4): romances passam de 500k; `unlimitedStorage` já existe e `setBlocks` não aplica o limite | n |
| Descompactação | `fflate` (`unzipSync` com filtro de entradas) | Council unânime (Q2): parser zip à mão erra em data descriptors, zip64 e nomes | n |
| Parse de XML/XHTML | `DOMParser`; XHTML inválido cai para `text/html` | Plataforma nativa; EPUBs reais costumam violar XHTML | n |
| Testes do parser | `jsdom` como devDependency, só em `lib/epub.test.ts` (`// @vitest-environment jsdom`) | Vitest roda em Node sem `DOMParser`; AD-011 cobre só `lib/` | n |
| Capa | Item do manifest com `properties` contendo `cover-image` (EPUB 3), senão `<meta name="cover">` (EPUB 2), senão sem capa; guardada como data URL em `LibraryDocument.cover`, sem redimensionar | Os dois formatos cobrem os EPUBs comuns; `unlimitedStorage` absorve o tamanho | n |
| Salvar de novo um livro aberto | `saveDocument` mantém a capa existente quando o documento novo não traz capa | Salvar e "Salvar e substituir" recriam o documento a partir dos blocos, sem capa | n |
| Título e idioma | `dc:title` (senão nome do arquivo sem `.epub`); `dc:language` (senão `navigator.language`) | Metadados do próprio livro; o select de idioma por bloco continua corrigindo | n |
| Rótulo do capítulo | `sourceUrl` = texto do primeiro título (`h1`..`h3`) do capítulo, senão "Capítulo N" | O cabeçalho do card já mostra `sourceUrl`; evita parsear o TOC | n |
| Itens do spine | `linear="no"` e capítulos sem texto são pulados | Capa, página em branco e notas fora do fluxo não viram página vazia | n |
| DRM | Recusado quando `META-INF/encryption.xml` cifra algum item do spine; ofuscação só de fontes é aceita | Fontes ofuscadas são comuns em EPUB sem DRM | n |
| Página ao abrir e ao ler | Abre na primeira página; quando o cursor muda de bloco, a página passa a ser a do cursor; anterior/próximo só troca a página exibida, sem mexer no áudio | Página e áudio só se reencontram quando a leitura avança de capítulo | n |
| Edição de um capítulo | Botão Editar oculto em blocos com `kinds`; remover capítulo e trocar idioma continuam | Pedido do usuário: EPUB não é editável | y |
| Tradução de um capítulo | Nunca gravada: `TranslatePanel` ignora blocos com `kinds` ao traduzir; `BlockList` mostra o original desses blocos mesmo na aba de tradução | Pedido do usuário: EPUB não é traduzido | y |
| Alinhamento de `kinds` | Sem checagem: `kinds[i]` é o tipo do parágrafo `i` | Sem edição e sem tradução gravada, só `applyLang` re-segmenta, e ele mantém as mesmas linhas | n |
| Leitura traduzida de livro | Liga com a mesma preferência `activeTab = 'translation'`; no livro a aba se chama "Ouvir traduzido" | Pedido do usuário; reusa a escolha de voz por idioma do `Controls` e a regra do engine | y |
| Granularidade da tradução em tempo real | Uma frase por vez, traduzida logo antes de ser falada, com a próxima frase pedida adiantada e cache em memória; tela no original com a frase original destacada | Council 3 de 4 (Q7): cursor e destaque continuam 1:1; nada gravado; dissent (Pragmatist): por parágrafo, exibindo a tradução | n |
| Onde roda o tradutor | Documento offscreen, atrás do canal de mensagem `translate`; spike prova a API lá antes de tudo; se falhar, o mesmo listener vai para a página Documentos | Council 3 de 4 (Q8): a Translator API não existe em workers (nem no service worker); a leitura segue com a página fechada; dissent (Skeptic): começar pela página | n |
| Download do pacote de idioma | Feito no clique em "Ouvir traduzido" ou na troca do idioma de destino, na página, com a barra de progresso existente | `Translator.create()` só exige gesto quando o pacote ainda precisa baixar; o offscreen não tem gesto | n |
| Falha na tradução em tempo real | A leitura para com "Falha na tradução: <motivo>" e o cursor fica na frase | Falar o original em silêncio esconderia o problema | n |

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
7. The clique numa frase, o destaque da frase lida e a exportação MP3 SHALL continuar funcionando nas páginas do livro.
8. WHERE o bloco tem `kinds` o sistema SHALL ocultar o botão Editar desse bloco.
9. WHERE o bloco tem `kinds` o sistema SHALL exibir o texto original desse bloco, mesmo com a aba Tradução ativa.
10. WHILE todos os blocos do buffer têm `kinds` o sistema SHALL exibir, no painel lateral e na página Documentos, as abas "Original" e "Ouvir traduzido" e o idioma de destino, sem o botão Traduzir.
11. WHEN o usuário aciona Traduzir num buffer que mistura capítulos de livro e outros blocos THEN o sistema SHALL traduzir só os blocos sem `kinds`.

**Independent Test**: Abrir um livro, dar play, ver a página avançar sozinha no fim do capítulo; clicar Próximo sem o áudio mudar; ver o título do capítulo maior que o texto.

---

### P2-A: Ouvir o livro traduzido em tempo real

**User Story**: Como leitor, quero ouvir o livro no meu idioma enquanto leio o original na tela, sem traduzir o livro inteiro antes.

**Why P2**: Pedido explícito, mas a leitura no idioma original funciona sem ela.

**Acceptance Criteria**:

1. WHILE a aba "Ouvir traduzido" está ativa, WHEN o engine vai falar uma frase de um bloco com `kinds` THEN o sistema SHALL traduzi-la do `lang` do bloco para o idioma de destino e falar o texto traduzido com a voz do idioma de destino.
2. WHILE a aba "Original" está ativa o sistema SHALL falar as frases de blocos com `kinds` no idioma original, sem traduzir.
3. The tela SHALL continuar exibindo o original, com a frase original correspondente destacada enquanto sua tradução é falada.
4. WHEN o engine começa a falar uma frase traduzida THEN o sistema SHALL pedir adiantado a tradução da frase seguinte.
5. WHEN uma frase já traduzida para o mesmo par de idiomas é pedida de novo THEN o sistema SHALL devolvê-la do cache em memória, sem chamar o tradutor.
6. IF o usuário pausa, para ou move a leitura enquanto uma tradução está em andamento THEN o sistema SHALL descartar essa tradução sem falá-la.
7. IF a tradução de uma frase falha THEN o sistema SHALL parar a leitura, exibir "Falha na tradução: <motivo>" e manter o cursor nessa frase.
8. WHEN o usuário escolhe "Ouvir traduzido" ou troca o idioma de destino com ela ativa THEN o sistema SHALL, no mesmo clique, preparar o par de idiomas do livro, baixando o pacote com a barra de progresso quando necessário.
9. The tradução em tempo real SHALL funcionar com a página Documentos e o painel lateral fechados.
10. The tradução em tempo real SHALL nunca gravar tradução no bloco nem na biblioteca.

**Independent Test**: Abrir um livro em inglês, escolher "Ouvir traduzido" com destino Português, dar play e ouvir em português com a frase em inglês destacada; fechar a página e ouvir a leitura continuar traduzida.

---

### P1-E: Exibir o capítulo com o HTML e o CSS do livro ⭐ MVP

**User Story**: Como leitor, quero ver o capítulo como o livro foi diagramado (estilos, fontes, imagens), sem perder o clique-para-focar e o destaque da leitura.

**Why P1**: Pedido explícito do usuário depois de testar livros reais.

**Acceptance Criteria**:

1. WHEN um `.epub` é importado THEN o sistema SHALL guardar os bytes do arquivo no Cache Storage da extensão com a chave do id do livro e gravar `epub: { book, path }` em cada bloco de capítulo, com `path` igual ao caminho do capítulo no zip.
2. WHILE a página Documentos exibe um bloco com `epub` cujo livro está no Cache Storage o sistema SHALL renderizar o HTML do capítulo num Shadow DOM, com os `<style>` do capítulo e as folhas `<link rel="stylesheet">` lidas do próprio zip.
3. The renderização SHALL resolver `src` de imagens e `url(...)` do CSS (imagens e fontes) para arquivos do próprio zip, relativos ao capítulo ou à folha de estilo.
4. The renderização SHALL remover `script`, `iframe`, `object`, `embed`, atributos `on*`, URLs `javascript:`, `@import` e toda URL `http(s)://` do HTML e do CSS.
5. The renderização SHALL aplicar a seletores `html` e `body` do CSS do livro o contêiner do capítulo, sem afetar a página Documentos.
6. The renderização SHALL envolver cada frase de `block.paragraphs` em elementos com a posição `paraIndex:sentIndex`, casando os parágrafos, em ordem, com os mesmos elementos folha da extração (P1-B AC3).
7. WHEN o usuário clica numa frase do capítulo renderizado THEN o sistema SHALL mover a leitura para essa frase (comando `seek`).
8. WHILE uma frase do capítulo renderizado está sendo lida o sistema SHALL destacá-la com o token `--highlight` e rolá-la para a vista.
9. WHEN o usuário clica num link do capítulo THEN o sistema SHALL impedir a navegação da página; links `http(s)://` SHALL abrir numa nova aba.
10. IF o livro não está no Cache Storage ou o bloco não tem `epub` THEN o sistema SHALL exibir o capítulo como na P1-D (parágrafos com `kinds`).
11. IF os parágrafos do HTML não casam com `block.paragraphs` THEN o sistema SHALL exibir o HTML do capítulo sem spans de frase.
12. The painel lateral SHALL continuar exibindo livros com `kinds`, sem o HTML do livro.

**Independent Test**: Importar o "Refactoring" (convertido de PDF) e ver as imagens de código e o itálico do livro; importar o "TDD by Example" e ver títulos e listas com o CSS do livro; clicar numa frase e ouvir a leitura seguir dali com o destaque.

---

### P2-B: Excluir da biblioteca

**User Story**: Como leitor, quero excluir um documento da biblioteca, para tirar do caminho o que já li ou importei errado.

**Why P2**: Pedido do usuário; a leitura funciona sem isso.

**Acceptance Criteria**:

1. The cada item da aba Biblioteca SHALL oferecer uma ação Excluir identificada por rótulo acessível "Excluir".
2. WHEN o usuário aciona Excluir THEN o sistema SHALL pedir confirmação num diálogo com as ações Cancelar e Excluir, nomeando o documento.
3. WHEN o usuário confirma THEN o sistema SHALL remover o item de `local:documents` e, quando o documento é um livro, também os bytes guardados no Cache Storage.
4. WHEN o usuário cancela THEN o sistema SHALL manter a biblioteca e o cache inalterados.
5. The exclusão SHALL não alterar o buffer de leitura, mesmo quando o documento excluído é o que está aberto.
6. IF a exclusão falha THEN o sistema SHALL exibir "Falha ao excluir" e manter o item na lista.

**Independent Test**: Salvar dois documentos, excluir um com a confirmação e ver só o outro na lista; reabrir a página e confirmar que ele não voltou.

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
| EPUB-01 | P1-B: Extrair capítulos com formatação | Tasks | Done |
| EPUB-02 | P1-A: Importar EPUB (erros: inválido, DRM, vazio, sem limite) | Tasks | Done |
| EPUB-03 | P1-C: Capa (extração) | Tasks | Done |
| EPUB-04 | P1-C: Capa (preservar ao salvar de novo) | Tasks | Done |
| EPUB-05 | P1-A: Importar EPUB (menu, salvar e abrir) | Tasks | Pending |
| EPUB-06 | P1-C: Capa (exibir na biblioteca) | Tasks | Done |
| EPUB-07 | P1-D: Renderizar tipos de parágrafo | Tasks | Done |
| EPUB-08 | P1-D: Paginação por capítulo | Tasks | Pending |
| EPUB-09 | P1-D: Livro sem edição nem tradução gravada | Tasks | Done |
| EPUB-10 | P2-A: Engine traduz a frase antes de falar | Tasks | Pending |
| EPUB-11 | P2-A: Tradutor no offscreen com cache | Tasks | Pending |
| EPUB-12 | P2-A: Aba "Ouvir traduzido" e download do par | Tasks | Pending |
| EPUB-13 | P1-E: Guardar bytes do livro e `epub` nos blocos | Tasks | Pending |
| EPUB-14 | P1-E: Sanitizar HTML/CSS e resolver recursos do zip | Tasks | Pending |
| EPUB-15 | P1-E: Envolver frases no HTML do livro | Tasks | Pending |
| EPUB-16 | P1-E: Exibir capítulo em Shadow DOM com clique e destaque | Tasks | Pending |
| EPUB-17 | P2-B: Excluir item da biblioteca | Tasks | Pending |
