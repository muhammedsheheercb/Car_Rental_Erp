import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES, ACTIVITY_EVENT_META } from "@/features/daily-activity/calculations";
import { REPORT_SLUGS } from "@/features/reports/definitions";
import {
  buildSwitchLocaleHref,
  normalizeStatusKey,
  sanitizeIntlKey,
  translateFieldLabel,
  translateReportColumn,
  translateReportSummary,
  translateSafe,
  translateStatus,
  translateValidation,
} from "@/lib/i18n-helpers";
import arMessages from "@/messages/ar.json";
import enMessages from "@/messages/en.json";

type NestedMessages = { [key: string]: string | NestedMessages };

function flattenMessages(
  obj: NestedMessages,
  prefix = "",
): Array<{ path: string; rawKey: string; value: string }> {
  const result: Array<{ path: string; rawKey: string; value: string }> = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "string") {
      result.push({ path, rawKey: key, value: val });
    } else {
      result.push(...flattenMessages(val, path));
    }
  }
  return result;
}

function collectRawKeys(obj: NestedMessages, prefix = ""): Array<{ path: string; key: string }> {
  const keys: Array<{ path: string; key: string }> = [];
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}/${key}` : key;
    keys.push({ path, key });
    if (typeof val !== "string") {
      keys.push(...collectRawKeys(val, path));
    }
  }
  return keys;
}

function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  return [...new Set(matches)].sort();
}

describe("Section 7: Bilingual message catalogs (en.json & ar.json)", () => {
  const enEntries = flattenMessages(enMessages as NestedMessages);
  const arEntries = flattenMessages(arMessages as NestedMessages);
  const enMap = new Map(enEntries.map((e) => [e.path, e.value]));
  const arMap = new Map(arEntries.map((e) => [e.path, e.value]));

  it("maintains 100% recursive key parity between en.json and ar.json", () => {
    const missingInAr = enEntries.filter((e) => !arMap.has(e.path)).map((e) => e.path);
    const missingInEn = arEntries.filter((e) => !enMap.has(e.path)).map((e) => e.path);
    expect(missingInAr).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(enEntries.length).toBeGreaterThan(1000);
    expect(arEntries.length).toBe(enEntries.length);
  });

  it("contains zero dots in message keys (next-intl v4 requirement)", () => {
    const enDots = collectRawKeys(enMessages as NestedMessages)
      .filter((k) => k.key.includes("."))
      .map((k) => k.path);
    const arDots = collectRawKeys(arMessages as NestedMessages)
      .filter((k) => k.key.includes("."))
      .map((k) => k.path);
    expect(enDots).toEqual([]);
    expect(arDots).toEqual([]);
  });

  it("has no empty translation strings in either catalog", () => {
    const emptyEn = enEntries.filter((e) => !e.value.trim()).map((e) => e.path);
    const emptyAr = arEntries.filter((e) => !e.value.trim()).map((e) => e.path);
    expect(emptyEn).toEqual([]);
    expect(emptyAr).toEqual([]);
  });

  it("preserves identical interpolation placeholders across English and Arabic", () => {
    const mismatches: Array<{ path: string; en: string[]; ar: string[] }> = [];
    for (const entry of enEntries) {
      const arValue = arMap.get(entry.path) ?? "";
      const enVars = extractPlaceholders(entry.value);
      const arVars = extractPlaceholders(arValue);
      if (JSON.stringify(enVars) !== JSON.stringify(arVars)) {
        mismatches.push({ path: entry.path, en: enVars, ar: arVars });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("provides genuine Arabic translations across ar.json", () => {
    const allowedNonArabicPaths = new Set([
      "appName",
      "language",
      "nav.language",
      "settings.ymdLabel",
    ]);
    const arabicRegex = /[\u0600-\u06FF]/;
    const untranslated = arEntries
      .filter((e) => !allowedNonArabicPaths.has(e.path) && !arabicRegex.test(e.value))
      .map((e) => `${e.path}=${e.value}`);
    expect(untranslated).toEqual([]);
  });

  it("covers all 12 reports in reports.catalog for both en and ar", () => {
    const requiredFields = [
      "title",
      "shortTitle",
      "description",
      "statusLabel",
      "dateRangeLabel",
      "searchPlaceholder",
    ] as const;
    for (const slug of REPORT_SLUGS) {
      for (const field of requiredFields) {
        expect(enMap.has(`reports.catalog.${slug}.${field}`)).toBe(true);
        expect(arMap.has(`reports.catalog.${slug}.${field}`)).toBe(true);
      }
    }
  });

  it("covers all Daily Activity categories and events in both en and ar", () => {
    for (const cat of ACTIVITY_CATEGORIES) {
      expect(enMap.has(`activity.categories.${cat}`)).toBe(true);
      expect(arMap.has(`activity.categories.${cat}`)).toBe(true);
    }
    for (const event of Object.keys(ACTIVITY_EVENT_META)) {
      expect(enMap.has(`activity.events.${event}`)).toBe(true);
      expect(arMap.has(`activity.events.${event}`)).toBe(true);
    }
  });
});

describe("Section 7: i18n helper functions & locale switching", () => {
  const tArRoot = createTranslator({ locale: "ar", messages: arMessages });
  const tArStatus = createTranslator({
    locale: "ar",
    messages: arMessages,
    namespace: "status",
  });
  const tArReports = createTranslator({
    locale: "ar",
    messages: arMessages,
    namespace: "reports",
  });
  const tArFields = createTranslator({
    locale: "ar",
    messages: arMessages,
    namespace: "fieldLabels",
  });

  it("switches locale in place while preserving route and query parameters", () => {
    expect(buildSwitchLocaleHref("/en/reports", "report=vehicle-income&page=2", "ar")).toBe(
      "/ar/reports?report=vehicle-income&page=2",
    );
    expect(buildSwitchLocaleHref("/ar/fleet", "?status=AVAILABLE", "en")).toBe(
      "/en/fleet?status=AVAILABLE",
    );
    expect(buildSwitchLocaleHref("/en/ledger/print", "customerId=123", "ar")).toBe(
      "/ar/ledger/print?customerId=123",
    );
    expect(buildSwitchLocaleHref("/en", "", "ar")).toBe("/ar/dashboard");
    expect(buildSwitchLocaleHref("/", "", "en")).toBe("/en/dashboard");
  });

  it("sanitizes dotted keys and normalizes status labels", () => {
    expect(sanitizeIntlKey("Receipts & Adv.")).toBe("Receipts & Adv");
    expect(sanitizeIntlKey("Invalid username or password.")).toBe("Invalid username or password");
    expect(normalizeStatusKey("Deleted (history retained)")).toBe("DELETED_HISTORY");
    expect(normalizeStatusKey("Active (On Rent)")).toBe("ACTIVE_ON_RENT");
    expect(normalizeStatusKey("Bank Transfer")).toBe("BANK_TRANSFER");
    expect(normalizeStatusKey("in_progress")).toBe("IN_PROGRESS");
  });

  it("translates statuses, validations, report columns/summaries, and field labels into Arabic", () => {
    expect(translateStatus(tArStatus, "AVAILABLE")).toBe("متاحة");
    expect(translateStatus(tArStatus, "BANK_TRANSFER")).toBe("تحويل بنكي");
    expect(translateStatus(tArStatus, "Deleted (history retained)")).toBe("محذوف (السجل محفوظ)");
    expect(translateStatus(tArStatus, "UNKNOWN_CUSTOM_STATUS")).toBe("UNKNOWN_CUSTOM_STATUS");

    expect(translateValidation(tArRoot, "Invalid username or password.")).toBe(
      "اسم المستخدم أو كلمة المرور غير صحيحة.",
    );
    expect(translateValidation(tArRoot, "Some dynamic server message")).toBe(
      "Some dynamic server message",
    );

    expect(translateReportColumn(tArReports, "Receipts & Adv.")).toBe("الإيصالات والمقدمات");
    expect(translateReportSummary(tArReports, "Net Vehicle Income")).toBe("صافي دخل المركبات");
    expect(translateFieldLabel(tArFields, "Rental Agreement")).toBe("عقد تأجير مركبة");
    expect(translateSafe(tArStatus, "NON_EXISTENT", "Fallback")).toBe("Fallback");
  });
});
