import { describe, expect, it } from 'vitest';
import { createMp3Encoder, toInt16 } from './mp3';

const RATE = 24000;

function sine(length: number): Float32Array {
  const pcm = new Float32Array(length);
  for (let i = 0; i < length; i++) pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE);
  return pcm;
}

describe('toInt16', () => {
  it('clamps out-of-range samples', () => {
    expect([...toInt16(new Float32Array([1.5, -1.5, 0]))]).toEqual([32767, -32768, 0]);
  });
});

describe('createMp3Encoder', () => {
  it('encodes one second of sine into an mp3 blob', async () => {
    const encoder = createMp3Encoder(RATE);
    encoder.encode(sine(RATE));
    const blob = encoder.finish();

    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(0);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]! & 0xe0).toBe(0xe0);
  });

  it('produces the same size whether fed at once or in odd chunks', () => {
    const pcm = sine(RATE);

    const whole = createMp3Encoder(RATE);
    whole.encode(pcm);

    const chunked = createMp3Encoder(RATE);
    for (const [start, end] of [[0, 100], [100, 1500], [1500, 5000], [5000, RATE]]) {
      chunked.encode(pcm.subarray(start, end));
    }

    expect(chunked.finish().size).toBe(whole.finish().size);
  });

  it('encodes the tail shorter than one frame on finish', () => {
    const frames = 5 * 1152;
    const withTail = createMp3Encoder(RATE);
    withTail.encode(sine(frames + 1000));

    const fullFrames = createMp3Encoder(RATE);
    fullFrames.encode(sine(frames));

    expect(withTail.finish().size).toBeGreaterThan(fullFrames.finish().size);
  });
});
