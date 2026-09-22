import { useEffect, useState } from 'react';
import { Download, FileAudio, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteAudio, getAudios, loadAudio, type AudioTrack } from '../lib/audio-library';
import { getLocale, t } from '../lib/i18n';

/** Size in the unit that keeps it to one or two digits. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function AudioList() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  /** Object URLs handed to the players, revoked when the list changes. */
  const [sources, setSources] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AudioTrack | null>(null);

  useEffect(() => {
    const load = (): void => {
      void getAudios().then(setTracks);
    };
    load();
    // Generating an MP3 happens elsewhere on the page, so follow the store.
    chrome.storage.local.onChanged.addListener(load);
    return () => chrome.storage.local.onChanged.removeListener(load);
  }, []);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];

    void (async () => {
      const entries: [string, string][] = [];
      for (const track of tracks) {
        const blob = await loadAudio(track.id);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        made.push(url);
        entries.push([track.id, url]);
      }
      if (!alive) return;
      setSources(Object.fromEntries(entries));
    })();

    return () => {
      alive = false;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [tracks]);

  function download(track: AudioTrack): void {
    const url = sources[track.id];
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${track.name}.mp3`;
    link.click();
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
          <FileAudio className="size-5" />
        </span>
        <p className="font-serif text-base">{t('Nenhum áudio gerado. Use o botão MP3 na barra de leitura.')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {tracks.map((track) => (
          <li key={track.id}>
            <Card className="flex-row items-center gap-3 border bg-card p-3">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{track.name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(track.createdAt).toLocaleString(getLocale())} · {megabytes(track.size)}
                </span>
              </span>
              {/* The native player: nothing about playback is worth rebuilding. */}
              <audio controls preload="none" src={sources[track.id]} className="h-9 max-w-xs" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Baixar {name}', { name: track.name })}
                    disabled={!sources[track.id]}
                    onClick={() => download(track)}
                  >
                    <Download />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Baixar')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Excluir {name}', { name: track.name })}
                    onClick={() => setPendingDelete(track)}
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Excluir')}</TooltipContent>
              </Tooltip>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Excluir áudio?')}</DialogTitle>
            <DialogDescription>
              {t('"{name}" será removido. O documento continua na biblioteca.', {
                name: pendingDelete?.name ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t('Cancelar')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const track = pendingDelete;
                setPendingDelete(null);
                if (track) void deleteAudio(track.id);
              }}
            >
              {t('Excluir')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
