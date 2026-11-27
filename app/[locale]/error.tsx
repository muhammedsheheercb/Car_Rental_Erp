"use client";
import { useTranslations } from "next-intl";

export default function LocaleErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("auth");
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="font-semibold text-[var(--accent-ink)]">{t("errorEyebrow")}</p>
        <h1 className="mt-3 text-3xl font-semibold">{t("errorTitle")}</h1>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-lg bg-[var(--accent)] px-4 text-black"
        >
          {t("tryAgain")}
        </button>
      </div>
    </main>
  );
}
