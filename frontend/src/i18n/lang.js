import { createContext, useContext } from 'react';

export const LangContext = createContext(null);

// Returns { lang, setLang, t, locale }. t('key', { name: 'x' }) looks up
// the key in the current language (falling back to English) and fills any
// {placeholders}; array/object values (content lists) are returned as-is.
export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
