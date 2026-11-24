import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const operationViews = {
  "today-reserve": "Today Reserve",
  "today-arrival": "Today Arrival",
  "on-rent": "On Rent",
  available: "Available Vehicles",
  "late-car": "Late Car",
} as const;

export async function OperationsLinks({ locale }: { locale: string }) {
  const t = await getTranslations("operations");
  return (
    <nav aria-label={t("navLabel")} className="flex flex-wrap gap-2">
      {Object.keys(operationViews).map((view) => (
        <Link
          key={view}
          href={`/${locale}/operations/${view}` as never}
          className="min-h-11 rounded-lg border border-[var(--edge)] px-3 py-3 text-sm hover:text-[var(--accent)]"
        >
          {t(view as keyof typeof operationViews)}
        </Link>
      ))}
    </nav>
  );
}
