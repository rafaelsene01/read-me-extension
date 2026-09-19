declare module 'espeak-ng' {
  interface ESpeakNgInstance {
    FS: {
      writeFile(path: string, data: string): void;
      readFile(path: string, options: { encoding: 'utf8' }): string;
    };
  }

  interface ESpeakNgOptions {
    arguments: string[];
    preRun?: ((instance: ESpeakNgInstance) => void)[];
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance) => void,
    ) => object;
  }

  export default function ESpeakNg(options: ESpeakNgOptions): Promise<ESpeakNgInstance>;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}
