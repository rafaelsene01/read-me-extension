import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    // Pre-bundling moves these into .vite/deps, where their
    // `new URL('*.wasm', import.meta.url)` no longer finds the .wasm (dev only).
    optimizeDeps: { exclude: ['onnxruntime-web', 'espeak-ng'] },
    resolve: {
      alias: [
        // ONNX Runtime's .wasm is not in its package "exports"; imported with
        // ?url so it ships in the extension (see lib/tts/local/ort-env.ts).
        {
          find: /^onnxruntime-web-jsep\.wasm/,
          replacement: resolve('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm'),
        },
      ],
    },
    // The inference worker code-splits (transformers.js), which needs ES output.
    worker: { format: 'es' },
  }),
  manifest: {
    name: 'ReadMe',
    permissions: [
      'storage',
      'tts',
      'sidePanel',
      'scripting',
      'activeTab',
      'contextMenus',
      'offscreen',
      'unlimitedStorage',
    ],
    optional_host_permissions: ['<all_urls>'],
    // Declared explicitly: without it the inference worker runs under a bare
    // `script-src 'self'` and Chrome refuses to compile ONNX Runtime/espeak
    // WebAssembly. Only 'wasm-unsafe-eval' is added — never 'unsafe-eval'.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
