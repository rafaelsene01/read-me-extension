import { afterEach, describe, expect, it, vi } from 'vitest';
import { listLocalVoices, pickVoice } from './voices';
import type { Voice } from './types';

function stubGetVoices(voices: unknown[]): void {
  vi.stubGlobal('chrome', {
    tts: { getVoices: (callback: (v: unknown[]) => void) => callback(voices) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listLocalVoices', () => {
  it('never returns voices with remote true', async () => {
    stubGetVoices([
      { voiceName: 'Local PT', lang: 'pt-BR', remote: false },
      { voiceName: 'Google PT', lang: 'pt-BR', remote: true },
      { voiceName: 'Local EN', lang: 'en-US', remote: false },
    ]);

    const voices = await listLocalVoices();

    expect(voices.map((v) => v.voiceName)).toEqual(['Local PT', 'Local EN']);
  });

  it('returns an empty list when the system has no local voice installed', async () => {
    stubGetVoices([{ voiceName: 'Google PT', lang: 'pt-BR', remote: true }]);

    expect(await listLocalVoices()).toEqual([]);
  });
});

describe('pickVoice', () => {
  const voices: Voice[] = [
    { voiceName: 'Luciana', lang: 'pt-BR', remote: false },
    { voiceName: 'Joana', lang: 'pt', remote: false },
    { voiceName: 'Alex', lang: 'en-US', remote: false },
  ];

  it('returns the manually chosen voice for the language', () => {
    expect(pickVoice(voices, 'pt-BR', { 'pt-BR': 'Joana' })).toEqual({
      voiceName: 'Joana',
      lang: 'pt',
      remote: false,
    });
  });

  it('returns the exact language match when there is no manual choice', () => {
    expect(pickVoice(voices, 'pt-BR', {})?.voiceName).toBe('Luciana');
  });

  it('matches pt-BR to a pt voice when no exact voice exists', () => {
    const noExact: Voice[] = [
      { voiceName: 'Joana', lang: 'pt', remote: false },
      { voiceName: 'Alex', lang: 'en-US', remote: false },
    ];

    expect(pickVoice(noExact, 'pt-BR', {})?.voiceName).toBe('Joana');
  });

  it('returns null when no voice exists for the language', () => {
    expect(pickVoice(voices, 'ja-JP', {})).toBeNull();
  });

  it('returns null for an empty voice list without throwing', () => {
    expect(pickVoice([], 'pt-BR', { 'pt-BR': 'Luciana' })).toBeNull();
  });
});
