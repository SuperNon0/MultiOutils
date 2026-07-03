import {
  createContext,
  useCallback,
  useContext,
  type ReactNode
} from 'react';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import type { Language } from '../../../common/types';

const dicts: Record<Language, Record<string, string>> = {
  fr: fr as Record<string, string>,
  en: en as Record<string, string>
};

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Language;
  t: TFunc;
}

const I18nContext = createContext<I18nValue>({
  lang: 'fr',
  t: (key) => key
});

export function translate(
  lang: Language,
  key: string,
  vars?: Record<string, string | number>
): string {
  const text = dicts[lang][key] ?? dicts.fr[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] != null ? String(vars[name]) : match
  );
}

export function I18nProvider({
  lang,
  children
}: {
  lang: Language;
  children: ReactNode;
}): ReactNode {
  const t = useCallback<TFunc>((key, vars) => translate(lang, key, vars), [lang]);
  return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
