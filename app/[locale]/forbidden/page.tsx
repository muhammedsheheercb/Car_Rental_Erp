import { getTranslations } from "next-intl/server";

export default async function Forbidden() {
  const t = await getTranslations("auth");
  return (
    <main className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-[var(--accent-ink)]">403</p>
        <h1 className="mt-3 text-3xl font-semibold">{t("forbiddenTitle")}</h1>
        <p className="mt-2 text-[var(--muted)]">{t("forbiddenDescription")}</p>
      </div>
    </main>
  );
}
