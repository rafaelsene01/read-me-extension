import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, CircleAlert, Pause, Play, Square } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import TtsModelStatus, { useModelAvailability } from './TtsModelStatus';
import TtsVoiceSelect, { voiceKey, type VoiceOption } from './TtsVoiceSelect';
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
  /** Collapsed: the transport line stays; the model status and the alerts go. */
  minimized?: boolean;
  /** Omitted: no minimize button, and the bar is always whole. */
  onToggleMinimized?: () => void;
}

/**
 * Heading a voice is listed under: the system voices are the free tier, the
 * engines that synthesize on the machine are the pro one. An engine whose
 * voices carry no language of their own (Supertonic) reads every language it
 * supports, which is what the list calls it.
 */
function groupLabel(engine: TtsEngineId, multilingual: boolean): string {
  const { label, local } = getEngineDefinition(engine);
  return `${local ? 'Pro' : 'Grátis'} · ${label}${multilingual ? ' · Multilinguagem' : ''}`;
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
  // One list for every engine, in the order of ENGINE_IDS: the free system
  // voices, then Kokoro, then Supertonic. Picking a voice switches to its engine.
  const voiceOptions: VoiceOption[] = ENGINE_IDS.flatMap<VoiceOption>((id) =>
    id === 'system'
      ? sorted.map((option) => ({
          id: option.voiceName,
          engine: id,
          name: option.voiceName,
          detail: option.remote ? `${option.lang} · online` : option.lang,
          group: groupLabel(id, false),
        }))
      : pickerVoices(id, voiceLang).map((option) => ({
          id: option.id,
          engine: id,
          name: option.name,
          detail: option.lang === '*' ? option.id : languageName(option.lang),
          group: groupLabel(id, option.lang === '*'),
          ...(option.avatar ? { avatar: option.avatar } : {}),
        })),
  );

  const selectedVoiceId = engine === 'system' ? voice?.voiceName : localVoice?.id;

  return (
    <Card className="gap-4 border bg-card py-4">
      <CardContent className="flex flex-col gap-4 px-4">
        {/* The transport line: voice, play/pause, stop, speed, the extra actions
            and the minimize button, always on one line and never collapsed —
            minimizing only puts away what sits under it. */}
        <div className="flex items-center gap-3">
          <TtsVoiceSelect
            options={voiceOptions}
            value={selectedVoiceId ? voiceKey(engine, selectedVoiceId) : undefined}
            favorites={prefs.favoriteVoices}
            onChange={(option) =>
              void sendCommand({
                type: 'setVoice',
                lang: voiceLang,
                voiceName: option.id,
                engine: option.engine,
              })
            }
          />
          <Button
            size="icon-lg"
            className={cn('size-12 rounded-full', playing && 'animate-playing')}
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

          <div className="flex min-w-0 flex-1 flex-col gap-2">
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
              <span className="truncate text-xs text-muted-foreground">
                Leitura estimada: {readingTime}
              </span>
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
