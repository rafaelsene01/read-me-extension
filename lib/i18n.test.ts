import { afterEach, describe, expect, it } from 'vitest';
import { matchUiLang, setLocale, t, tr } from './i18n';

afterEach(() => setLocale('pt-BR'));

describe('i18n', () => {
  it('pt-BR shows the key itself, with its placeholders filled', () => {
    expect(t('Sem voz instalada para {lang}', { lang: 'inglês' })).toBe('Sem voz instalada para inglês');
  });

  it('other languages come from their dictionary', () => {
    setLocale('es');
    expect(t('Ler página')).toBe('Leer página');
    expect(t('Capítulo {n}', { n: 2 })).toBe('Capítulo 2');
  });

  it('tr translates both sides of "prefix: rest" and keeps unknown text', () => {
    setLocale('en');
    expect(tr('Falha na tradução: Tradução não suportada neste navegador')).toBe(
      'Translation failed: Translation not supported in this browser',
    );
    expect(tr('Falha na tradução: HTTP 500')).toBe('Translation failed: HTTP 500');
    expect(tr('something else')).toBe('something else');
  });

  it('matches a browser language to the closest interface language', () => {
    expect(matchUiLang('pt-PT')).toBe('pt-BR');
    expect(matchUiLang('es-MX')).toBe('es');
    expect(matchUiLang('ja')).toBe('en');
  });
});
