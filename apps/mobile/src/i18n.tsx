import { createContext, useContext } from 'react';
import en from './locales/en';
import ar from './locales/ar';
export type Language = 'ar' | 'en';
export const LocaleContext = createContext<Language>('ar');
export function translate(lang: Language, key: string): string {
  return (lang === 'ar' ? ar : en)[key as keyof typeof en] || key;
}
export function useLocale() {
  const lang = useContext(LocaleContext);
  return { lang, rtl: lang === 'ar', t: (key: string) => translate(lang, key) };
}
export function isolate(text: string) {
  return '\u2066' + text + '\u2069';
}
