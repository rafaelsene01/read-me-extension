import { Mp3Encoder } from '@breezystack/lamejs';

const BLOCK = 1152;

/** Float PCM in [-1, 1] to 16-bit PCM, clamping out-of-range samples. */
export function toInt16(pcm: Float32Array): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Mono 64 kbps MP3 encoder fed chunk by chunk. Only the tail of the last
 * chunk (< 1152 samples) is kept between calls, so lame always sees full frames.
 */
export function createMp3Encoder(sampleRate: number) {
  const lame = new Mp3Encoder(1, sampleRate, 64);
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const pending = new Int16Array(BLOCK);
  let filled = 0;

  const push = (bytes: Uint8Array) => {
    if (bytes.length > 0) parts.push(new Uint8Array(bytes));
  };

  return {
    encode(pcm: Float32Array) {
      const samples = toInt16(pcm);
      let i = 0;
      while (i < samples.length) {
        const n = Math.min(BLOCK - filled, samples.length - i);
        pending.set(samples.subarray(i, i + n), filled);
        filled += n;
        i += n;
        if (filled === BLOCK) {
          push(lame.encodeBuffer(pending));
          filled = 0;
        }
      }
    },
    finish(): Blob {
      if (filled > 0) push(lame.encodeBuffer(pending.subarray(0, filled)));
      filled = 0;
      push(lame.flush());
      return new Blob(parts, { type: 'audio/mpeg' });
    },
  };
}
