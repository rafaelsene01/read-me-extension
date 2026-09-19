# ReadMe

Extensão de navegador que captura o texto que você escolhe em qualquer página,
lê em voz alta com destaque acompanhando a leitura e traduz sob demanda. Tudo
com APIs nativas do navegador: sem servidor, sem chave de API e sem enviar o
texto para fora da máquina.

## Requisitos

- Chrome, Edge ou Brave baseados em Chromium, versão 114 ou superior (side panel).
- Chrome 138 ou superior para a tradução (Translator API on-device).
- Pelo menos uma voz **local** instalada no sistema operacional.

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
5. **Traduzir** traduz todos os blocos para o idioma escolhido. A aba Tradução
   mostra o texto traduzido e a leitura passa a usar uma voz desse idioma.

## Permissões

| Permissão | Para quê |
| --------- | -------- |
| `storage` | Guardar o buffer, as preferências e o cursor de leitura |
| `tts` | Falar o texto pelo motor de voz do sistema |
| `sidePanel` | Abrir o painel lateral no clique do ícone |
| `scripting` | Injetar o extrator de texto na aba, sob demanda |
| `activeTab` | Acessar a aba atual quando a captura começa pelo ícone |
| `<all_urls>` (opcional) | Pedido no primeiro **Capturar** feito de dentro do painel; o `activeTab` não cobre esse caso |

A permissão de host é **opcional**: a extensão instala sem aviso amplo e só pede
acesso ao site quando você captura pelo painel. Negar mantém o buffer intacto.

## Limitações conhecidas

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
