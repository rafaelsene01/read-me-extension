import { describe, expect, it } from 'vitest';
import { espeakToKokoro, kokoroPhonemes, splitPunctuation } from './kokoro-g2p';
import { preprocessSupertonic, supertonicIds } from './supertonic-text';

describe('Kokoro G2P glue', () => {
  it('splits words from punctuation runs', () => {
    expect(splitPunctuation('Olá, tudo bem?')).toEqual([
      { punctuation: false, text: 'Olá' },
      { punctuation: true, text: ', ' },
      { punctuation: false, text: 'tudo bem' },
      { punctuation: true, text: '?' },
    ]);
  });

  it('maps tied espeak sequences to Kokoro symbols for Portuguese', () => {
    // Real espeak-ng pt-br output with --tie=^ for "cidade leite pão".
    expect(espeakToKokoro('sˌidˈad^ʒy lˈe^ɪt^ʃy pˈɐ̃^ʊ̃', 'p')).toBe('sˌidˈaʤy lˈAʧy pˈɐ̃ʊ̃');
  });

  it('applies the kokoro-js English fixes', () => {
    expect(espeakToKokoro('ɑːr', 'a')).toBe('ɑːɹ');
  });

  it('phonemizes words only and keeps punctuation in place', async () => {
    const seen: string[][] = [];
    const phonemes = await kokoroPhonemes('Olá, tudo bem?', 'p', async (lines) => {
      seen.push(lines);
      return ['olˈa', 'tˈudʊ bˈe^ɪŋ'];
    });

    expect(seen).toEqual([['Olá', 'tudo bem']]);
    expect(phonemes).toBe('olˈa, tˈudʊ bˈAŋ?');
  });
});

describe('Supertonic text front-end', () => {
  it('normalizes, closes the sentence and wraps the language tag', () => {
    expect(preprocessSupertonic('Olá  “mundo”', 'pt')).toBe('<pt>Olá "mundo"</pt>'.normalize('NFKD'));
    expect(preprocessSupertonic('Sem ponto', 'pt')).toBe('<pt>Sem ponto.</pt>');
  });

  it('maps characters through the indexer, unknown ones to -1', () => {
    const indexer = Array.from({ length: 128 }, (_, code) => code + 1000);
    expect(supertonicIds('ab€', indexer)).toEqual([1097, 1098, -1]);
  });
});
