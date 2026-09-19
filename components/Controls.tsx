import { useEffect, useState } from 'react';
import { CircleAlert, Pause, Play, Square } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { sendCommand } from '../lib/messages';
import { listVoices, pickVoice } from '../lib/voices';
import type { Prefs, Voice } from '../lib/types';

interface ControlsProps {
  playing: boolean;
  prefs: Prefs;
  /** Language of the original text of the active block. */
  lang: string;
  /** Language the active block is translated into. */
  translationLang: string;
  empty: boolean;
}

export function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames([navigator.language], { type: 'language' }).of(lang) ?? lang;
  } catch {
    // The page can declare anything in documentElement.lang.
    return lang;
  }
}

export default function Controls({
  playing,
  prefs,
  lang,
  translationLang,
  empty,
}: ControlsProps) {
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    void listVoices().then(setVoices);
  }, []);

  // The voice follows the tab being read. voiceByLang is keyed by language, so
  // a manual choice made on one tab survives switching to the other and back.
  const voiceLang = prefs.activeTab === 'translation' ? translationLang : lang;
  const voice = pickVoice(voices, voiceLang, prefs.voiceByLang);
  const blocked = empty || voice === null;

  // Voices of the language being read first, then the rest alphabetically.
  const base = voiceLang.split('-')[0]!.toLowerCase();
  const sorted = [...voices].sort(
    (a, b) =>
      Number(!a.lang.toLowerCase().startsWith(base)) -
        Number(!b.lang.toLowerCase().startsWith(base)) ||
      a.voiceName.localeCompare(b.voiceName),
  );
  const groups = [
    { label: 'Neste dispositivo', options: sorted.filter((option) => !option.remote) },
    { label: 'Online', options: sorted.filter((option) => option.remote) },
  ];

  return (
    <Card className="gap-4 py-4">
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="flex items-center gap-3">
          <Button
            size="icon-lg"
            className="size-12 rounded-full shadow-md"
            aria-label={playing ? 'Pausar' : 'Ler'}
            disabled={blocked}
            onClick={() => void sendCommand({ type: playing ? 'pause' : 'play' })}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            aria-label="Parar"
            disabled={blocked}
            onClick={() => void sendCommand({ type: 'stop' })}
          >
            <Square className="size-3.5" />
          </Button>

          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span id="rate-label">Velocidade</span>
              <Badge variant="secondary" className="tabular-nums">
                {prefs.rate.toFixed(1)}x
              </Badge>
            </div>
            <Slider
              aria-labelledby="rate-label"
              min={0.5}
              max={3}
              step={0.1}
              value={[prefs.rate]}
              onValueChange={([rate]) => {
                if (rate !== undefined) void sendCommand({ type: 'setRate', rate });
              }}
            />
          </div>
        </div>

        <Select
          disabled={voices.length === 0}
          value={voice?.voiceName}
          onValueChange={(voiceName) =>
            void sendCommand({ type: 'setVoice', lang: voiceLang, voiceName })
          }
        >
          <SelectTrigger aria-label="Voz" className="w-full">
            <SelectValue placeholder="Voz" />
          </SelectTrigger>
          <SelectContent>
            {groups.map(
              ({ label, options }) =>
                options.length > 0 && (
                  <SelectGroup key={label}>
                    <SelectLabel>{label}</SelectLabel>
                    {options.map((option) => (
                      <SelectItem key={option.voiceName} value={option.voiceName}>
                        {option.voiceName} ({option.lang})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ),
            )}
          </SelectContent>
        </Select>

        {voices.length === 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>Nenhuma voz disponível neste navegador</AlertDescription>
          </Alert>
        )}
        {voices.length > 0 && voice === null && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>Sem voz instalada para {languageName(voiceLang)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
