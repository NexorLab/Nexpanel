import { useLanguage } from "../contexts/LanguageContext";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0) return "—";
  const exponent = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  const decimals = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[exponent]}`;
}

export function formatGbToBytes(gb: number): number {
  return Math.round(gb * 1024 ** 3);
}

export function bytesToGb(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function formatDate(unixSeconds: number | null, lang: string): string {
  if (unixSeconds === null) return "—";
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-nu-latn" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

export function formatDateTime(unixSeconds: number | null, lang: string): string {
  if (unixSeconds === null) return "—";
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR-u-nu-latn" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

/** Human relative time ("3 days ago" / "۳ روز پیش") */
export function formatRelativeTime(unixSeconds: number, lang: string): string {
  const formatter = new Intl.RelativeTimeFormat(lang === "fa" ? "fa" : "en", {
    numeric: "auto",
  });
  const seconds = unixSeconds - Math.floor(Date.now() / 1000);
  const abs = Math.abs(seconds);

  if (abs < 60) return formatter.format(Math.round(seconds), "second");
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (abs < 2592000) return formatter.format(Math.round(seconds / 86400), "day");
  return formatter.format(Math.round(seconds / 2592000), "month");
}

/** Days until expiry; negative if already expired. */
export function daysUntil(unixSeconds: number): number {
  const diffSeconds = unixSeconds - Math.floor(Date.now() / 1000);
  return diffSeconds / 86400;
}

export function formatNumber(value: number, lang: string): string {
  return new Intl.NumberFormat(lang === "fa" ? "fa-IR-u-nu-latn" : "en-US").format(
    value,
  );
}

export function useFormat() {
  const { lang } = useLanguage();
  return {
    bytes: formatBytes,
    date: (value: number | null) => formatDate(value, lang),
    dateTime: (value: number | null) => formatDateTime(value, lang),
    relative: (value: number) => formatRelativeTime(value, lang),
    number: (value: number) => formatNumber(value, lang),
    daysUntil,
  };
}
