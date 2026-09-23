import { useState } from 'react';
import { AudioLines, Check, ChevronsUpDown, Star } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { setPrefs } from '../lib/storage';
import { t } from '../lib/i18n';
import type { TtsEngineId } from '../lib/tts/types';

export interface VoiceOption {
  /** Value stored in prefs (system voice name or local voice id). */
  id: string;
  /** Engine the voice belongs to; picking it also selects that engine. */
  engine: TtsEngineId;
  name: string;
  /** Secondary text: language or preset id. */
  detail: string;
  group: string;
  /** Character image; system voices fall back to a sound-wave icon. */
  avatar?: string;
}

interface TtsVoiceSelectProps {
  options: VoiceOption[];
  /** The model of the selected voice is downloading or starting up. */
  loading?: boolean;
  /** Selected voice as `${engine}:${id}`; ids repeat across engines. */
  value: string | undefined;
  favorites: string[];
  onChange: (option: VoiceOption) => void;
}

/** Group key of the starred voices; its heading is translated. */
const FAVORITES = 'Favoritas';
/** Long lists (system voices) get a search box. */
const SEARCH_FROM = 8;

/** Key of a voice in prefs (favourites) and of the selection: engine plus id. */
export function voiceKey(engine: TtsEngineId, id: string): string {
  return `${engine}:${id}`;
}

function VoiceAvatar({ option, className }: { option: VoiceOption; className?: string }) {
  return (
    <Avatar className={cn('size-6 bg-muted', className)}>
      {option.avatar && <AvatarImage src={option.avatar} alt="" />}
      {/* System voices have no face: a sound wave says "voice" where a lone
          initial ("P" for "Google português") read as a placeholder. */}
      <AvatarFallback className="bg-primary/15 text-primary">
        <AudioLines className="size-[55%] text-primary" />
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The one voice picker: every engine in a single list, free (the system voices)
 * before the pro ones, starred voices on top. Each row has its own star;
 * favorites live in prefs as `${engine}:${id}`, which is also how the selected
 * voice is identified.
 */
export default function TtsVoiceSelect({
  options,
  value,
  favorites,
  loading = false,
  onChange,
}: TtsVoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => voiceKey(option.engine, option.id) === value);

  // Insertion order is the order the caller built the options in (free, then
  // pro); only the favorites are lifted out of it.
  const groups = new Map<string, VoiceOption[]>();
  for (const option of options) {
    const group = favorites.includes(voiceKey(option.engine, option.id)) ? FAVORITES : option.group;
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  const ordered = [...groups].sort(([a], [b]) => Number(b === FAVORITES) - Number(a === FAVORITES));

  const toggleFavorite = (option: VoiceOption): void => {
    const key = voiceKey(option.engine, option.id);
    const favorite = favorites.includes(key);
    void setPrefs({
      favoriteVoices: favorite ? favorites.filter((item) => item !== key) : [...favorites, key],
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Just the face of the voice: the name and its group are one press away. */}
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          role="combobox"
          aria-expanded={open}
          aria-label={selected ? t('Voz: {name}', { name: selected.name }) : t('Voz')}
          aria-busy={loading}
          title={
            loading
              ? t('Preparando {name}…', { name: selected?.name ?? t('Voz') })
              : selected
                ? `${selected.name} · ${selected.detail}`
                : t('Voz')
          }
          disabled={options.length === 0}
          className="relative size-10 shrink-0 rounded-full p-0"
        >
          {selected ? (
            <VoiceAvatar option={selected} className={cn('size-8', loading && 'opacity-50')} />
          ) : (
            <ChevronsUpDown className="opacity-50" />
          )}
          {/* The model is being fetched or started: a ring turning around the
              face of the voice, right where the user is looking. */}
          {loading && (
            <span
              aria-hidden
              className="absolute inset-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          {options.length >= SEARCH_FROM && <CommandInput placeholder={t('Buscar voz…')} />}
          <CommandList>
            <CommandEmpty>{t('Nenhuma voz encontrada')}</CommandEmpty>
            {ordered.map(([label, items]) => (
              <CommandGroup key={label} heading={label === FAVORITES ? t('Favoritas') : label}>
                {items.map((option) => {
                  const key = voiceKey(option.engine, option.id);
                  const favorite = favorites.includes(key);
                  return (
                    <CommandItem
                      key={key}
                      // The group is searchable too: "kokoro" finds its voices.
                      value={`${option.name} ${option.detail} ${option.group} ${option.id}`}
                      onSelect={() => {
                        onChange(option);
                        setOpen(false);
                      }}
                    >
                      <VoiceAvatar option={option} />
                      {/* Name over detail: side by side, a narrow panel cut both. */}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{option.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
                      </span>
                      <Check className={cn('ml-auto', key === value ? 'opacity-100' : 'opacity-0')} />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={favorite}
                        aria-label={
                          favorite
                            ? t('Remover {name} dos favoritos', { name: option.name })
                            : t('Favoritar {name}', { name: option.name })
                        }
                        title={t(favorite ? 'Remover dos favoritos' : 'Favoritar')}
                        // The row selects on click; the star must not.
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(option);
                        }}
                      >
                        <Star className={favorite ? 'fill-primary text-primary' : undefined} />
                      </Button>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
