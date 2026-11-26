"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense } from "react";
import { type AppLocale, buildSwitchLocaleHref } from "@/lib/i18n-helpers";

function LanguageSwitcherInner({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname() || `/${locale}/dashboard`;
  const searchParams = useSearchParams();
  const t = useTranslations("nav");
  const targetLocale: AppLocale = locale === "ar" ? "en" : "ar";
  const href = buildSwitchLocaleHref(pathname, searchParams.toString(), targetLocale);
  return (
    <Link
      href={href}
      hrefLang={targetLocale}
      className={className ?? "min-h-11 rounded-lg border border-[var(--edge)] px-3 py-2 text-sm"}
    >
      {t("language")}
    </Link>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("nav");
  const targetLocale: AppLocale = locale === "ar" ? "en" : "ar";
  return (
    <Suspense
      fallback={
        <Link
          href={`/${targetLocale}/dashboard`}
          hrefLang={targetLocale}
          className={
            className ?? "min-h-11 rounded-lg border border-[var(--edge)] px-3 py-2 text-sm"
          }
        >
          {t("language")}
        </Link>
      }
    >
      <LanguageSwitcherInner className={className} />
    </Suspense>
  );
}
