import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectBackend } from './detect';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectBackend', () => {
  it('prefers WebGPU when an adapter is available', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });

    await expect(detectBackend()).resolves.toBe('webgpu');
  });

  it('falls back to WASM when navigator.gpu is missing', async () => {
    vi.stubGlobal('navigator', {});

    await expect(detectBackend()).resolves.toBe('wasm');
  });

  it('falls back to WASM when requestAdapter fails or returns null', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } });
    await expect(detectBackend()).resolves.toBe('wasm');

    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => {
          throw new Error('no adapter');
        },
      },
    });
    await expect(detectBackend()).resolves.toBe('wasm');
  });
});
