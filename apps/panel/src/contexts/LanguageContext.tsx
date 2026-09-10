import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyLanguage,
  getStoredLanguage,
  storeLanguage,
  type Language,
} from "../lib/language";
import { translate } from "../i18n";

interface LanguageContextValue {
  lang: Language;
  isRtl: boolean;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    applyLanguage(lang);
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    storeLanguage(next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, isRtl: lang === "fa", setLang, t }),
    [lang, setLang, t],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
