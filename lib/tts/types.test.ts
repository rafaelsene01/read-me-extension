import { describe, expect, it } from 'vitest';
import { normalizeLanguage } from './types';

describe('normalizeLanguage', () => {
  it('drops the region subtag', () => {
    expect(normalizeLanguage('pt-BR')).toBe('pt');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('en-GB')).toBe('en');
  });

  it('accepts underscores and any case', () => {
    expect(normalizeLanguage('pt_BR')).toBe('pt');
    expect(normalizeLanguage('EN_us')).toBe('en');
  });

  it('keeps a base language untouched', () => {
    expect(normalizeLanguage('pt')).toBe('pt');
    expect(normalizeLanguage('ja')).toBe('ja');
  });
});
