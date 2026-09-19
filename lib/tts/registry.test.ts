import { describe, expect, it, vi } from 'vitest';
import {
  createTtsRouter,
  getEngineDefinition,
  localVoiceKey,
  pickerVoices,
  pickLocalVoice,
  voicesFor,
} from './registry';
import type { EngineTts } from '../engine';

function fakeAdapter() {
  const speak = vi.fn(async (_text: string, _options: unknown) => {});
  const stop = vi.fn();
  const adapter: EngineTts = { speak, stop };
  return { adapter, speak, stop };
}

describe('getEngineDefinition', () => {
  it('lists the three engines', () => {
    expect(getEngineDefinition('system')).toMatchObject({ label: 'Voz do sistema', local: false });
    expect(getEngineDefinition('kokoro')).toMatchObject({ label: 'Kokoro 82M', local: true });
    expect(getEngineDefinition('supertonic')).toMatchObject({ label: 'Supertonic 3', local: true });
  });

  it('declares the 31 Supertonic languages and its 10 styles', () => {
    const supertonic = getEngineDefinition('supertonic');
    expect(supertonic.languages).toHaveLength(31);
    expect(supertonic.languages).toContain('pt');
    expect(supertonic.voices.map((voice) => voice.id)).toEqual([
      'F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5',
    ]);
    expect(supertonic.voices[0]!.name).toBe('Ana');
  });
});

describe('voice resolution', () => {
  it('offers the Brazilian Kokoro voices for pt-BR and plain pt', () => {
    const ids = ['pf_dora', 'pm_alex', 'pm_santa'];
    expect(voicesFor('kokoro', 'pt-BR').map((voice) => voice.id)).toEqual(ids);
    expect(voicesFor('kokoro', 'pt').map((voice) => voice.id)).toEqual(ids);
  });

  it('puts the exact region first for English', () => {
    expect(voicesFor('kokoro', 'en-GB')[0]!.lang).toBe('en-GB');
    expect(voicesFor('kokoro', 'en-US')[0]!.lang).toBe('en-US');
  });

  it('returns no voice for a language the engine cannot read', () => {
    expect(pickLocalVoice('kokoro', 'de-DE', {})).toBeNull();
    expect(pickLocalVoice('supertonic', 'xx', {})).toBeNull();
  });

  it('covers Spanish, French, Italian and Hindi with the official Kokoro voices', () => {
    expect(pickLocalVoice('kokoro', 'es-ES', {})!.id).toBe('ef_dora');
    expect(pickLocalVoice('kokoro', 'fr-FR', {})!.id).toBe('ff_siwis');
    expect(pickLocalVoice('kokoro', 'it', {})!.id).toBe('if_sara');
    expect(pickLocalVoice('kokoro', 'hi-IN', {})!.id).toBe('hf_alpha');
  });

  it('lists every voice in the picker, the text language first', () => {
    const ids = pickerVoices('kokoro', 'pt-BR').map((voice) => voice.id);
    expect(ids.slice(0, 3)).toEqual(['pf_dora', 'pm_alex', 'pm_santa']);
    expect(ids).toContain('af_heart');
    expect(ids).toHaveLength(17);
  });

  it('defaults to the first match and honors a valid manual choice', () => {
    expect(pickLocalVoice('kokoro', 'pt-BR', {})!.id).toBe('pf_dora');
    expect(pickLocalVoice('kokoro', 'pt-BR', { pt: 'pm_alex' })!.id).toBe('pm_alex');
    // A manual choice of another language is respected, an unknown id ignored.
    expect(pickLocalVoice('kokoro', 'pt-BR', { pt: 'af_heart' })!.id).toBe('af_heart');
    expect(pickLocalVoice('kokoro', 'pt-BR', { pt: 'gone' })!.id).toBe('pf_dora');
    expect(pickLocalVoice('kokoro', 'de', { de: 'bm_george' })!.id).toBe('bm_george');
  });

  it('keys Supertonic styles independently of the language', () => {
    expect(localVoiceKey('supertonic', 'pt-BR')).toBe('*');
    expect(localVoiceKey('kokoro', 'pt-BR')).toBe('pt');
    expect(pickLocalVoice('supertonic', 'en-US', { '*': 'M3' })!.id).toBe('M3');
    expect(pickLocalVoice('supertonic', 'pt-BR', {})!.id).toBe('F1');
  });
});

describe('createTtsRouter', () => {
  it('routes a system selection to the system adapter', async () => {
    const system = fakeAdapter();
    const local = fakeAdapter();
    const router = createTtsRouter({
      system: system.adapter,
      local: local.adapter,
      getPrefs: async () => ({ ttsEngine: 'system' }),
    });

    await router.speak('Olá.', { lang: 'pt-BR', rate: 1 });

    expect(system.speak).toHaveBeenCalledWith('Olá.', { lang: 'pt-BR', rate: 1 });
    expect(local.speak).not.toHaveBeenCalled();
  });

  it('routes a neural selection to the local adapter', async () => {
    const system = fakeAdapter();
    const local = fakeAdapter();
    const router = createTtsRouter({
      system: system.adapter,
      local: local.adapter,
      getPrefs: async () => ({ ttsEngine: 'kokoro' }),
    });

    await router.speak('Olá.', { lang: 'pt-BR', rate: 1 });

    expect(local.speak).toHaveBeenCalledWith('Olá.', { lang: 'pt-BR', rate: 1 });
    expect(system.speak).not.toHaveBeenCalled();
  });

  it('stops both adapters so an engine switch never leaves the old one talking', async () => {
    const system = fakeAdapter();
    const local = fakeAdapter();
    const router = createTtsRouter({
      system: system.adapter,
      local: local.adapter,
      getPrefs: async () => ({ ttsEngine: 'system' }),
    });

    await router.stop();

    expect(system.stop).toHaveBeenCalledTimes(1);
    expect(local.stop).toHaveBeenCalledTimes(1);
  });
});
