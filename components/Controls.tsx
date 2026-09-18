import { useEffect, useState } from 'react';
import { sendCommand } from '../lib/messages';
import { listLocalVoices, pickVoice } from '../lib/voices';
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
    void listLocalVoices().then(setVoices);
  }, []);

  // The voice follows the tab being read. voiceByLang is keyed by language, so
  // a manual choice made on one tab survives switching to the other and back.
  const voiceLang = prefs.activeTab === 'translation' ? translationLang : lang;
  const voice = pickVoice(voices, voiceLang, prefs.voiceByLang);
  const blocked = empty || voice === null;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void sendCommand({ type: playing ? 'pause' : 'play' })}
        >
          {playing ? 'Pausar' : 'Ler'}
        </button>
        <button type="button" disabled={blocked} onClick={() => void sendCommand({ type: 'stop' })}>
          Parar
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        Velocidade
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={prefs.rate}
          onChange={(event) =>
            void sendCommand({ type: 'setRate', rate: Number(event.target.value) })
          }
        />
        <span>{prefs.rate.toFixed(1)}x</span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        Voz
        <select
          style={{ flex: 1 }}
          disabled={voices.length === 0}
          value={voice?.voiceName ?? ''}
          onChange={(event) =>
            void sendCommand({ type: 'setVoice', lang: voiceLang, voiceName: event.target.value })
          }
        >
          {voices.map((option) => (
            <option key={option.voiceName} value={option.voiceName}>
              {option.voiceName} ({option.lang})
            </option>
          ))}
        </select>
      </label>

      {voices.length === 0 && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          Nenhuma voz local instalada neste sistema
        </p>
      )}
      {voices.length > 0 && voice === null && (
        <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>
          Sem voz instalada para {languageName(voiceLang)}
        </p>
      )}
    </section>
  );
}
