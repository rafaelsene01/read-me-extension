/**
 * WebGPU availability must be probed, not assumed: `navigator.gpu` can exist
 * while requestAdapter() still fails (no GPU, blocklist, headless). WASM is
 * always the fallback. Never WebGL.
 */
export async function detectBackend(): Promise<'webgpu' | 'wasm'> {
  // The DOM lib in use has no WebGPU types.
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // Fall through to WASM.
    }
  }
  return 'wasm';
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Runs `create` on WebGPU when an adapter exists, else (or on failure) on
 * WASM — the only automatic fallback, always within the same engine. When
 * both fail the error carries both causes.
 */
export async function withBackendFallback<T>(
  create: (backend: 'webgpu' | 'wasm') => Promise<T>,
): Promise<{ backend: 'webgpu' | 'wasm'; value: T }> {
  let webgpuError: unknown;
  if ((await detectBackend()) === 'webgpu') {
    try {
      return { backend: 'webgpu', value: await create('webgpu') };
    } catch (err) {
      console.warn('[ReadMe] WebGPU falhou, usando WASM', err);
      webgpuError = err;
    }
  }
  try {
    return { backend: 'wasm', value: await create('wasm') };
  } catch (err) {
    throw new Error(webgpuError ? `WebGPU: ${reason(webgpuError)} · WASM: ${reason(err)}` : reason(err));
  }
}
