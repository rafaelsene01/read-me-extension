import { describe, expect, it } from 'vitest';
import { AudioQueue } from './queue';

function audio(): Float32Array {
  return new Float32Array(1);
}

describe('AudioQueue', () => {
  it('dequeues in FIFO order', () => {
    const queue = new AudioQueue<{ requestId: string; buffer: Float32Array }>();
    queue.enqueue({ requestId: 'a', buffer: audio() });
    queue.enqueue({ requestId: 'b', buffer: audio() });

    expect(queue.shift()?.requestId).toBe('a');
    expect(queue.shift()?.requestId).toBe('b');
    expect(queue.shift()).toBeUndefined();
  });

  it('clears only the requested id when one is given', () => {
    const queue = new AudioQueue<{ requestId: string; buffer: Float32Array }>();
    queue.enqueue({ requestId: 'a', buffer: audio() });
    queue.enqueue({ requestId: 'b', buffer: audio() });
    queue.enqueue({ requestId: 'a', buffer: audio() });

    queue.clear('a');

    expect(queue.size).toBe(1);
    expect(queue.shift()?.requestId).toBe('b');
  });

  it('clears everything without a requestId', () => {
    const queue = new AudioQueue<{ requestId: string; buffer: Float32Array }>();
    queue.enqueue({ requestId: 'a', buffer: audio() });
    queue.enqueue({ requestId: 'b', buffer: audio() });

    queue.clear();

    expect(queue.size).toBe(0);
  });

  it('reports whether a request still has queued chunks', () => {
    const queue = new AudioQueue<{ requestId: string; buffer: Float32Array }>();
    queue.enqueue({ requestId: 'a', buffer: audio() });

    expect(queue.has('a')).toBe(true);
    expect(queue.has('b')).toBe(false);
  });
});
