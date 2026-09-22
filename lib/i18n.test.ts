import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_UI_LANG, getLocale, setLocale, t, tr, trName } from './i18n';

afterEach(() => setLocale(DEFAULT_UI_LANG));

describe('i18n', () => {
  it('starts in English', () => {
    expect(getLocale()).toBe('en');
    expect(t('Ler página')).toBe('Read page');
  });

  it('pt-BR shows the key itself, with its placeholders filled', () => {
    setLocale('pt-BR');
    expect(t('Sem voz instalada para {lang}', { lang: 'inglês' })).toBe('Sem voz instalada para inglês');
  });

  it('other languages come from their dictionary', () => {
    setLocale('ja');
    expect(t('Capítulo {n}', { n: 2 })).toBe('第 2 章');
  });

  it('tr translates both sides of "prefix: rest" and keeps unknown text', () => {
    expect(tr('Falha na tradução: Tradução não suportada neste navegador')).toBe(
      'Translation failed: Translation not supported in this browser',
    );
    expect(tr('Falha ao baixar o modelo: HTTP 500')).toBe('Failed to download the model: HTTP 500');
    expect(tr('something else')).toBe('something else');
  });

  it('trName translates the names the app gives, and only those', () => {
    setLocale('es');
    expect(trName('Sem título')).toBe('Sin título');
    expect(trName('Página 3')).toBe('Página 3');
    setLocale('de');
    expect(trName('Capítulo 12')).toBe('Kapitel 12');
    expect(trName('Capítulo um')).toBe('Capítulo um');
  });
});
