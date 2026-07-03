import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import type { Language } from '../common/types';

const dicts: Record<Language, Record<string, string>> = {
  fr: fr as Record<string, string>,
  en: en as Record<string, string>
};

export type TVars = Record<string, string | number>;

export function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    vars[k] != null ? String(vars[k]) : m
  );
}

/** i18n du process main (tray, notifications, dialogues). FR par défaut. */
export class I18n {
  constructor(private lang: Language = 'fr') {}

  setLanguage(lang: Language): void {
    this.lang = lang;
  }

  get language(): Language {
    return this.lang;
  }

  t = (key: string, vars?: TVars): string => {
    const text = dicts[this.lang][key] ?? dicts.fr[key] ?? key;
    return interpolate(text, vars);
  };
}
