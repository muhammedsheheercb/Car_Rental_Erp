import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("auth");
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-[var(--accent)]">404</p>
        <h1 className="mt-3 text-3xl font-semibold">{t("notFoundTitle")}</h1>
        <Link
          href={`/${locale}/dashboard`}
          className="mt-6 inline-block min-h-11 rounded-lg bg-[var(--accent)] px-4 py-3 text-black"
        >
          {t("returnToDashboard")}
        </Link>
      </div>
    </main>
  );
}
