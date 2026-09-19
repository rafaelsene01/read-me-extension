import { afterEach, describe, expect, it, vi } from 'vitest';
import { listVoices, pickVoice } from './voices';
import type { Voice } from './types';

function stubGetVoices(voices: unknown[]): void {
  vi.stubGlobal('chrome', {
    tts: { getVoices: (callback: (v: unknown[]) => void) => callback(voices) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listVoices', () => {
  it('returns local and online voices, flagging the online ones', async () => {
    stubGetVoices([
      { voiceName: 'Local PT', lang: 'pt-BR', remote: false },
      { voiceName: 'Google PT', lang: 'pt-BR', remote: true },
      { voiceName: 'Sem idioma', remote: false },
    ]);

    expect(await listVoices()).toEqual([
      { voiceName: 'Local PT', lang: 'pt-BR', remote: false },
      { voiceName: 'Google PT', lang: 'pt-BR', remote: true },
    ]);
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

  it('prefers a local voice over an online one for the same language', () => {
    const mixed: Voice[] = [
      { voiceName: 'Google PT', lang: 'pt-BR', remote: true },
      { voiceName: 'Luciana', lang: 'pt-BR', remote: false },
    ];

    expect(pickVoice(mixed, 'pt-BR', {})?.voiceName).toBe('Luciana');
  });

  it('falls back to an online voice when no local one fits', () => {
    const online: Voice[] = [{ voiceName: 'Google PT', lang: 'pt-BR', remote: true }];

    expect(pickVoice(online, 'pt-BR', {})?.voiceName).toBe('Google PT');
  });

  it('returns null when no voice exists for the language', () => {
    expect(pickVoice(voices, 'ja-JP', {})).toBeNull();
  });

  it('returns null for an empty voice list without throwing', () => {
    expect(pickVoice([], 'pt-BR', { 'pt-BR': 'Luciana' })).toBeNull();
  });
});
