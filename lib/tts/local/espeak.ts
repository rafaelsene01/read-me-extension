import ESpeakNg from 'espeak-ng';
import wasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url';

let compiled: Promise<WebAssembly.Module> | null = null;

async function runOnce(lines: string[], voice: string, tie: boolean): Promise<string[]> {
  compiled ??= WebAssembly.compileStreaming(fetch(wasmUrl));
  const module = await compiled;
  // The build exports no callMain, so every call is a fresh instance of the
  // already-compiled module (~100 ms). Blank lines keep one output line per input line.
  const espeak = await ESpeakNg({
    arguments: ['-q', '-b1', '--ipa', ...(tie ? ['--tie=^'] : []), '--phonout', 'out', '-v', voice, '-f', 'in'],
    preRun: [(instance) => instance.FS.writeFile('in', lines.join('\n\n'))],
    instantiateWasm: (imports, done) => {
      void WebAssembly.instantiate(module, imports).then((instance) => done(instance));
      return {};
    },
  });
  return espeak.FS.readFile('out', { encoding: 'utf8' }).split('\n').slice(0, -1);
}

/**
 * IPA for each line (espeak-ng voice such as 'pt-br'). `tie` joins affricates
 * and diphthongs with '^', as the Python phonemizer Kokoro was trained with.
 */
export async function espeakIpa(lines: string[], voice: string, tie: boolean): Promise<string[]> {
  if (lines.length === 0) return [];
  const out = await runOnce(lines, voice, tie);
  if (out.length === lines.length) return out;
  // espeak split a line on its own: fall back to one run per line.
  return Promise.all(lines.map(async (line) => (await runOnce([line], voice, tie)).join(' ')));
}
