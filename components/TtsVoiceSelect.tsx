import { useState } from 'react';
import { Check, ChevronsUpDown, Star } from 'lucide-react';
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
  /** Character image; system voices fall back to an initial. */
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

const FAVORITES = 'Favoritas';
/** Long lists (system voices) get a search box. */
const SEARCH_FROM = 8;

/** Key of a voice in prefs (favourites) and of the selection: engine plus id. */
export function voiceKey(engine: TtsEngineId, id: string): string {
  return `${engine}:${id}`;
}

/** Initial for the fallback, skipping the vendor prefix of system voices. */
function initial(name: string): string {
  return name.replace(/^(Microsoft|Google|Apple)\s+/i, '').charAt(0).toUpperCase();
}

function VoiceAvatar({ option, className }: { option: VoiceOption; className?: string }) {
  return (
    <Avatar className={cn('size-6 bg-muted', className)}>
      {option.avatar && <AvatarImage src={option.avatar} alt="" />}
      <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
        {initial(option.name)}
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
          aria-label={selected ? `Voz: ${selected.name}` : 'Voz'}
          aria-busy={loading}
          title={
            loading
              ? `Preparando ${selected?.name ?? 'a voz'}…`
              : selected
                ? `${selected.name} · ${selected.detail}`
                : 'Voz'
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
          {options.length >= SEARCH_FROM && <CommandInput placeholder="Buscar voz…" />}
          <CommandList>
            <CommandEmpty>Nenhuma voz encontrada</CommandEmpty>
            {ordered.map(([label, items]) => (
              <CommandGroup key={label} heading={label}>
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
                      <span className="truncate">{option.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{option.detail}</span>
                      <Check className={cn('ml-auto', key === value ? 'opacity-100' : 'opacity-0')} />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={favorite}
                        aria-label={favorite ? `Remover ${option.name} dos favoritos` : `Favoritar ${option.name}`}
                        title={favorite ? 'Remover dos favoritos' : 'Favoritar'}
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
