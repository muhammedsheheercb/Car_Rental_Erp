export type AppLocale = "en" | "ar";

type TranslatorLike = {
  (key: never): string;
  has?: (key: never) => boolean;
};

const SPECIAL_STATUS_MAP: Record<string, string> = {
  "deleted (history retained)": "DELETED_HISTORY",
  "deleted / history retained": "DELETED_HISTORY_RETAINED",
  "active (on rent)": "ACTIVE_ON_RENT",
  "currently blacklisted": "CURRENTLY_BLACKLISTED",
  "removed / historical": "REMOVED_HISTORICAL",
  "not configured": "NOT_CONFIGURED",
  "service / transfer": "SERVICE_OR_TRANSFER",
  "expiring soon": "EXPIRING_SOON",
  "on time": "ON_TIME",
  "on rent": "ON_RENT",
  "in progress": "IN_PROGRESS",
  "amount due": "DUE",
  "credit balance": "CREDIT",
  "engine service": "ENGINE",
  "gear oil": "GEAR_OIL",
  "bank transfer": "BANK_TRANSFER",
  "rent charge": "RENT_CHARGE",
  "legal fine": "LEGAL_FINE",
  "super admin": "SUPER_ADMIN",
};

export function sanitizeIntlKey(raw: string): string {
  return raw.replaceAll(".", "").trim();
}

export function normalizeStatusKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const special = SPECIAL_STATUS_MAP[lower];
  if (special) return special;
  return trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function translateSafe(t: TranslatorLike, key: string, fallback: string): string {
  if (!key) return fallback;
  const invoke = t as unknown as (k: string) => string;
  const has = t.has as unknown as ((k: string) => boolean) | undefined;
  if (typeof has === "function") {
    return has(key) ? invoke(key) : fallback;
  }
  try {
    return invoke(key);
  } catch {
    return fallback;
  }
}

export function translateStatus(t: TranslatorLike, raw: string, prefix = ""): string {
  const key = normalizeStatusKey(raw);
  if (!key) return raw;
  return translateSafe(t, `${prefix}${key}`, raw);
}

export function translateValidation(
  t: TranslatorLike,
  message: string,
  prefix = "validation.",
): string {
  const clean = sanitizeIntlKey(message);
  if (!clean) return message;
  return translateSafe(t, `${prefix}${clean}`, message);
}

export function translateReportColumn(t: TranslatorLike, label: string): string {
  return translateSafe(t, `columns.${sanitizeIntlKey(label)}`, label);
}

export function translateReportSummary(t: TranslatorLike, label: string): string {
  return translateSafe(t, `summaries.${sanitizeIntlKey(label)}`, label);
}

export function translateFieldLabel(t: TranslatorLike, label: string, prefix = ""): string {
  const clean = sanitizeIntlKey(label);
  if (!clean) return label;
  return translateSafe(t, `${prefix}${clean}`, label);
}

export function buildSwitchLocaleHref(
  pathname: string,
  search: string,
  targetLocale: AppLocale,
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const stripped = normalizedPath.replace(/^\/(en|ar)(?=\/|$)/, "");
  const suffix = stripped && stripped !== "/" ? stripped : "/dashboard";
  const cleanSearch = search.replace(/^\?/, "");
  return `/${targetLocale}${suffix}${cleanSearch ? `?${cleanSearch}` : ""}`;
}
