import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { languageName } from './Controls';
import { LANGS } from './TranslatePanel';
import { t, UI_LANGS, type UiLang } from '../lib/i18n';
import { setPrefs } from '../lib/storage';
import type { Prefs } from '../lib/types';

/** Each interface language in its own words: whoever cannot read the current one still finds theirs. */
function ownName(lang: string): string {
  return new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang;
}

export default function Settings({ prefs }: { prefs: Prefs }) {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="font-medium">{t('Idioma do programa')}</span>
        {/* Every open page reloads in the new language (startPageLocale). */}
        <Select value={prefs.uiLang} onValueChange={(uiLang) => void setPrefs({ uiLang: uiLang as UiLang })}>
          <SelectTrigger aria-label={t('Idioma do programa')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UI_LANGS.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {ownName(lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">{t('Idioma padrão da tradução')}</span>
        <Select value={prefs.targetLang} onValueChange={(targetLang) => void setPrefs({ targetLang })}>
          <SelectTrigger aria-label={t('Idioma padrão da tradução')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(LANGS.includes(prefs.targetLang) ? LANGS : [prefs.targetLang, ...LANGS]).map((lang) => (
              <SelectItem key={lang} value={lang}>
                {languageName(lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {t('Usado ao traduzir e ao ouvir traduzido.')}
        </span>
      </label>
    </div>
  );
}
