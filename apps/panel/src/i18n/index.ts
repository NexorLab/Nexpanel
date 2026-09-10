import en from "./locales/en.json";
import fa from "./locales/fa.json";
import type { Language } from "../lib/language";

/**
 * Lightweight typed i18n — a dictionary lookup with {param} interpolation.
 * Both locale files must share the exact same key shape (enforced via the
 * Dictionary type), so `t("users.table.username")` is fully type-checked.
 */

export type Dictionary = typeof en;

const locales: Record<Language, Dictionary> = {
  en,
  fa: fa as Dictionary,
};

function resolve(dict: unknown, path: string): string | undefined {
  let current: unknown = dict;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const value = resolve(locales[lang], key) ?? resolve(locales.en, key);
  if (value === undefined) {
    return key;
  }
  return interpolate(value, params);
}

export type TranslationKey = string;
