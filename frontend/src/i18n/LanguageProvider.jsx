import { useCallback, useEffect, useMemo, useState } from 'react';
import { LangContext } from './lang';
import { DEFAULT_LANG, LANGS, STRINGS } from './strings';

const STORAGE_KEY = 'lang';

function readStoredLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return LANGS.includes(stored) ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

// Holds the visitor's language (Thai by default), remembers their choice in
// localStorage, and keeps <html lang> in sync so the browser and the
// Thai-specific CSS (see index.css) know which language is showing.
export default function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) - the choice just won't persist.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => {
    const t = (key, vars) => {
      const raw = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
      if (typeof raw !== 'string' || !vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    };
    return { lang, setLang, t, locale: lang === 'th' ? 'th-TH' : 'en-US' };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
