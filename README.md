# ReadMe

Extensão de navegador que captura o texto que você escolhe em qualquer página,
lê em voz alta com destaque acompanhando a leitura e traduz sob demanda. Sem
servidor, sem chave de API e sem enviar o texto para fora da máquina: a fala
vem das vozes do sistema ou de uma voz neural que roda dentro da extensão.

## Requisitos

- Chrome, Edge ou Brave baseados em Chromium, versão 114 ou superior (side panel).
- Chrome 138 ou superior para a tradução (Translator API on-device).
- Pelo menos uma voz **local** instalada no sistema operacional, ou uma das
  vozes neurais (baixadas no primeiro uso).

## Instalação em modo desenvolvedor

```bash
pnpm install
pnpm zip          # gera .output/readme-<versão>-chrome.zip
```

1. Descompacte o `.zip` gerado em `.output/`.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e aponte para a pasta descompactada.
4. Clique no ícone da extensão: o painel lateral abre.

Para desenvolver com recarga automática, use `pnpm dev`.

## Uso

1. Abra a página que quer ouvir e clique no ícone da extensão.
2. **Capturar seleção** envia o texto selecionado para o buffer; **Modo picker**
   contorna o elemento sob o ponteiro e captura no clique (`Escape` cancela).
3. Capturas de páginas diferentes se acumulam no mesmo buffer. Cada bloco mostra
   a URL de origem e pode ser removido ou editado.
4. **Ler** começa da frase destacada. Clicar em qualquer frase reposiciona a
   leitura. A fala continua com o painel fechado.
5. **Motor de voz** escolhe entre **Voz do sistema** (`chrome.tts`), **Kokoro
   82M** e **Supertonic 3**. Ao escolher uma voz neural ainda não baixada, o
   painel mostra **Baixar modelo** com o tamanho; o botão Ler fica bloqueado até
   o download (com barra de progresso) terminar. Depois funciona offline.
   Na lista de vozes, a estrela de cada item marca a voz como favorita, e as
   favoritas ficam no topo. As vozes neurais têm avatar de personagem e nome
   próprio (os estilos F1–F5/M1–M5 do Supertonic não têm nome oficial).
   Mexer na **velocidade** vale na hora: nas vozes neurais o áudio acelera sem
   mudar o tom; na Voz do sistema a frase atual recomeça ao soltar o controle
   (o `chrome.tts` não muda a velocidade no meio de uma fala). O rótulo WebGPU/WASM mostra
   onde a inferência roda; a lixeira remove o modelo baixado.
6. **Traduzir** traduz todos os blocos para o idioma escolhido. A aba Tradução
   mostra o texto traduzido e a leitura passa a usar uma voz desse idioma.

## Permissões

| Permissão | Para quê |
| --------- | -------- |
| `storage` | Guardar o buffer, as preferências e o cursor de leitura |
| `tts` | Falar o texto pelo motor de voz do sistema |
| `sidePanel` | Abrir o painel lateral no clique do ícone |
| `scripting` | Injetar o extrator de texto na aba, sob demanda |
| `activeTab` | Acessar a aba atual quando a captura começa pelo ícone |
| `contextMenus` | Item "Enviar para ReadMe" no menu de contexto da seleção |
| `offscreen` | Documento oculto que toca o áudio e hospeda o worker das vozes neurais |
| `unlimitedStorage` | Guardar os modelos neurais (centenas de MB) no cache da extensão |

A CSP das páginas da extensão é declarada explicitamente com `'wasm-unsafe-eval'`
(nunca `'unsafe-eval'`): sem ela o worker de inferência roda sob `script-src
'self'` e o Chrome recusa compilar o WebAssembly do ONNX Runtime e do espeak-ng.
| `<all_urls>` (opcional) | Pedido no primeiro **Capturar** feito de dentro do painel; o `activeTab` não cobre esse caso |

A permissão de host é **opcional**: a extensão instala sem aviso amplo e só pede
acesso ao site quando você captura pelo painel. Negar mantém o buffer intacto.

## Vozes neurais locais

O texto é sintetizado dentro da extensão: nada vai para um serviço de TTS. Só
os **arquivos do modelo** são baixados, uma vez, do Hugging Face, sempre de um
commit fixo; nenhum JavaScript remoto é executado (ONNX Runtime, transformers.js
e espeak-ng vão empacotados). Os arquivos ficam no Cache API da extensão.

```
Side panel ─► service worker (lib/engine.ts: cursor, frases, tradução)
                 │  protocolo local-tts com requestId (lib/tts/protocol.ts)
                 ▼
             offscreen document (AudioContext, fila de PCM)
                 │  mensagens do worker (lib/tts/worker-protocol.ts)
                 ▼
             worker dedicado (inferência: WebGPU, ou WASM como fallback)
```

| Motor | Modelo (revisão fixa) | Licença | Download | Idiomas / vozes |
| ----- | --------------------- | ------- | -------- | --------------- |
| Kokoro 82M | [`onnx-community/Kokoro-82M-v1.0-ONNX`](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) @ `1939ad2a8e416c0acfeecc08a694d14ef25f2231` | Apache-2.0 | 330 MB (fp32, WebGPU) ou 92 MB (q8, WASM) | pt-BR, en-US, en-GB, es, fr, it, hi · 17 vozes |
| Supertonic 3 | [`Supertone/supertonic-3`](https://huggingface.co/Supertone/supertonic-3) @ `3cadd1ee6394adea1bd021217a0e650ede09a323` | OpenRAIL-M | 400 MB | 31 idiomas · estilos F1–F5, M1–M5 |

SHA-256 dos grafos ONNX (LFS) e demais detalhes ficam em `lib/tts/registry.ts`.
O repositório GitHub do Supertonic foi arquivado em setembro de 2026; o texto do
front-end foi portado de `supertone-oss-archive/supertonic@1e9799e` (`web/helper.js`).
O uso do Supertonic segue as restrições da licença OpenRAIL-M do modelo.

**Avatares.** `public/avatars/*.svg` foram gerados uma vez com DiceBear, estilo
Avataaars de Pablo Stanley (livre para uso pessoal e comercial; ver
`public/avatars/LICENSE.txt`). São arquivos estáticos: nada é baixado em tempo
de execução.

**Fonemização do Kokoro.** O Kokoro recebe fonemas, não texto. O `kokoro-js`
1.2.1 só fonemiza inglês, então a extensão usa o `espeak-ng` compilado para
WebAssembly (pacote npm `espeak-ng`, **GPL-3.0-or-later**, +18 MB) com o mesmo
pós-processamento do pipeline oficial (`misaki` `EspeakG2P`). O Supertonic lê o
texto direto e não usa o espeak.

**Comportamento.** Só o motor escolhido é carregado, e só quando você pede o download ou lê.
Trocar de motor para e cancela a síntese e o áudio em curso; voltar para a Voz
do sistema libera o modelo da memória, e o documento offscreen se fecha após 5
minutos ocioso. WebGPU cai para WASM automaticamente no mesmo motor; um motor
nunca troca sozinho por outro — em caso de erro o painel oferece voltar para a
Voz do sistema. Métricas de latência (`loadMs`, `firstAudioMs`,
`realTimeFactor`) saem só no console do documento offscreen.

**Teste manual (smoke).** Para cada motor: capturar um texto pt-BR e um en-US,
ler, pausar, retomar, parar, clicar em outra frase (seek), fechar e reabrir o
painel; depois repetir offline com o modelo já baixado.

## Limitações conhecidas

- **Vozes neurais: sem pausa no meio da frase.** Pausar interrompe o áudio e
  retomar relê a frase atual, como na voz do sistema.
- **WASM em uma thread.** A extensão não é `crossOriginIsolated`, então o
  fallback WASM roda sem multithreading; em máquinas sem WebGPU a primeira
  frase demora mais.
- **Kokoro sem japonês e chinês.** Esses idiomas exigem o G2P próprio do
  pipeline oficial (misaki); os demais usam espeak-ng. A lista mostra todas as
  vozes, as do idioma do texto primeiro; escolher uma voz de outro idioma lê o
  texto com a pronúncia daquele idioma.

- **Só vozes locais.** As vozes padrão do Chrome com `remote: true` sintetizam
  nos servidores do Google e enviariam o texto para fora, então não aparecem na
  lista. Sem nenhuma voz local instalada, a reprodução fica desabilitada. Instale
  vozes pelo sistema operacional (Windows: Configurações › Hora e idioma › Fala;
  Linux: pacotes `espeak-ng`, `speech-dispatcher`).
- **Tradução exige Chrome 138+.** Em navegadores sem a Translator API o botão
  aparece desabilitado com o motivo. O primeiro par de idiomas baixa um pacote
  on-device de dezenas de MB, com barra de progresso.
- **Sem Firefox.** O caminho de áudio do Firefox é diferente e não há Translator
  API; fica para depois.
- **Destaque por frase, não por palavra.** O `charIndex` do `chrome.tts` só chega
  de vozes locais e de forma irregular por sistema operacional.
- **Páginas internas do navegador** (`chrome://`, Web Store) e PDFs abertos no
  visualizador nativo não são capturáveis.
- **Shadow DOM fechado e iframes cross-origin** são inacessíveis pelo picker; a
  seleção nativa continua funcionando no resto da página.

## Desenvolvimento

```bash
pnpm dev        # extensão em modo desenvolvimento
pnpm compile    # checagem de tipos
pnpm test       # testes unitários de lib/
pnpm build      # build de produção em .output/
pnpm zip        # pacote instalável em .output/
```

A lógica testável vive em `lib/`; os entrypoints e os componentes React são
fiação e são verificados manualmente.
