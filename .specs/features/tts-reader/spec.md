# TTS Reader — Especificação

## Problem Statement

Ler textos longos na tela cansa, e as leituras de tela do navegador não deixam
escolher o trecho, corrigir o texto extraído nem acumular conteúdo de páginas
diferentes. Também não há forma simples de ouvir um artigo traduzido mantendo o
original ao lado. Esta extensão captura o texto que o usuário escolhe, lê em voz
alta com destaque acompanhando a leitura e traduz sob demanda, usando apenas APIs
nativas do navegador — sem servidor e sem chave de API.

## Goals

- [ ] Capturar texto de uma página por seleção ou por clique em um elemento, acumulando capturas de sites diferentes em um único buffer.
- [ ] Ler o buffer em voz alta com play/pause/stop, controle de velocidade, escolha de voz e destaque da frase em leitura com auto-scroll.
- [ ] Manter a fala ativa com o painel fechado e retomar do ponto correto após o service worker reiniciar.
- [ ] Traduzir o buffer sob demanda com a Translator API nativa, mantendo abas Original e Tradução.
- [ ] Gerar um pacote instalável para Chrome/Edge/Brave via `wxt zip`.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Firefox | Exige um segundo caminho de áudio (`speechSynthesis` em background page) e não expõe Translator API; dobra a superfície de bug do componente mais frágil. Entra depois, atrás de `lib/tts.ts`. |
| Destaque por palavra | `charIndex` só chega de vozes locais e de forma irregular por SO; vira defeito intermitente. |
| Histórico por site | Buffer único com blocos identificados pela URL de origem já cobre "ver o que veio do site anterior". |
| Vozes remotas (`remote: true`) | Sintetizam no servidor do Google e enviam o texto para fora; quebram a premissa on-device. |
| Shadow DOM fechado e iframes cross-origin no picker | Inacessíveis por content script; falham de forma explícita. |
| LanguageDetector API | Baixa um pacote adicional para adivinhar o que `document.documentElement.lang` já declara. |
| Leitura de PDF nativo do navegador | O visualizador de PDF não aceita content script comum. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Superfície principal da UI | Side panel (`chrome.sidePanel`) | O fluxo é capturar, navegar e voltar; popup fecha ao clicar na página | y |
| Concessão de acesso ao host | `activeTab` pelo clique no ícone + `optional_host_permissions: ["<all_urls>"]` pedido no primeiro Capturar feito de dentro do painel | `activeTab` não é concedido por interação dentro do side panel, então o painel sozinho não consegue injetar script | y |
| Granularidade da fala e do destaque | Frase, via `Intl.Segmenter` | Parágrafo de 600 palavras deixaria 4 minutos sem feedback visual | y |
| Âncora do cursor de leitura | Id estável de bloco + índices dentro do bloco | Índice puramente posicional corrompe ao remover um bloco durante a fala | y |
| Comportamento ao capturar com buffer cheio | Sempre acrescenta; Limpar e remover bloco são ações separadas | Dois botões por captura empurram a mesma decisão ao usuário dezenas de vezes | y |
| Edição do texto | `contenteditable="plaintext-only"` não controlado, habilitado apenas com a leitura pausada | Componente controlado durante a fala destrói caret e undo a cada re-render | y |
| Idioma de origem | `document.documentElement.lang` da página capturada, com `navigator.language` como fallback e select editável | A página declara o idioma de graça; nenhum download de modelo | y |
| Escolha de voz | Amarrada ao idioma da aba ativa (Original/Tradução); seleção manual sobrepõe e é lembrada por idioma | Ler português com voz inglesa é o defeito nº 1 do gênero | y |
| Tradução indisponível | Botão visível e desabilitado com o motivo | Esconder o botão gera a pergunta "por que sumiu?" | y |
| Persistência | `storage.local` (buffer, preferências, cursor) | Sobrevive ao fechamento do painel e ao restart do service worker | y |
| Teste de componentes React | Não há; a lógica testável vive em `lib/` e as telas são verificadas manualmente | Montar runner de DOM para componentes de painel custa mais do que entrega nesta v1 | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Capturar texto da página ⭐ MVP

**User Story**: Como leitor, quero enviar para a extensão o texto que eu escolher em qualquer página, para montar o que vou ouvir.

**Why P1**: Sem captura não existe produto.

**Acceptance Criteria**:

1. WHEN o usuário aciona Capturar com uma seleção de texto ativa na aba THEN o sistema SHALL acrescentar ao buffer um bloco contendo o texto selecionado, a URL da aba e o idioma declarado pela página.
2. WHEN o usuário ativa o modo picker THEN o sistema SHALL desenhar um contorno no elemento sob o ponteiro e, ao clique, acrescentar ao buffer um bloco com o `innerText` desse elemento.
3. WHILE o modo picker está ativo o sistema SHALL encerrar o modo sem capturar nada ao receber a tecla `Escape`.
4. WHEN uma captura é acrescentada THEN o sistema SHALL preservar os blocos já existentes no buffer e posicionar o novo bloco ao final.
5. WHEN o usuário aciona remover em um bloco THEN o sistema SHALL excluir apenas aquele bloco e manter os demais.
6. WHEN o usuário aciona Limpar THEN o sistema SHALL esvaziar o buffer e parar qualquer leitura em andamento.
7. IF o usuário aciona Capturar pelo painel e a extensão não tem acesso ao host da aba ativa THEN o sistema SHALL chamar `permissions.request({origins:[host]})` nesse mesmo clique e prosseguir com a captura apenas se concedida.
8. IF a permissão de host é negada THEN o sistema SHALL exibir "Sem acesso a este site" e não alterar o buffer.
9. IF o texto capturado está vazio após remover espaços THEN o sistema SHALL descartar a captura e exibir "Nada para capturar".
10. IF o buffer atingiu 500.000 caracteres THEN o sistema SHALL recusar a captura e exibir "Buffer cheio — limpe ou remova blocos".
11. The system SHALL identificar cada bloco por um id único que não muda enquanto o bloco existir.

**Independent Test**: Selecionar um parágrafo em um artigo, clicar em Capturar e ver o bloco listado no painel com a URL de origem; capturar outro elemento em outro site e ver os dois blocos.

---

### P1: Ouvir o texto com destaque ⭐ MVP

**User Story**: Como leitor, quero ouvir o buffer em voz alta acompanhando visualmente a frase lida, para seguir o texto sem ler.

**Why P1**: É a função central da extensão.

**Acceptance Criteria**:

1. The system SHALL dividir cada bloco em parágrafos por quebra de linha e cada parágrafo em frases com `Intl.Segmenter` no idioma do bloco.
2. WHEN o usuário aciona play THEN o sistema SHALL enfileirar as frases a partir do cursor atual e falar uma frase por chamada de `chrome.tts.speak`.
3. WHEN uma frase termina THEN o sistema SHALL avançar o cursor para a próxima frase e persistir o cursor em `storage.local` antes de falar a seguinte.
4. WHILE a leitura está ativa o sistema SHALL destacar no painel a frase correspondente ao cursor e trazê-la para a área visível com `scrollIntoView({block:'center'})`.
5. WHEN o usuário aciona pause THEN o sistema SHALL interromper a fala e manter o cursor na frase atual.
6. WHEN o usuário aciona play após um pause THEN o sistema SHALL retomar a partir da frase apontada pelo cursor.
7. WHEN o usuário aciona stop THEN o sistema SHALL interromper a fala e mover o cursor para a primeira frase do buffer.
8. WHEN o usuário clica em uma frase do painel THEN o sistema SHALL mover o cursor para essa frase e, se estava lendo, continuar a partir dela.
9. WHEN o painel é fechado durante a leitura THEN o sistema SHALL continuar falando até o fim do buffer.
10. WHEN o painel é reaberto THEN o sistema SHALL refletir em até 1 segundo o estado real de reprodução e a frase corrente mantidos pelo background.
11. WHEN o usuário altera a velocidade THEN o sistema SHALL aplicar o novo valor a partir da próxima frase e persistir a preferência.
12. The system SHALL oferecer apenas vozes com `remote: false` na lista de vozes.
13. WHEN o buffer é lido até o fim THEN o sistema SHALL parar, marcar a leitura como inativa e posicionar o cursor na primeira frase.
14. IF `chrome.tts` emite um evento `error` ou `interrupted` não solicitado THEN o sistema SHALL parar a leitura, manter o cursor na frase que falhou e exibir a mensagem de erro no painel.
15. IF não existe nenhuma voz local instalada THEN o sistema SHALL desabilitar os controles de reprodução e exibir "Nenhuma voz local instalada neste sistema".
16. IF não existe voz local para o idioma do texto ativo THEN o sistema SHALL exibir "Sem voz instalada para [idioma]" e manter play desabilitado até que o usuário escolha outra voz.
17. IF um bloco é removido durante a leitura e contém o cursor THEN o sistema SHALL parar a leitura e mover o cursor para o início do bloco seguinte.

**Independent Test**: Com dois blocos capturados, dar play, fechar o painel, reabrir após 40 segundos e ver o destaque na frase que está tocando.

---

### P2: Traduzir mantendo o original

**User Story**: Como leitor, quero traduzir o texto capturado e alternar entre original e tradução, para ouvir e conferir nos dois idiomas.

**Why P2**: Depende de captura e leitura funcionando; agrega valor, não viabiliza o produto.

**Acceptance Criteria**:

1. WHERE a Translator API está presente no navegador o sistema SHALL habilitar o botão Traduzir.
2. WHEN o usuário aciona Traduzir THEN o sistema SHALL chamar `Translator.create` dentro da mesma tarefa do clique, sem `await` anterior, para não perder o gesto do usuário.
3. WHILE o pacote de idiomas está baixando o sistema SHALL exibir o progresso relatado pelo `monitor` de `downloadprogress`.
4. WHEN a tradução de um bloco termina THEN o sistema SHALL armazená-la junto do bloco em `storage.local` e não retraduzi-lo enquanto ele não for editado.
5. WHEN o usuário alterna entre as abas Original e Tradução THEN o sistema SHALL exibir o texto já armazenado, sem nova chamada à Translator API.
6. The system SHALL usar como idioma de origem o valor de `document.documentElement.lang` do bloco, caindo para `navigator.language` quando a página não declara idioma, e SHALL permitir sobrescrevê-lo em um select.
7. WHEN o usuário escolhe um idioma de destino THEN o sistema SHALL persistir a escolha e reutilizá-la nas próximas traduções.
8. WHEN a aba ativa muda entre Original e Tradução THEN o sistema SHALL selecionar a voz local do idioma dessa aba, salvo se houver escolha manual de voz para esse idioma.
9. IF a Translator API não existe no navegador THEN o sistema SHALL exibir o botão Traduzir desabilitado com o texto "Tradução não suportada neste navegador".
10. IF `Translator.availability` retorna `unavailable` para o par escolhido THEN o sistema SHALL exibir "Par de idiomas não disponível" e manter o botão desabilitado.
11. IF a criação do tradutor ou a tradução falha THEN o sistema SHALL manter o texto original intacto e exibir a mensagem de erro no painel.

**Independent Test**: Capturar um artigo em inglês, escolher destino português, traduzir, alternar as abas e confirmar que a segunda alternância não dispara novo download.

---

### P2: Ajustar o texto capturado

**User Story**: Como leitor, quero corrigir o texto extraído antes de ouvir, para tirar menu, rodapé e lixo da página.

**Why P2**: A leitura funciona sem edição; a edição melhora o resultado.

**Acceptance Criteria**:

1. WHILE a leitura está ativa o sistema SHALL manter a área de texto somente leitura e o botão Editar desabilitado.
2. WHEN o usuário aciona Editar com a leitura parada ou pausada THEN o sistema SHALL tornar o bloco editável como `contenteditable="plaintext-only"`.
3. WHEN a edição de um bloco termina THEN o sistema SHALL re-segmentar o bloco em parágrafos e frases e persistir o novo conteúdo.
4. WHEN um bloco editado possuía tradução THEN o sistema SHALL marcar essa tradução como desatualizada e exibir "Tradução desatualizada" na aba Tradução.
5. IF a edição esvazia o bloco THEN o sistema SHALL remover o bloco do buffer.

**Independent Test**: Capturar um trecho com menu junto, apagar as linhas do menu, ver a contagem de frases mudar e a tradução anterior marcada como desatualizada.

---

## Edge Cases

- IF a aba ativa é uma página interna do navegador (`chrome://`, Web Store) THEN o sistema SHALL exibir "Não é possível capturar desta página" e não tentar injetar script.
- IF o elemento escolhido no picker está dentro de um iframe cross-origin ou shadow DOM fechado THEN o sistema SHALL exibir "Conteúdo inacessível nesta região da página".
- IF uma frase isolada excede 32.000 caracteres THEN o sistema SHALL parti-la em pedaços de no máximo 32.000 caracteres antes de enviar ao `chrome.tts`.
- IF `storage.local` retorna erro de cota ao salvar o buffer THEN o sistema SHALL manter o buffer anterior e exibir "Armazenamento cheio".
- WHEN o service worker é encerrado durante a leitura e reativado por um evento de `chrome.tts` THEN o sistema SHALL reconstruir o estado a partir de `storage.local` e continuar da frase apontada pelo cursor.
- WHEN o buffer está vazio THEN o sistema SHALL desabilitar play, Traduzir, Editar e Limpar.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TTS-01 | P1: Capturar texto da página | Tasks | Pending |
| TTS-02 | P1: Capturar texto da página | Tasks | Pending |
| TTS-03 | P1: Capturar texto da página | Tasks | Pending |
| TTS-04 | P1: Capturar texto da página | Tasks | Pending |
| TTS-05 | P1: Capturar texto da página | Tasks | Pending |
| TTS-06 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-07 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-08 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-09 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-10 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-11 | P1: Ouvir o texto com destaque | Tasks | Pending |
| TTS-12 | P2: Traduzir mantendo o original | Tasks | Pending |
| TTS-13 | P2: Traduzir mantendo o original | Tasks | Pending |
| TTS-14 | P2: Traduzir mantendo o original | Tasks | Pending |
| TTS-15 | P2: Ajustar o texto capturado | Tasks | Pending |
| TTS-16 | P1: Ouvir o texto com destaque | Tasks | Pending |

**Mapa dos IDs:**

- TTS-01 — Captura por seleção (P1-A AC1, AC9)
- TTS-02 — Captura por picker com contorno e `Escape` (P1-A AC2, AC3)
- TTS-03 — Buffer aditivo, remover bloco, limpar, id estável, limite de 500k (P1-A AC4, AC5, AC6, AC10, AC11)
- TTS-04 — Permissão de host sob demanda e recusa (P1-A AC7, AC8)
- TTS-05 — Persistência de buffer, preferências e cursor em `storage.local`
- TTS-06 — Segmentação em parágrafos e frases (P1-B AC1)
- TTS-07 — Fila de fala, play/pause/stop, avanço e persistência do cursor (P1-B AC2, AC3, AC5, AC6, AC7, AC13)
- TTS-08 — Continuidade com painel fechado e reconstrução após restart do service worker (P1-B AC9, AC10)
- TTS-09 — Vozes locais apenas, ausência de voz, ausência de voz do idioma (P1-B AC12, AC15, AC16)
- TTS-10 — Velocidade aplicada e persistida (P1-B AC11)
- TTS-11 — Destaque da frase, auto-scroll e clique para reposicionar (P1-B AC4, AC8)
- TTS-12 — Tradução sob demanda, gesto do usuário, progresso, cache e abas (P2-A AC1..AC5)
- TTS-13 — Idiomas de origem e destino e voz seguindo a aba (P2-A AC6, AC7, AC8)
- TTS-14 — Tradução indisponível e falhas de tradução (P2-A AC9, AC10, AC11)
- TTS-15 — Edição travada durante a fala, re-segmentação e tradução desatualizada (P2-B AC1..AC5)
- TTS-16 — Erros de TTS, remoção de bloco em leitura, frase acima de 32k, cota de storage (P1-B AC14, AC17 e Edge Cases)

**Coverage:** 16 total, 16 mapeados para tarefas, 0 não mapeados.

---

## Success Criteria

- [ ] Capturar de dois sites diferentes e ouvir os dois blocos em sequência sem recarregar a extensão.
- [ ] Fechar o painel durante a leitura, esperar mais de 30 segundos e reabrir com o destaque na frase correta.
- [ ] Traduzir um artigo em inglês para português e ouvir a tradução com voz portuguesa sem escolher voz manualmente.
- [ ] `wxt zip` produz um pacote que instala em Chrome limpo e executa os três itens acima.
- [ ] Todos os testes unitários de `lib/` passam com `pnpm test`.
