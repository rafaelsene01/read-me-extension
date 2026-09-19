import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { extractFromPage } from './page';

function page(body: string): Document {
  return parseHTML(`<html><body>${body}</body></html>`).document as unknown as Document;
}

const LONG_A = 'Primeiro paragrafo com texto suficiente para contar como conteudo real da pagina.';
const LONG_B = 'Segundo paragrafo, tambem comprido o bastante para passar do minimo de caracteres.';

describe('extractFromPage', () => {
  it('reads main, pulling in the headings that introduce each block', () => {
    const doc = page(`
      <nav><p>${LONG_A}</p></nav>
      <main>
        <h1>Titulo</h1>
        <div><h2>Secao</h2><p>${LONG_A}</p><p>${LONG_B}</p></div>
      </main>`);
    expect(extractFromPage(doc).split('\n')).toEqual(['Titulo', 'Secao', LONG_A, LONG_B]);
  });

  it('keeps inline markup in one paragraph and drops scripts and footnote marks', () => {
    const doc = page(`<p>Texto com <b>negrito</b> e <a href="#">link</a> que segue longo o bastante<sup>1</sup>.<script>x()</script></p>`);
    expect(extractFromPage(doc)).toBe('Texto com negrito e link que segue longo o bastante.');
  });

  it('reads a list as one block with one line per item', () => {
    const doc = page(`<ul><li>${LONG_A}</li><li>${LONG_B}</li></ul>`);
    expect(extractFromPage(doc).split('\n')).toEqual([LONG_A, LONG_B]);
  });

  it('falls back to short text when the page has little of it', () => {
    const doc = page('<div>Ola mundo</div>');
    expect(extractFromPage(doc)).toBe('Ola mundo');
  });
});
