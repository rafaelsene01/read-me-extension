import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLang } from './detect-lang';

const TEXT = 'Uma frase longa o bastante para o detector ter o que analisar aqui.';

/** Stands in for chrome.i18n, which the test environment does not provide. */
function detector(result: unknown): void {
  vi.stubGlobal('chrome', { i18n: { detectLanguage: vi.fn().mockResolvedValue(result) } });
}

afterEach(() => vi.unstubAllGlobals());

describe('detectLang', () => {
  it('takes the language the detector is confident about', async () => {
    detector({ isReliable: true, languages: [{ language: 'pt', percentage: 95 }] });

    expect(await detectLang(TEXT, 'en')).toBe('pt');
  });

  it('keeps the fallback when the detector is unsure', async () => {
    detector({ isReliable: false, languages: [{ language: 'es', percentage: 40 }] });

    expect(await detectLang(TEXT, 'pt-BR')).toBe('pt-BR');
  });

  it('keeps the fallback for an undetermined language and for no answer at all', async () => {
    detector({ isReliable: false, languages: [{ language: 'und', percentage: 100 }] });
    expect(await detectLang(TEXT, 'pt-BR')).toBe('pt-BR');

    detector({ isReliable: false, languages: [] });
    expect(await detectLang(TEXT, 'pt-BR')).toBe('pt-BR');
  });

  it('does not ask about a text too short to tell', async () => {
    const detectLanguage = vi.fn();
    vi.stubGlobal('chrome', { i18n: { detectLanguage } });

    expect(await detectLang('Oi.', 'en')).toBe('en');
    expect(detectLanguage).not.toHaveBeenCalled();
  });

  it('keeps the fallback where the detector is unavailable or throws', async () => {
    vi.stubGlobal('chrome', {});
    expect(await detectLang(TEXT, 'en')).toBe('en');

    vi.stubGlobal('chrome', {
      i18n: { detectLanguage: vi.fn().mockRejectedValue(new Error('nope')) },
    });
    expect(await detectLang(TEXT, 'en')).toBe('en');
  });
});
