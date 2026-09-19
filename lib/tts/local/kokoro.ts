import {
  AutoTokenizer,
  env,
  StyleTextToSpeech2Model,
  Tensor,
  type PreTrainedTokenizer,
  type ProgressInfo,
} from '@huggingface/transformers';
import { chunkSentence } from '../../segment';
import { getEngineDefinition, hfUrl, KOKORO_MODEL } from '../registry';
import { withBackendFallback } from './detect';
import { ensureCached, readCached } from './download';
import { espeakIpa } from './espeak';
import { kokoroPhonemes } from './kokoro-g2p';
import { configureOrt } from './ort-env';
import type { LocalEngineRuntime } from './types';

const STYLE_DIM = 256;
const MAX_STYLE_ROW = 509;

/**
 * Kokoro 82M on transformers.js. kokoro-js is not used: its 1.2.1 release
 * only phonemizes English, rejects the pt voices and fetches voices from the
 * unpinned `main` branch. This runtime keeps its inference recipe (style row
 * picked by token count, 24 kHz waveform) with espeak-ng for every language.
 */
export function createKokoroRuntime(): LocalEngineRuntime {
  let model: StyleTextToSpeech2Model | null = null;
  let tokenizer: PreTrainedTokenizer | null = null;
  let cache: Cache | null = null;
  const voices = new Map<string, Float32Array>();

  async function voiceStyles(id: string): Promise<Float32Array> {
    let styles = voices.get(id);
    if (!styles) {
      styles = new Float32Array(await readCached(cache!, hfUrl(KOKORO_MODEL, `voices/${id}.bin`)));
      voices.set(id, styles);
    }
    return styles;
  }

  return {
    engine: 'kokoro',

    async load(onProgress) {
      cache = await caches.open(KOKORO_MODEL.cacheName);
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.useCustomCache = true;
      env.customCache = cache;
      configureOrt();

      // Aggregate transformers' per-file progress into one 0..1 figure.
      const files = new Map<string, { loaded: number; total: number }>();
      const progress_callback = (info: ProgressInfo) => {
        if (info.status !== 'progress') return;
        files.set(info.file, { loaded: info.loaded, total: info.total });
        let loaded = 0;
        let total = 0;
        for (const file of files.values()) {
          loaded += file.loaded;
          total += file.total;
        }
        if (total > 0) onProgress(loaded / total);
      };
      const options = { revision: KOKORO_MODEL.revision, progress_callback };

      tokenizer = await AutoTokenizer.from_pretrained(KOKORO_MODEL.modelId, options);
      const loaded = await withBackendFallback((device) =>
        StyleTextToSpeech2Model.from_pretrained(KOKORO_MODEL.modelId, {
          ...options,
          device,
          dtype: KOKORO_MODEL.dtype[device],
        }),
      );
      model = loaded.value;
      const backend = loaded.backend;
      // Voice tables are small (0.5 MB each): fetch them all now so any voice works offline.
      await Promise.all(
        getEngineDefinition('kokoro').voices.map((voice) =>
          ensureCached(cache!, hfUrl(KOKORO_MODEL, `voices/${voice.id}.bin`), () => {}),
        ),
      );
      return backend;
    },

    async synthesize(text, options, onChunk, isCancelled) {
      if (!model || !tokenizer) throw new Error('Modelo não carregado');
      const voiceId = options.voiceId;
      const espeakVoice = voiceId ? KOKORO_MODEL.espeakVoice[voiceId[0]!] : undefined;
      if (!voiceId || !espeakVoice) throw new Error('Kokoro não tem voz para este idioma');
      const styles = await voiceStyles(voiceId);

      for (const piece of chunkSentence(text, KOKORO_MODEL.maxChars)) {
        if (isCancelled()) return;
        const phonemes = await kokoroPhonemes(piece, voiceId[0]!, (lines) =>
          // Ties only for the misaki (non-English) pipeline.
          espeakIpa(lines, espeakVoice, voiceId[0] !== 'a' && voiceId[0] !== 'b'),
        );
        const { input_ids } = tokenizer(phonemes, { truncation: true });
        const row = Math.min(Math.max(input_ids.dims.at(-1)! - 2, 0), MAX_STYLE_ROW) * STYLE_DIM;
        const { waveform } = await model({
          input_ids,
          style: new Tensor('float32', styles.slice(row, row + STYLE_DIM), [1, STYLE_DIM]),
          speed: new Tensor('float32', [options.rate], [1]),
        });
        if (isCancelled()) return;
        onChunk(waveform.data as Float32Array, KOKORO_MODEL.sampleRate);
      }
    },

    unload() {
      void model?.dispose();
      model = null;
      tokenizer = null;
      voices.clear();
    },
  };
}
