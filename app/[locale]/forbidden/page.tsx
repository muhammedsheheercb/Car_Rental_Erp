import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function Forbidden() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("auth")]);
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <p className="font-semibold text-[var(--accent-ink)]">403</p>
        <h1 className="mt-3 text-3xl font-semibold">{t("forbiddenTitle")}</h1>
        <p className="mt-2 text-[var(--muted)]">{t("forbiddenDescription")}</p>
        <Link
          href={`/${locale}`}
          className="mt-6 inline-block min-h-11 rounded-lg bg-[var(--accent)] px-4 py-3 font-medium text-black"
        >
          {t("returnToDashboard")}
        </Link>
      </div>
    </main>
  );
}
