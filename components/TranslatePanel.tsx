import { useEffect, useState } from 'react';
import { CircleAlert, Languages, X } from 'lucide-react';
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
import { applyLang } from '../lib/edit';
import { segmentBlock } from '../lib/segment';
import { setBlocks, setPrefs } from '../lib/storage';
import {
  availability,
  hashText,
  preparePair,
  translateBlock,
  translationSupport,
} from '../lib/translate';
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
  /** Warnings the user closed; a new attempt brings them back if they still hold. */
  const [dismissed, setDismissed] = useState<string[]>([]);

  const supported = translationSupport() === 'ok';
  // Book chapters (blocks with kinds) are translated on the fly while spoken, never stored.
  const translatable = blocks.filter((block) => !block.kinds);
  const bookOnly = blocks.length > 0 && translatable.length === 0;
  const sourceLang = (translatable[0] ?? blocks[0])?.lang ?? navigator.language;

  useEffect(() => {
    if (!supported) return;
    void availability(sourceLang, prefs.targetLang).then(setPairState);
  }, [supported, sourceLang, prefs.targetLang]);

  const unavailablePair = supported && pairState === 'unavailable';
  const blocked =
    !supported || unavailablePair || translatable.length === 0 || progress !== null;

  function fail(cause: unknown): void {
    setError(cause instanceof Error ? cause.message : 'Falha na tradução');
  }

  function start(): void {
    setError(null);
    setDismissed([]);
    setProgress(0);
  }

  /**
   * The language the text actually reads as, when the declared one was refused:
   * storing it re-segments the blocks and fixes the voice, the availability
   * check and the next translation.
   */
  function saveLang(lang: string): void {
    if (lang === sourceLang) return;
    void setBlocks(blocks.map((block) => (block.lang === sourceLang ? applyLang(block, lang) : block)));
  }

  /** Called straight from the click handler so the user activation authorizes the download. */
  function prepare(target: string): void {
    start();
    void preparePair(sourceLang, target, (blocks[0]?.text ?? ''), setProgress)
      .then(saveLang)
      .catch(fail)
      .finally(() => setProgress(null));
  }

  function translate(): void {
    start();
    const target = prefs.targetLang;
    // Every create fires in this same task, with nothing awaited first, so the
    // click still authorizes the language-pack download.
    const jobs = translatable.map((block) => translateBlock(block, target, setProgress));

    void Promise.all(jobs)
      .then(async (results) => {
        const byId = new Map(translatable.map((block, index) => [block.id, results[index]!]));
        const result = await setBlocks(
          blocks.map((block) => {
            const done = byId.get(block.id);
            if (done === undefined) return block;
            // The translator may have read a different source language off the
            // text; keeping it is what stops the refusal from coming back.
            const rebased = applyLang(block, done.lang);
            return {
              ...rebased,
              translation: {
                target,
                text: done.text,
                paragraphs: segmentBlock(done.text, target, `${block.id}#t`),
                sourceTextHash: hashText(block.text),
              },
            };
          }),
        );
        if (!result.ok) setError(MESSAGES.quota);
      })
      .catch(fail)
      .finally(() => setProgress(null));
  }

  const alerts = [
    !supported && 'Tradução não suportada neste navegador',
    unavailablePair && 'Par de idiomas não disponível',
    error,
  ].filter((text): text is string => Boolean(text) && !dismissed.includes(text as string));

  function dismiss(text: string): void {
    if (text === error) setError(null);
    else setDismissed((closed) => [...closed, text]);
  }

  return (
    <section className="flex flex-col gap-2">
      <Tabs
        value={prefs.activeTab}
        onValueChange={(tab) => {
          if (bookOnly && tab === 'translation') prepare(prefs.targetLang);
          startTransition(() => void setPrefs({ activeTab: tab as Prefs['activeTab'] }));
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="original">Original</TabsTrigger>
          <TabsTrigger value="translation">{bookOnly ? 'Ouvir traduzido' : 'Tradução'}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* The target language only matters once the translation tab is on; on the
          original tab it is noise. */}
      {prefs.activeTab === 'translation' && (
        <div className="flex items-center gap-2">
          <Select
            value={prefs.targetLang}
            onValueChange={(targetLang) => {
              if (bookOnly) prepare(targetLang);
              void setPrefs({ targetLang });
            }}
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
          {!bookOnly && (
            <Button variant="outline" disabled={blocked} onClick={translate}>
              <Languages />
              Traduzir
            </Button>
          )}
        </div>
      )}

      {progress !== null && <Progress value={progress * 100} />}

      {alerts.map((text) => (
        <Alert key={text} variant="destructive" className="pr-10">
          <CircleAlert />
          <AlertDescription>{text}</AlertDescription>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Fechar aviso"
            className="absolute top-2 right-2"
            onClick={() => dismiss(text)}
          >
            <X />
          </Button>
        </Alert>
      ))}
    </section>
  );
}
