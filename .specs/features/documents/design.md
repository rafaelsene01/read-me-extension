# Documents — Design

**Spec**: `.specs/features/documents/spec.md`

## Decisão central

A página Documentos é **outra vista do mesmo buffer** do painel. Abrir um documento
grava um `Block` em `local:blocks`; tudo o que já lê desse buffer funciona sem mudança:

| Pedido | Resolvido por (existente) |
| ------ | ------------------------- |
| Conteúdo no centro, clique foca a leitura | `components/BlockList.tsx` (`seek` no clique, destaque, auto-scroll) |
| Traduzir mantendo a estrutura | `components/TranslatePanel.tsx` + aba Tradução do `BlockList` (`segmentBlock` sobre a tradução) |
| Voz, play/pause, velocidade no rodapé | `components/Controls.tsx` |
| Parar fala quando o buffer muda | `engine.blocksChanged()` em `entrypoints/background.ts` |
| Limite de tamanho | `MAX_BUFFER_CHARS` em `lib/storage.ts` |
| Texto da aba ativa | `viewOf()` em `lib/engine.ts` |
| Voz neural por idioma | `pickLocalVoice()` em `lib/tts/registry.ts` |
| Síntese neural em worker | `entrypoints/offscreen/tts-worker.ts` + `lib/tts/worker-protocol.ts` |

Nenhuma mudança no engine, no background, no offscreen, no `BlockList`, no
`TranslatePanel` nem no `Controls`.

## Componentes novos

```
entrypoints/documents/          página da extensão (/documents.html)
  index.html, main.tsx
  App.tsx                       Tabs Arquivo | Biblioteca; Arquivo = ações + TranslatePanel + BlockList; rodapé fixo = Controls
components/useReader.ts         hook extraído de sidepanel/App.tsx: state do engine + blocks + prefs
components/useReplaceGuard.tsx  gate único "abrir documento": diálogo Cancelar / Substituir / Salvar e substituir
components/DocumentActions.tsx  Novo (input file oculto), Salvar, MP3, Limpar
components/LibraryList.tsx      lista de local:documents; clique abre via gate
components/Mp3Button.tsx        dispara exportação, progresso, download
lib/markdown.ts                 stripMarkdown(md): string
lib/document.ts                 fileToBlock(name, raw, lang) → Block | erro; LibraryDocument; toLibraryDocument(blocks)
lib/storage.ts (+)              getDocuments(), saveDocument(doc): SetResult
lib/audio/mp3.ts                createMp3Encoder(sampleRate): { encode(pcm), finish(): Blob }
lib/tts/export.ts               exportAudio(host, engine, jobs, onProgress, encoder) dirigindo o protocolo do worker
```

## Fluxos

**Importar**: `<input type="file" accept=".txt,.md">` → `file.text()` →
`fileToBlock(file.name, text, navigator.language)` → erro vira Alert; sucesso vai para
`guard.open([block])` → se `getBlocks()` não vazio, diálogo → `setBlocks([block])`.

**Salvar**: `saveDocument(toLibraryDocument(blocks))` — upsert por `id` (= `blocks[0].id`).

**Biblioteca → abrir**: `guard.open(doc.blocks)` → `onOpened()` troca a aba para Arquivo.

**MP3** (página, sem passar pelo offscreen):

```
Mp3Button ── new Worker(tts-worker?worker&url) ──► createTtsHost (mesmo código do offscreen)
   │  exportAudio: post {load engine} → espera status 'ready' (ou 'error' → rejeita)
   │  para cada parágrafo de viewOf(blocks, activeTab):
   │     post {synthesize, requestId novo, text, {lang, rate, voiceId}}
   │     'audio' → encoder.encode(pcm)   (codifica em streaming, sem acumular PCM)
   │     'audio-end' → onProgress(i+1 / total) → próximo
   │     'error' → rejeita
   └─ finish() → Blob mp3 → <a download="<nome>.mp3"> → worker.terminate() (sempre, em finally e no unmount)
```

Em `wxt dev` o Chrome recusa o worker servido pelo Vite: no mesmo padrão de
`entrypoints/offscreen/main.ts`, só em `import.meta.env.DEV`, o host roda na própria página
via `import('lib/tts/local/host')`.

O cache de modelos (Cache Storage) é da origem da extensão: um modelo já baixado pelo
offscreen não é baixado de novo. Enquanto exporta existe uma segunda cópia do modelo em
memória; o `terminate()` a libera.

## Modelo de dados

```ts
// lib/document.ts
export interface LibraryDocument {
  id: string;        // blocks[0].id
  name: string;      // blocks[0].sourceTitle
  blocks: Block[];   // inclui translation, se houver
  savedAt: number;
}
```

`local:documents` = `LibraryDocument[]`, via `storage.defineItem` como os demais itens.

## Riscos

- `@breezystack/lamejs` é dependência nova (~470 KB, JS puro). Carregada só pela página Documentos.
- Documentos longos geram MP3 longo: 64 kbps mono ≈ 0,5 MB/min; o PCM nunca é acumulado.
- `stripMarkdown` é regex, não parser: Markdown aninhado ou HTML embutido pode sobrar em fala. Aceito (council).
