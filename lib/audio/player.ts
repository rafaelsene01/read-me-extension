import { AudioQueue } from './queue';

export interface PlayerChunk {
  requestId: string;
  pcm: Float32Array<ArrayBuffer>;
  sampleRate: number;
  /** Speed the chunk was synthesized at; playback corrects it to the current rate. */
  rate: number;
}

/** The slice of HTMLAudioElement the player uses (injectable for tests). */
export interface AudioElementLike {
  src: string;
  playbackRate: number;
  preservesPitch: boolean;
  onended: ((event: Event) => void) | null;
  play(): Promise<void>;
  pause(): void;
}

export interface AudioPlayerDeps {
  /** First chunk of a request actually started playing. */
  onStarted: (requestId: string) => void;
  /** Synthesis finished and every queued chunk of the request was played. */
  onEnded: (requestId: string) => void;
  createAudio?: () => AudioElementLike;
  /**
   * Routes each element through Web Audio. A running AudioContext keeps the
   * output device open between sentences; otherwise the OS closes it during
   * the synthesis gap and the first syllables of the next sentence (or a
   * whole short one, like "Sim.") are lost while it reopens. Null in tests.
   */
  createContext?: (() => AudioContext) | null;
}

interface CurrentPlayback {
  requestId: string;
  audio: AudioElementLike;
  url: string;
  rate: number;
}

/** Mono 32-bit float WAV, which Chrome plays natively. */
export function encodeWav(pcm: Float32Array<ArrayBuffer>, sampleRate: number): Blob {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) =>
    [...text].forEach((char, i) => header.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, 'RIFF');
  header.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 3, true); // IEEE float
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 4, true);
  header.setUint16(32, 4, true);
  header.setUint16(34, 32, true);
  ascii(36, 'data');
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

/**
 * Plays PCM chunks in arrival order through an audio element, whose
 * playbackRate with preservesPitch changes speed live without the chipmunk
 * effect (Web Audio has no time-stretch). `ended` fires only after the worker
 * reported the request fully synthesized AND the queue drained — never on stop().
 */
export class AudioPlayer {
  private readonly deps: AudioPlayerDeps;
  private readonly queue = new AudioQueue<PlayerChunk>();
  private current: CurrentPlayback | null = null;
  private readonly started = new Set<string>();
  private readonly synthesisDone = new Set<string>();
  private rate = 1;
  private context: AudioContext | null = null;

  constructor(deps: AudioPlayerDeps) {
    this.deps = deps;
  }

  enqueue(chunk: PlayerChunk): void {
    this.queue.enqueue(chunk);
    this.pump();
  }

  /** Speed chosen by the user: applied to the chunk playing now and every queued one. */
  setRate(rate: number): void {
    this.rate = rate;
    if (this.current) this.current.audio.playbackRate = rate / this.current.rate;
  }

  /** The worker finished synthesizing this request; `ended` fires once the queue drains. */
  markEnded(requestId: string): void {
    this.synthesisDone.add(requestId);
    this.reportIfDrained(requestId);
  }

  /** Stop playback and drop queued audio; without a requestId clears everything. */
  stop(requestId?: string): void {
    if (this.current && (requestId === undefined || this.current.requestId === requestId)) {
      this.release(this.current);
      this.current = null;
    }
    this.queue.clear(requestId);
    if (requestId === undefined) {
      this.started.clear();
      this.synthesisDone.clear();
    } else {
      this.started.delete(requestId);
      this.synthesisDone.delete(requestId);
    }
    // Keep playing whatever belongs to other requests.
    this.pump();
  }

  private release(playback: CurrentPlayback): void {
    playback.audio.onended = null;
    playback.audio.pause();
    URL.revokeObjectURL(playback.url);
  }

  private pump(): void {
    if (this.current) return;
    const next = this.queue.shift();
    if (!next) return;

    const audio = this.deps.createAudio?.() ?? new Audio();
    this.route(audio);
    const url = URL.createObjectURL(encodeWav(next.pcm, next.sampleRate));
    const playback: CurrentPlayback = { requestId: next.requestId, audio, url, rate: next.rate };
    audio.src = url;
    audio.preservesPitch = true;
    audio.playbackRate = this.rate / next.rate;
    audio.onended = () => {
      this.release(playback);
      this.current = null;
      this.reportIfDrained(next.requestId);
      this.pump();
    };
    this.current = playback;
    if (!this.started.has(next.requestId)) {
      this.started.add(next.requestId);
      this.deps.onStarted(next.requestId);
    }
    audio.play().catch((err: unknown) => console.warn('[ReadMe] Falha ao tocar áudio', err));
  }

  private route(audio: AudioElementLike): void {
    if (this.deps.createContext === null || !(audio instanceof HTMLMediaElement)) return;
    try {
      this.context ??= this.deps.createContext?.() ?? new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      this.context.createMediaElementSource(audio).connect(this.context.destination);
    } catch (err) {
      // Plays straight to the speakers instead.
      console.warn('[ReadMe] Sem AudioContext', err);
    }
  }

  private reportIfDrained(requestId: string): void {
    if (!this.synthesisDone.has(requestId)) return;
    if (this.current?.requestId === requestId) return;
    if (this.queue.has(requestId)) return;
    this.synthesisDone.delete(requestId);
    this.deps.onEnded(requestId);
  }
}
