export type Language = "en" | "fa";

const STORAGE_KEY = "nexpanel.lang";

export function getStoredLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "en" || value === "fa") {
      return value;
    }
  } catch {
    // localStorage unavailable — fall through to default
  }
  return "en";
}

export function storeLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore — persistence is best-effort
  }
}

export function applyLanguage(lang: Language): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fa: "فارسی",
};
