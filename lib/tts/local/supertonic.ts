import * as ort from 'onnxruntime-web';
import { chunkSentence } from '../../segment';
import { getEngineDefinition, hfUrl, SUPERTONIC_MODEL } from '../registry';
import { normalizeLanguage } from '../types';
import { withBackendFallback } from './detect';
import { ensureCached, readCached } from './download';
import { configureOrt } from './ort-env';
import { preprocessSupertonic, supertonicIds } from './supertonic-text';
import type { LocalEngineRuntime } from './types';

interface SupertonicConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { latent_dim: number; chunk_compress_factor: number };
}

interface Sessions {
  durationPredictor: ort.InferenceSession;
  textEncoder: ort.InferenceSession;
  vectorEstimator: ort.InferenceSession;
  vocoder: ort.InferenceSession;
}

interface VoiceStyle {
  ttl: ort.Tensor;
  dp: ort.Tensor;
}

interface StyleJson {
  style_ttl: { dims: number[]; data: unknown[] };
  style_dp: { dims: number[]; data: unknown[] };
}

const url = (path: string) => hfUrl(SUPERTONIC_MODEL, path);

function gaussian(length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const u1 = Math.max(0.0001, Math.random());
    out[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
  }
  return out;
}

/**
 * Supertonic 3 on ONNX Runtime Web: duration predictor → text encoder →
 * flow-matching denoiser (totalSteps) → vocoder, as in the official web demo,
 * with typed arrays instead of nested JS arrays.
 */
export function createSupertonicRuntime(): LocalEngineRuntime {
  let cache: Cache | null = null;
  let sessions: Sessions | null = null;
  let config: SupertonicConfig | null = null;
  let indexer: number[] = [];
  const styles = new Map<string, VoiceStyle>();

  async function voiceStyle(id: string): Promise<VoiceStyle> {
    let style = styles.get(id);
    if (!style) {
      const json = JSON.parse(
        new TextDecoder().decode(await readCached(cache!, url(`voice_styles/${id}.json`))),
      ) as StyleJson;
      const tensor = (part: StyleJson['style_ttl']) =>
        new ort.Tensor('float32', Float32Array.from(part.data.flat(Infinity) as number[]), part.dims);
      style = { ttl: tensor(json.style_ttl), dp: tensor(json.style_dp) };
      styles.set(id, style);
    }
    return style;
  }

  async function createSessions(backend: 'webgpu' | 'wasm'): Promise<Sessions> {
    const create = async (path: string) =>
      ort.InferenceSession.create(new Uint8Array(await readCached(cache!, url(path))), {
        executionProviders: [backend],
      });
    return {
      durationPredictor: await create('onnx/duration_predictor.onnx'),
      textEncoder: await create('onnx/text_encoder.onnx'),
      vectorEstimator: await create('onnx/vector_estimator.onnx'),
      vocoder: await create('onnx/vocoder.onnx'),
    };
  }

  async function infer(text: string, lang: string, style: VoiceStyle, speed: number): Promise<Float32Array> {
    const { durationPredictor, textEncoder, vectorEstimator, vocoder } = sessions!;
    const { ae, ttl } = config!;
    const ids = supertonicIds(preprocessSupertonic(text, lang), indexer);
    const textIds = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]);
    const textMask = new ort.Tensor('float32', new Float32Array(ids.length).fill(1), [1, 1, ids.length]);

    const { duration } = await durationPredictor.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const seconds = (duration!.data as Float32Array)[0]! / speed;
    const { text_emb } = await textEncoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });

    const wavLength = Math.floor(seconds * ae.sample_rate);
    const chunk = ae.base_chunk_size * ttl.chunk_compress_factor;
    const latentLength = Math.ceil(wavLength / chunk);
    const latentDim = ttl.latent_dim * ttl.chunk_compress_factor;
    const shape = [1, latentDim, latentLength];
    // Batch of one: the latent mask is all ones.
    const latentMask = new ort.Tensor('float32', new Float32Array(latentLength).fill(1), [1, 1, latentLength]);
    const totalStep = new ort.Tensor('float32', [SUPERTONIC_MODEL.totalSteps], [1]);

    let latent = gaussian(latentDim * latentLength);
    for (let step = 0; step < SUPERTONIC_MODEL.totalSteps; step++) {
      const { denoised_latent } = await vectorEstimator.run({
        noisy_latent: new ort.Tensor('float32', latent, shape),
        text_emb: text_emb!,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: new ort.Tensor('float32', [step], [1]),
        total_step: totalStep,
      });
      latent = denoised_latent!.data as Float32Array;
    }

    const { wav_tts } = await vocoder.run({ latent: new ort.Tensor('float32', latent, shape) });
    return (wav_tts!.data as Float32Array).slice(0, wavLength);
  }

  return {
    engine: 'supertonic',

    async load(onProgress) {
      cache = await caches.open(SUPERTONIC_MODEL.cacheName);
      configureOrt();

      const missing: (typeof SUPERTONIC_MODEL.files)[number][] = [];
      for (const file of SUPERTONIC_MODEL.files) {
        if (!(await cache.match(url(file.path)))) missing.push(file);
      }
      const total = missing.reduce((sum, file) => sum + file.size, 0);
      let loaded = 0;
      for (const file of missing) {
        await ensureCached(cache, url(file.path), (bytes) => {
          loaded += bytes;
          onProgress(Math.min(1, loaded / total));
        });
      }
      // Voice styles are tiny: fetch them all now so any voice works offline.
      await Promise.all(
        getEngineDefinition('supertonic').voices.map((voice) =>
          ensureCached(cache!, url(`voice_styles/${voice.id}.json`), () => {}),
        ),
      );

      const decode = async (path: string) =>
        JSON.parse(new TextDecoder().decode(await readCached(cache!, url(path)))) as unknown;
      config = (await decode('onnx/tts.json')) as SupertonicConfig;
      indexer = (await decode('onnx/unicode_indexer.json')) as number[];

      const created = await withBackendFallback(createSessions);
      sessions = created.value;
      return created.backend;
    },

    async synthesize(text, options, onChunk, isCancelled) {
      if (!sessions || !config) throw new Error('Modelo não carregado');
      const lang = normalizeLanguage(options.lang);
      const style = await voiceStyle(options.voiceId ?? 'F1');
      // The demo caps Korean/Japanese chunks lower: denser scripts.
      const max = lang === 'ko' || lang === 'ja' ? 120 : SUPERTONIC_MODEL.maxChars;
      const speed = SUPERTONIC_MODEL.baseSpeed * options.rate;

      for (const piece of chunkSentence(text, max)) {
        if (isCancelled()) return;
        const pcm = await infer(piece, lang, style, speed);
        if (isCancelled()) return;
        onChunk(pcm, config.ae.sample_rate);
      }
    },

    unload() {
      if (sessions) {
        for (const session of Object.values(sessions)) void session.release();
      }
      sessions = null;
      styles.clear();
    },
  };
}
