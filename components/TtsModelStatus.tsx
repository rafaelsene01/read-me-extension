import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { sendCommand } from '../lib/messages';
import { deleteModel, getModelStatus, MODELS, type ModelInstallStatus } from '../lib/tts/model-cache';
import type { LocalEngineId, TtsEngineId, TtsRuntimeStatus } from '../lib/tts/types';

export interface ModelAvailability {
  /** Runtime status of this engine, if the background reported one. */
  runtime: TtsRuntimeStatus | undefined;
  install: ModelInstallStatus | null;
  /** Downloaded (or loaded in memory): reading can start. */
  available: boolean;
  refresh: () => void;
}

/**
 * Whether the selected neural model can be used. Reads the model cache
 * directly — the side panel shares the extension origin with the worker that
 * fills it — and re-reads when the runtime status changes (a finished load
 * marks the model installed). The system voice is always available.
 */
export function useModelAvailability(
  engine: TtsEngineId,
  tts: TtsRuntimeStatus | null | undefined,
): ModelAvailability {
  const [install, setInstall] = useState<ModelInstallStatus | null>(null);
  const [version, setVersion] = useState(0);
  const runtime = tts?.engine === engine ? tts : undefined;

  useEffect(() => {
    setInstall(null);
    if (engine === 'system') return;
    let current = true;
    void getModelStatus(engine).then((status) => {
      if (current) setInstall(status);
    });
    return () => {
      current = false;
    };
  }, [engine, runtime?.status, version]);

  return {
    runtime,
    install,
    available: engine === 'system' || install?.installed === true || runtime?.status === 'ready',
    refresh: () => setVersion((value) => value + 1),
  };
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

interface TtsModelStatusProps {
  engine: LocalEngineId;
  model: ModelAvailability;
}

/**
 * Where the selected neural voice stands: the download offer, its progress,
 * initialization, generation, backend in use, plus the ways out (remove the
 * model, go back to the system voice).
 */
export default function TtsModelStatus({ engine, model }: TtsModelStatusProps) {
  const { runtime, install } = model;
  const busy = runtime?.status === 'downloading' || runtime?.status === 'loading';

  const remove = async (): Promise<void> => {
    await deleteModel(engine);
    model.refresh();
  };

  let line: string;
  switch (runtime?.status) {
    case 'downloading':
      line = `Baixando voz neural… ${Math.round((runtime.progress ?? 0) * 100)}%`;
      break;
    case 'loading':
      line = 'Inicializando modelo…';
      break;
    case 'ready':
      line = runtime.generating ? 'Gerando áudio…' : 'Pronto';
      break;
    case 'error':
      line = 'Falha ao carregar';
      break;
    default:
      line = install?.installed ? `Instalado · ${formatBytes(install.sizeBytes)}` : 'Modelo não baixado';
  }

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="flex-1" aria-live="polite">
          {line}
        </span>
        {runtime?.backend && (
          <Badge variant="outline">{runtime.backend === 'webgpu' ? 'WebGPU' : 'WASM'}</Badge>
        )}
        {install?.installed && !busy && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remover modelo baixado"
            title={`Remover modelo (${formatBytes(install.sizeBytes)})`}
            onClick={() => void remove()}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {install !== null && !model.available && !busy && (
        <Button
          size="sm"
          onClick={() => void sendCommand({ type: 'downloadTtsModel', engine })}
        >
          <Download />
          Baixar modelo ({MODELS[engine].downloadSize})
        </Button>
      )}

      {busy && (
        <Progress
          aria-label="Progresso do download"
          value={runtime?.status === 'downloading' ? (runtime.progress ?? 0) * 100 : 100}
        />
      )}

      {runtime?.status === 'error' && runtime.error && (
        <p className="text-destructive break-words">{runtime.error}</p>
      )}

      {runtime?.status === 'error' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void sendCommand({ type: 'setTtsEngine', engine: 'system' })}
        >
          Trocar para Voz do sistema
        </Button>
      )}
    </div>
  );
}
