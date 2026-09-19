import { useEffect, useState } from 'react';
import { CircleAlert, Languages } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MESSAGES } from './CaptureBar';
import { languageName } from './Controls';
import { segmentBlock } from '../lib/segment';
import { setBlocks, setPrefs } from '../lib/storage';
import { availability, hashText, translateBlock, translationSupport } from '../lib/translate';
import type { Availability } from '../lib/translate';
import type { Block, Prefs } from '../lib/types';

/** Languages offered in the source and target selects; names from Intl.DisplayNames. */
export const LANGS = ['pt-BR', 'pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'zh'];

interface TranslatePanelProps {
  blocks: Block[];
  prefs: Prefs;
}

function startTransition(apply: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) doc.startViewTransition(apply);
  else apply();
}

export default function TranslatePanel({ blocks, prefs }: TranslatePanelProps) {
  const [pairState, setPairState] = useState<Availability>('available');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = translationSupport() === 'ok';
  const sourceLang = blocks[0]?.lang ?? navigator.language;

  useEffect(() => {
    if (!supported) return;
    void availability(sourceLang, prefs.targetLang).then(setPairState);
  }, [supported, sourceLang, prefs.targetLang]);

  const unavailablePair = supported && pairState === 'unavailable';
  const blocked = !supported || unavailablePair || blocks.length === 0 || progress !== null;

  function translate(): void {
    setError(null);
    setProgress(0);
    const target = prefs.targetLang;
    // Every create fires in this same task, with nothing awaited first, so the
    // click still authorizes the language-pack download.
    const jobs = blocks.map((block) => translateBlock(block, target, setProgress));

    void Promise.all(jobs)
      .then(async (texts) => {
        const result = await setBlocks(
          blocks.map((block, index) => {
            const text = texts[index];
            if (text === undefined) return block;
            return {
              ...block,
              translation: {
                target,
                text,
                paragraphs: segmentBlock(text, target, `${block.id}#t`),
                sourceTextHash: hashText(block.text),
              },
            };
          }),
        );
        if (!result.ok) setError(MESSAGES.quota);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Falha na tradução'),
      )
      .finally(() => setProgress(null));
  }

  const alerts = [
    !supported && 'Tradução não suportada neste navegador',
    unavailablePair && 'Par de idiomas não disponível',
    error,
  ].filter((text): text is string => Boolean(text));

  return (
    <section className="flex flex-col gap-2">
      <Tabs
        value={prefs.activeTab}
        onValueChange={(tab) =>
          startTransition(() => void setPrefs({ activeTab: tab as Prefs['activeTab'] }))
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="original">Original</TabsTrigger>
          <TabsTrigger value="translation">Tradução</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Select
          value={prefs.targetLang}
          onValueChange={(targetLang) => void setPrefs({ targetLang })}
        >
          <SelectTrigger aria-label="Idioma de destino" className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {languageName(lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={blocked} onClick={translate}>
          <Languages />
          Traduzir
        </Button>
      </div>

      {progress !== null && <Progress value={progress * 100} />}

      {alerts.map((text) => (
        <Alert key={text} variant="destructive">
          <CircleAlert />
          <AlertDescription>{text}</AlertDescription>
        </Alert>
      ))}
    </section>
  );
}
