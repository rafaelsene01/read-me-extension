import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, encodeWav, type AudioElementLike } from './player';

/** Audio element stand-in: finishes when told to. */
class FakeAudio implements AudioElementLike {
  src = '';
  preload = '';
  playbackRate = 1;
  preservesPitch = false;
  onended: ((event: Event) => void) | null = null;
  playing = false;
  paused = false;

  async play() {
    this.playing = true;
  }

  pause() {
    this.paused = true;
  }

  /** Simulate the element reaching the end of its source. */
  finish() {
    this.onended?.(new Event('ended'));
  }
}

function player() {
  const audios: FakeAudio[] = [];
  const onStarted = vi.fn();
  const onEnded = vi.fn();
  const instance = new AudioPlayer({
    onStarted,
    onEnded,
    createContext: null,
    createAudio: () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio;
    },
  });
  return { instance, audios, onStarted, onEnded };
}

const chunk = (requestId: string, rate = 1) => ({
  requestId,
  pcm: new Float32Array(240).fill(0.5),
  sampleRate: 24_000,
  rate,
});

describe('AudioPlayer', () => {
  it('starts playback and reports started once per request', () => {
    const { instance, audios, onStarted } = player();

    instance.enqueue(chunk('r1'));
    instance.enqueue(chunk('r1'));

    // The second chunk waits in the queue, its element already loading.
    expect(audios).toHaveLength(2);
    expect(audios[1]!.playing).toBe(false);
    expect(audios[0]!.playing).toBe(true);
    expect(audios[0]!.preservesPitch).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledWith('r1');
  });

  it('chains queued chunks and reports ended only after synthesis and playback drain', () => {
    const { instance, audios, onEnded } = player();

    instance.enqueue(chunk('r1'));
    instance.enqueue(chunk('r1'));
    instance.markEnded('r1');

    // Synthesis done but one chunk still playing: no ended yet.
    expect(onEnded).not.toHaveBeenCalled();

    audios[0]!.finish();
    expect(audios[1]!.playing).toBe(true);
    expect(onEnded).not.toHaveBeenCalled();

    audios[1]!.finish();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith('r1');
  });

  it('waits for synthesis to finish when playback drains first', () => {
    const { instance, audios, onEnded } = player();

    instance.enqueue(chunk('r1'));
    audios[0]!.finish();
    // The worker is still generating the next chunk: not ended yet.
    expect(onEnded).not.toHaveBeenCalled();

    instance.markEnded('r1');
    expect(onEnded).toHaveBeenCalledWith('r1');
  });

  it('stop() drops queued audio, silences the current chunk and fires nothing', () => {
    const { instance, audios, onStarted, onEnded } = player();

    instance.enqueue(chunk('r1'));
    instance.enqueue(chunk('r1'));
    instance.stop();

    expect(audios[0]!.paused).toBe(true);
    expect(audios).toHaveLength(2);
    audios[0]!.finish();
    expect(onEnded).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('stop(requestId) keeps other requests playing', () => {
    const { instance, audios, onEnded } = player();

    instance.enqueue(chunk('r1'));
    instance.enqueue(chunk('r2'));
    instance.stop('r1');

    expect(audios[0]!.paused).toBe(true);
    expect(audios[1]!.playing).toBe(true);
    instance.markEnded('r2');
    audios[1]!.finish();
    expect(onEnded).toHaveBeenCalledWith('r2');
  });

  it('plays one request into the next, reporting the end of the first as the second starts', () => {
    const { instance, audios, onStarted, onEnded } = player();

    // What reading ahead does: the next sentence is queued while this one plays.
    instance.enqueue(chunk('r1'));
    instance.markEnded('r1');
    instance.enqueue(chunk('r2'));
    instance.markEnded('r2');
    // r2 is loaded and waiting, and r1 has not drained yet.
    expect(audios).toHaveLength(2);
    expect(audios[1]!.playing).toBe(false);
    expect(onEnded).not.toHaveBeenCalled();

    audios[0]!.finish();
    expect(onEnded).toHaveBeenCalledExactlyOnceWith('r1');
    expect(audios[1]!.playing).toBe(true);
    expect(onStarted).toHaveBeenNthCalledWith(2, 'r2');

    audios[1]!.finish();
    expect(onEnded).toHaveBeenLastCalledWith('r2');
  });

  it('loads the element of the next chunk before the current one ends', () => {
    const { instance, audios } = player();

    instance.enqueue(chunk('r1'));
    instance.enqueue(chunk('r1'));
    // Pointed at its audio and loading, but silent until its turn.
    expect(audios[1]!.src).not.toBe('');
    expect(audios[1]!.preload).toBe('auto');
    expect(audios[1]!.playing).toBe(false);

    audios[0]!.finish();
    // The very element that was warmed plays: nothing is created at the swap.
    expect(audios[1]!.playing).toBe(true);
    expect(audios).toHaveLength(2);
  });

  it('changes speed live, relative to the speed each chunk was synthesized at', () => {
    const { instance, audios } = player();

    instance.enqueue(chunk('r1', 1));
    instance.enqueue(chunk('r1', 1));
    instance.setRate(1.5);
    expect(audios[0]!.playbackRate).toBe(1.5);

    audios[0]!.finish();
    expect(audios[1]!.playbackRate).toBe(1.5);

    // A chunk already synthesized at 1.5 plays as is.
    instance.enqueue(chunk('r2', 1.5));
    audios[1]!.finish();
    expect(audios[2]!.playbackRate).toBe(1);
  });
});

describe('encodeWav', () => {
  it('writes a float32 mono WAV header followed by the samples', async () => {
    const blob = encodeWav(new Float32Array([0, 0.5]), 24_000);
    const view = new DataView(await blob.arrayBuffer());

    expect(blob.size).toBe(44 + 8);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getFloat32(48, true)).toBe(0.5);
  });
});
