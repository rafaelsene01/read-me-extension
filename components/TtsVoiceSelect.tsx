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
  name: string;
  /** Secondary text: language or preset id. */
  detail: string;
  group: string;
  /** Character image; system voices fall back to an initial. */
  avatar?: string;
}

interface TtsVoiceSelectProps {
  engine: TtsEngineId;
  options: VoiceOption[];
  value: string | undefined;
  favorites: string[];
  onChange: (id: string) => void;
}

const FAVORITES = 'Favoritas';
/** Long lists (system voices) get a search box. */
const SEARCH_FROM = 8;

/** Initial for the fallback, skipping the vendor prefix of system voices. */
function initial(name: string): string {
  return name.replace(/^(Microsoft|Google|Apple)\s+/i, '').charAt(0).toUpperCase();
}

function VoiceAvatar({ option }: { option: VoiceOption }) {
  return (
    <Avatar className="size-6 bg-muted">
      {option.avatar && <AvatarImage src={option.avatar} alt="" />}
      <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
        {initial(option.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Voice picker shared by every engine: avatar + name, starred voices on top.
 * Each row has its own star; favorites live in prefs as `${engine}:${id}`.
 */
export default function TtsVoiceSelect({ engine, options, value, favorites, onChange }: TtsVoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const key = (id: string) => `${engine}:${id}`;
  const selected = options.find((option) => option.id === value);

  const groups = new Map<string, VoiceOption[]>();
  for (const option of options) {
    const group = favorites.includes(key(option.id)) ? FAVORITES : option.group;
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  const ordered = [...groups].sort(([a], [b]) => Number(b === FAVORITES) - Number(a === FAVORITES));

  const toggleFavorite = (id: string): void => {
    const favorite = favorites.includes(key(id));
    void setPrefs({
      favoriteVoices: favorite ? favorites.filter((item) => item !== key(id)) : [...favorites, key(id)],
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Voz"
          disabled={options.length === 0}
          className="w-full justify-between px-2"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <VoiceAvatar option={selected} />
              <span className="truncate">{selected.name}</span>
              <span className="text-xs text-muted-foreground">{selected.detail}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Voz</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          {options.length >= SEARCH_FROM && <CommandInput placeholder="Buscar voz…" />}
          <CommandList>
            <CommandEmpty>Nenhuma voz encontrada</CommandEmpty>
            {ordered.map(([label, items]) => (
              <CommandGroup key={label} heading={label}>
                {items.map((option) => {
                  const favorite = favorites.includes(key(option.id));
                  return (
                    <CommandItem
                      key={option.id}
                      value={`${option.name} ${option.detail} ${option.id}`}
                      onSelect={() => {
                        onChange(option.id);
                        setOpen(false);
                      }}
                    >
                      <VoiceAvatar option={option} />
                      <span className="truncate">{option.name}</span>
                      <span className="text-xs text-muted-foreground">{option.detail}</span>
                      <Check className={cn('ml-auto', option.id === value ? 'opacity-100' : 'opacity-0')} />
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
                          toggleFavorite(option.id);
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
