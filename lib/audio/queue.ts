/**
 * FIFO of decoded chunks tagged by request id, so audio synthesized for a
 * previous speak (seek, stop, engine switch) can never leak into the current
 * one.
 */
export class AudioQueue<T extends { requestId: string }> {
  private chunks: T[] = [];

  enqueue(chunk: T): void {
    this.chunks.push(chunk);
  }

  shift(): T | undefined {
    return this.chunks.shift();
  }

  has(requestId: string): boolean {
    return this.chunks.some((chunk) => chunk.requestId === requestId);
  }

  /** Without a requestId clears everything. */
  clear(requestId?: string): void {
    if (requestId === undefined) {
      this.chunks = [];
    } else {
      this.chunks = this.chunks.filter((chunk) => chunk.requestId !== requestId);
    }
  }

  get size(): number {
    return this.chunks.length;
  }
}
