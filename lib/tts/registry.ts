import type { EngineTts } from '../engine';
import type { Prefs } from '../types';
import { normalizeLanguage, type LocalEngineId, type TtsEngineId, type TtsVoice } from './types';

export const HF_HOST = 'https://huggingface.co';

/**
 * Kokoro 82M v1.0, ONNX export. Pinned to a commit so the files can never
 * change under us; the LFS SHA-256 of each graph is recorded for audits.
 * Weights: Apache-2.0 (hexgrad/Kokoro-82M).
 */
export const KOKORO_MODEL = {
  modelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  license: 'Apache-2.0',
  cacheName: 'readme-model-kokoro',
  /** q8 graph on WASM, fp32 on WebGPU. */
  downloadSize: '92–330 MB',
  sampleRate: 24_000,
  /**
   * fp32 is what kokoro-js recommends on WebGPU (fp16/q* graphs produce
   * artifacts there); q8 keeps the WASM download at 92 MB.
   * onnx/model.onnx           sha256 8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb (325.5 MB)
   * onnx/model_quantized.onnx sha256 fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478 (92.4 MB)
   */
  dtype: { webgpu: 'fp32', wasm: 'q8' },
  /** The style table has 510 rows: phoneme sequences are capped at 510 tokens. */
  maxChars: 300,
  /**
   * Voice prefix → espeak-ng voice used for phonemization; the same mapping
   * as Kokoro's Python pipeline. ja/zh need misaki's own G2P and are left out.
   */
  espeakVoice: { p: 'pt-br', a: 'en-us', b: 'en', e: 'es', f: 'fr-fr', i: 'it', h: 'hi' } as Record<
    string,
    string
  >,
} as const;

/**
 * Supertonic 3. The GitHub repo was archived in Sept 2026; the Hugging Face
 * model repo is pinned to its last commit. Model: OpenRAIL-M (see LICENSE in
 * the model repo), a use-restricted license separate from Kokoro's.
 */
export const SUPERTONIC_MODEL = {
  modelId: 'Supertone/supertonic-3',
  revision: '3cadd1ee6394adea1bd021217a0e650ede09a323',
  license: 'OpenRAIL-M',
  cacheName: 'readme-model-supertonic',
  downloadSize: '400 MB',
  files: [
    { path: 'onnx/tts.json', size: 8_253 },
    { path: 'onnx/unicode_indexer.json', size: 277_676 },
    { path: 'onnx/duration_predictor.onnx', size: 3_700_147, sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db' },
    { path: 'onnx/text_encoder.onnx', size: 36_416_150, sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff' },
    { path: 'onnx/vector_estimator.onnx', size: 256_534_781, sha256: '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c' },
    { path: 'onnx/vocoder.onnx', size: 101_424_195, sha256: '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba' },
  ],
  /** Denoising steps; 8 is the default of the official web demo. */
  totalSteps: 8,
  /** The demo's speed 1.05 is the natural pace, so it maps to rate 1. */
  baseSpeed: 1.05,
  maxChars: 300,
} as const;

/** URL of a file of a pinned Hugging Face revision. */
export function hfUrl(model: { modelId: string; revision: string }, path: string): string {
  return `${HF_HOST}/${model.modelId}/resolve/${model.revision}/${path}`;
}

export interface TtsEngineDefinition {
  id: TtsEngineId;
  label: string;
  /** True for engines that synthesize locally instead of chrome.tts. */
  local: boolean;
  /** Base languages; empty means whatever the system voices cover. */
  languages: string[];
  voices: TtsVoice[];
}

const avatar = (id: string) => `/avatars/${id}.svg`;

const kokoroVoice = (id: string, name: string, lang: string): TtsVoice => ({
  id,
  name,
  lang,
  engine: 'kokoro',
  avatar: avatar(id),
});

/**
 * Upstream only numbers the presets (F1–F5 female, M1–M5 male); the display
 * names are ours. The id stays the stored value.
 */
const SUPERTONIC_NAMES: Record<string, string> = {
  F1: 'Ana',
  F2: 'Bia',
  F3: 'Clara',
  F4: 'Diana',
  F5: 'Elisa',
  M1: 'André',
  M2: 'Bruno',
  M3: 'Caio',
  M4: 'Davi',
  M5: 'Eduardo',
};

const SUPERTONIC_VOICES: TtsVoice[] = Object.entries(SUPERTONIC_NAMES).map(([id, name]) => ({
  id,
  name,
  lang: '*',
  engine: 'supertonic',
  avatar: avatar(id),
}));

const ENGINES: Record<TtsEngineId, TtsEngineDefinition> = {
  system: { id: 'system', label: 'Voz do sistema', local: false, languages: [], voices: [] },
  kokoro: {
    id: 'kokoro',
    label: 'Kokoro 82M',
    local: true,
    languages: ['pt', 'en', 'es', 'fr', 'it', 'hi'],
    voices: [
      kokoroVoice('pf_dora', 'Dora', 'pt-BR'),
      kokoroVoice('pm_alex', 'Alex', 'pt-BR'),
      kokoroVoice('pm_santa', 'Santa', 'pt-BR'),
      kokoroVoice('af_heart', 'Heart', 'en-US'),
      kokoroVoice('am_michael', 'Michael', 'en-US'),
      kokoroVoice('bf_emma', 'Emma', 'en-GB'),
      kokoroVoice('bm_george', 'George', 'en-GB'),
      kokoroVoice('ef_dora', 'Dora', 'es'),
      kokoroVoice('em_alex', 'Alex', 'es'),
      kokoroVoice('em_santa', 'Santa', 'es'),
      kokoroVoice('ff_siwis', 'Siwis', 'fr'),
      kokoroVoice('if_sara', 'Sara', 'it'),
      kokoroVoice('im_nicola', 'Nicola', 'it'),
      kokoroVoice('hf_alpha', 'Alpha', 'hi'),
      kokoroVoice('hf_beta', 'Beta', 'hi'),
      kokoroVoice('hm_omega', 'Omega', 'hi'),
      kokoroVoice('hm_psi', 'Psi', 'hi'),
    ],
  },
  supertonic: {
    id: 'supertonic',
    label: 'Supertonic 3',
    local: true,
    languages: [
      'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it',
      'ja', 'ko', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi',
    ],
    voices: SUPERTONIC_VOICES,
  },
};

export const ENGINE_IDS = Object.keys(ENGINES) as TtsEngineId[];

export function getEngineDefinition(id: TtsEngineId): TtsEngineDefinition {
  return ENGINES[id];
}

/** Voices of a local engine able to read `lang`, best match first. */
export function voicesFor(engine: LocalEngineId, lang: string): TtsVoice[] {
  const { languages, voices } = ENGINES[engine];
  const base = normalizeLanguage(lang);
  if (!languages.includes(base)) return [];
  const exact = lang.toLowerCase();
  return voices
    .filter((voice) => voice.lang === '*' || normalizeLanguage(voice.lang) === base)
    .sort((a, b) => Number(b.lang.toLowerCase() === exact) - Number(a.lang.toLowerCase() === exact));
}

/**
 * Every voice of the engine for the picker: those of `lang` first, then the
 * others. A voice of another language reads the text with that language's
 * pronunciation — the user's call.
 */
export function pickerVoices(engine: LocalEngineId, lang: string): TtsVoice[] {
  const matching = voicesFor(engine, lang);
  return [...matching, ...ENGINES[engine].voices.filter((voice) => !matching.includes(voice))];
}

/**
 * Key under which a manual voice choice is stored in voiceByEngine: Kokoro
 * voices are tied to a language, Supertonic styles are not.
 */
export function localVoiceKey(engine: LocalEngineId, lang: string): string {
  return engine === 'supertonic' ? '*' : normalizeLanguage(lang);
}

/** Voice to read `lang` with: the manual choice when it fits, else the best match. Null = unsupported language. */
export function pickLocalVoice(
  engine: LocalEngineId,
  lang: string,
  manual: Record<string, string>,
): TtsVoice | null {
  const chosen = manual[localVoiceKey(engine, lang)];
  // A manual choice wins even across languages; the default must match the text.
  const manualVoice = ENGINES[engine].voices.find((voice) => voice.id === chosen);
  return manualVoice ?? voicesFor(engine, lang)[0] ?? null;
}

/**
 * Routes speak/stop to the adapter of the engine selected in prefs: the
 * system voices go to chrome.tts, the neural engines to the offscreen
 * runtime. stop() reaches both so an engine switch never leaves the previous
 * adapter talking.
 */
export function createTtsRouter(deps: {
  system: EngineTts;
  local: EngineTts;
  getPrefs: () => Promise<Pick<Prefs, 'ttsEngine'>>;
}): EngineTts {
  return {
    async speak(text, options) {
      const { ttsEngine } = await deps.getPrefs();
      if (ttsEngine === 'system') {
        await deps.system.speak(text, options);
      } else {
        await deps.local.speak(text, options);
      }
    },
    async stop() {
      await deps.system.stop();
      await deps.local.stop();
    },
    async setRate(rate) {
      const { ttsEngine } = await deps.getPrefs();
      if (ttsEngine === 'system') return false;
      return (await deps.local.setRate?.(rate)) ?? false;
    },
  };
}
