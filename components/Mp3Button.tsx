import { useEffect, useRef, useState } from 'react';
import { CircleAlert, FileAudio } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { languageName } from './Controls';
import { saveAudio } from '../lib/audio-library';
import { viewOf } from '../lib/engine';
import { exportAudio, type ExportJob, type TtsHostPort } from '../lib/tts/export';
import { getEngineDefinition, pickLocalVoice } from '../lib/tts/registry';
import type { LocalEngineId } from '../lib/tts/types';
import type { WorkerEvent } from '../lib/tts/worker-protocol';
import type { Block, Prefs } from '../lib/types';
// Explicit ?worker&url, same reason as in the offscreen document.
import ttsWorkerUrl from '../entrypoints/offscreen/tts-worker.ts?worker&url';

interface Mp3ButtonProps {
  blocks: Block[];
  prefs: Prefs;
  /** Icon only, for the transport bar: the progress and the error go in the tooltip. */
  compact?: boolean;
}

/**
 * A dedicated worker of this page, independent of the offscreen document, so
 * the reading in progress is never touched. Under `wxt dev` Chrome refuses the
 * worker script (other origin): the host then runs in the page.
 */
function startHost(engine: LocalEngineId): { port: TtsHostPort; dispose: () => void } {
  // Settles a pending exportAudio when the page closes mid-generation.
  const cancelled: WorkerEvent = {
    type: 'status',
    engine,
    status: 'error',
    error: 'Geração do MP3 cancelada',
  };
  try {
    const worker = new Worker(ttsWorkerUrl, { type: 'module' });
    const listeners = new Set<(event: WorkerEvent) => void>();
    return {
      port: {
        post: (command) => worker.postMessage(command),
        subscribe: (listener) => {
          const onMessage = (event: MessageEvent<WorkerEvent>) => listener(event.data);
          const onError = (event: ErrorEvent) =>
            listener({
              type: 'status',
              engine,
              status: 'error',
              error: `Falha ao iniciar o motor neural: ${event.message}`,
            });
          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', onError);
          listeners.add(listener);
          return () => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            listeners.delete(listener);
          };
        },
      },
      dispose: () => {
        listeners.forEach((listener) => listener(cancelled));
        worker.terminate();
      },
    };
  } catch (err) {
    if (!import.meta.env.DEV) throw err;
    const listeners = new Set<(event: WorkerEvent) => void>();
    const host = import('../lib/tts/local/host').then(({ createTtsHost }) =>
      createTtsHost((event) => listeners.forEach((listener) => listener(event))),
    );
    return {
      port: {
        post: (command) => void host.then((handle) => handle(command)),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      // ponytail: the in-page host keeps its model until the page closes; dev only.
      dispose: () => listeners.forEach((listener) => listener(cancelled)),
    };
  }
}

/** One job per paragraph of the active tab, or the message of a language without voice. */
function buildJobs(blocks: Block[], prefs: Prefs, engine: LocalEngineId): ExportJob[] | string {
  const jobs: ExportJob[] = [];
  for (const block of viewOf(blocks, prefs.activeTab)) {
    const voice = pickLocalVoice(engine, block.lang, prefs.voiceByEngine[engine]);
    if (!voice) {
      return `${getEngineDefinition(engine).label} não tem voz de ${languageName(block.lang)}`;
    }
    for (const paragraph of block.paragraphs) {
      const text = paragraph.sentences.map((sentence) => sentence.text).join(' ');
      if (text.trim()) {
        jobs.push({ text, options: { lang: block.lang, rate: prefs.rate, voiceId: voice.id } });
      }
    }
  }
  return jobs;
}

function download(blob: Blob, title: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const name = title.replace(/\.(txt|md)$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  link.download = `${name || 'documento'}.mp3`;
  link.click();
  // Revoking right away can abort the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function Mp3Button({ blocks, prefs, compact }: Mp3ButtonProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dispose = useRef<(() => void) | null>(null);

  useEffect(() => () => dispose.current?.(), []);

  const engine = prefs.ttsEngine;
  const system = engine === 'system';
  const busy = progress !== null;

  async function generate(engine: LocalEngineId): Promise<void> {
    setError(null);
    const jobs = buildJobs(blocks, prefs, engine);
    if (typeof jobs === 'string') {
      setError(jobs);
      return;
    }
    setProgress(0);
    try {
      const host = startHost(engine);
      dispose.current = host.dispose;
      const blob = await exportAudio(host.port, engine, jobs, (fraction) =>
        setProgress(Math.round(fraction * 100)),
      );
      const name = blocks[0]!.sourceTitle;
      // A copy stays in the Áudio section; the download is the same blob.
      await saveAudio(name, blob);
      download(blob, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      dispose.current?.();
      dispose.current = null;
      setProgress(null);
    }
  }

  const hint = system
    ? 'Escolha uma voz neural para gerar MP3'
    : busy
      ? `Gerando MP3: ${progress}%`
      : (error ?? 'Gerar MP3');

  const button = compact ? (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={hint}
      disabled={system || busy || blocks.length === 0}
      onClick={() => {
        if (engine !== 'system') void generate(engine);
      }}
    >
      {busy ? (
        <span className="text-[10px] font-medium tabular-nums">{progress}</span>
      ) : (
        <FileAudio />
      )}
    </Button>
  ) : (
    <Button
      variant="outline"
      disabled={system || busy || blocks.length === 0}
      onClick={() => {
        if (engine !== 'system') void generate(engine);
      }}
    >
      <FileAudio />
      MP3
    </Button>
  );

  // A disabled button fires no pointer events: the span carries the tooltip.
  const wrapped =
    system || compact ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={system ? 0 : -1} className="w-fit">
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    ) : (
      button
    );

  if (compact) return wrapped;

  return (
    <div className="flex flex-col gap-2">
      {wrapped}
      {busy && (
        <div className="flex items-center gap-2">
          <Progress aria-label="Progresso do MP3" value={progress} />
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
