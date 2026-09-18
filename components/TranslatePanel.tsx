import { useEffect, useState } from 'react';
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

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['original', 'translation'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={prefs.activeTab === tab}
            onClick={() => startTransition(() => void setPrefs({ activeTab: tab }))}
            style={{
              flex: 1,
              fontWeight: prefs.activeTab === tab ? 600 : 400,
              viewTransitionName: 'tts-tabs',
            }}
          >
            {tab === 'original' ? 'Original' : 'Tradução'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          style={{ flex: 1 }}
          value={prefs.targetLang}
          onChange={(event) => void setPrefs({ targetLang: event.target.value })}
        >
          {LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {languageName(lang)}
            </option>
          ))}
        </select>
        <button type="button" disabled={blocked} onClick={translate}>
          Traduzir
        </button>
      </div>

      {progress !== null && <progress value={progress} max={1} style={{ width: '100%' }} />}

      {!supported && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          Tradução não suportada neste navegador
        </p>
      )}
      {unavailablePair && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          Par de idiomas não disponível
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
