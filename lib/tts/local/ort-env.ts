import * as ort from 'onnxruntime-web';
import ortWasmUrl from 'onnxruntime-web-jsep.wasm?url';

/**
 * Called before any session is created. transformers.js points wasmPaths at
 * jsDelivr when it is imported, which would make ONNX Runtime load its JS glue
 * from a CDN (remote code). Overriding only the .wasm path keeps the glue
 * embedded in ORT's bundle and loads the binary shipped in the extension.
 * (ORT's own `new URL(..., import.meta.url)` cannot be relied on: WXT rewrites
 * import.meta.url, so Vite never emits that file.)
 *
 * No proxy worker: it cannot carry WebGPU buffers. This module already runs in
 * our own dedicated worker, so the UI never blocks.
 */
export function configureOrt(): void {
  ort.env.wasm.wasmPaths = { wasm: new URL(ortWasmUrl, self.location.origin).href };
  ort.env.wasm.proxy = false;
  // ponytail: extension pages are not crossOriginIsolated, so WASM runs single
  // threaded; add COOP/COEP to the manifest if WASM inference proves too slow.
  ort.env.wasm.numThreads = 1;
}

/** Copy when the view does not own its whole buffer, so it can be transferred safely. */
export function ownedPcm(pcm: Float32Array): Float32Array<ArrayBuffer> {
  return pcm.byteOffset === 0 && pcm.buffer instanceof ArrayBuffer && pcm.byteLength === pcm.buffer.byteLength
    ? (pcm as Float32Array<ArrayBuffer>)
    : pcm.slice();
}
