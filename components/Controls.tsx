import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, Pause, Play, Square } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import TtsModelStatus, { useModelAvailability } from './TtsModelStatus';
import TtsVoiceSelect, { type VoiceOption } from './TtsVoiceSelect';
import { sendCommand } from '../lib/messages';
import { ENGINE_IDS, getEngineDefinition, pickerVoices, pickLocalVoice } from '../lib/tts/registry';
import type { TtsEngineId, TtsRuntimeStatus } from '../lib/tts/types';
import { listVoices, pickVoice } from '../lib/voices';
import type { Prefs, Voice } from '../lib/types';

interface ControlsProps {
  playing: boolean;
  prefs: Prefs;
  /** Model status of the selected neural engine, from the background. */
  tts: TtsRuntimeStatus | null | undefined;
  /** Language of the original text of the active block. */
  lang: string;
  /** Language the active block is translated into. */
  translationLang: string;
  empty: boolean;
  /** Estimated reading time at the current speed, shown under the speed slider. */
  readingTime?: string | null;
  /** Extra buttons between the speed and the minimize button. */
  actions?: ReactNode;
  /** Collapsed: only play/pause, the speed and the estimate stay. */
  minimized?: boolean;
  /** Omitted: no minimize button, and the bar is always whole. */
  onToggleMinimized?: () => void;
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
  tts,
  lang,
  translationLang,
  empty,
  readingTime,
  actions,
  minimized = false,
  onToggleMinimized,
}: ControlsProps) {
  const [voices, setVoices] = useState<Voice[]>([]);

  useEffect(() => {
    void listVoices().then(setVoices);
  }, []);

  // The voice follows the tab being read. voiceByLang is keyed by language, so
  // a manual choice made on one tab survives switching to the other and back.
  const voiceLang = prefs.activeTab === 'translation' ? translationLang : lang;
  const engine = prefs.ttsEngine;
  const voice = pickVoice(voices, voiceLang, prefs.voiceByLang);
  const localVoices = engine === 'system' ? [] : pickerVoices(engine, voiceLang);
  const localVoice =
    engine === 'system' ? null : pickLocalVoice(engine, voiceLang, prefs.voiceByEngine[engine]);
  // A neural voice reads only once its model is downloaded; the status below offers the download.
  const model = useModelAvailability(engine, tts);
  const blocked =
    empty || (engine === 'system' ? voice === null : localVoice === null || !model.available);

  // Voices of the language being read first, then the rest alphabetically.
  const base = voiceLang.split('-')[0]!.toLowerCase();
  const sorted = [...voices].sort(
    (a, b) =>
      Number(!a.lang.toLowerCase().startsWith(base)) -
        Number(!b.lang.toLowerCase().startsWith(base)) ||
      a.voiceName.localeCompare(b.voiceName),
  );
  const voiceOptions: VoiceOption[] =
    engine === 'system'
      ? sorted.map((option) => ({
          id: option.voiceName,
          name: option.voiceName,
          detail: option.lang,
          group: option.remote ? 'Online' : 'Neste dispositivo',
        }))
      : localVoices.map((option) => ({
          id: option.id,
          name: option.name,
          detail: option.lang === '*' ? option.id : option.lang,
          group: option.lang === '*' ? 'Vozes' : languageName(option.lang),
          ...(option.avatar ? { avatar: option.avatar } : {}),
        }));

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
          {!minimized && (
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
          )}

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
              max={2}
              step={0.1}
              value={[prefs.rate]}
              // Live while dragging; the release lets chrome.tts restart the sentence.
              onValueChange={([rate]) => {
                if (rate !== undefined) void sendCommand({ type: 'setRate', rate, commit: false });
              }}
              onValueCommit={([rate]) => {
                if (rate !== undefined) void sendCommand({ type: 'setRate', rate, commit: true });
              }}
            />
            {readingTime && (
              <span className="text-xs text-muted-foreground">Leitura estimada: {readingTime}</span>
            )}
          </div>

          {actions}

          {onToggleMinimized && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={!minimized}
              aria-label={minimized ? 'Expandir controles' : 'Minimizar controles'}
              onClick={onToggleMinimized}
            >
              {minimized ? <ChevronUp /> : <ChevronDown />}
            </Button>
          )}
        </div>

        {/* Side by side where there is room (documents page); stacked in the narrow side panel. */}
        <div className={cn('grid gap-2 sm:grid-cols-2', minimized && 'hidden')}>
          <Select
            value={engine}
            onValueChange={(value) =>
              void sendCommand({ type: 'setTtsEngine', engine: value as TtsEngineId })
            }
          >
            <SelectTrigger aria-label="Motor de voz" className="w-full">
              <SelectValue placeholder="Motor de voz" />
            </SelectTrigger>
            <SelectContent>
              {ENGINE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {getEngineDefinition(id).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TtsVoiceSelect
            engine={engine}
            options={voiceOptions}
            value={engine === 'system' ? voice?.voiceName : localVoice?.id}
            favorites={prefs.favoriteVoices}
            onChange={(voiceName) => void sendCommand({ type: 'setVoice', lang: voiceLang, voiceName })}
          />
        </div>

        {!minimized && engine !== 'system' && <TtsModelStatus engine={engine} model={model} />}

        {!minimized && engine === 'system' && voices.length === 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>Nenhuma voz disponível neste navegador</AlertDescription>
          </Alert>
        )}
        {!minimized && engine === 'system' && voices.length > 0 && voice === null && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>Sem voz instalada para {languageName(voiceLang)}</AlertDescription>
          </Alert>
        )}
        {!minimized && engine !== 'system' && localVoice === null && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              {getEngineDefinition(engine).label} não tem voz de {languageName(voiceLang)}. Escolha
              uma voz de outro idioma ou outro motor.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
