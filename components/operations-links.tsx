import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const operationViews = {
  "today-reserve": "Today Reserve",
  "today-arrival": "Today Arrival",
  "on-rent": "On Rent",
  available: "Available Vehicles",
  "late-car": "Late Car",
} as const;

export async function OperationsLinks({
  locale,
  counts,
}: {
  locale: string;
  counts?: Partial<Record<keyof typeof operationViews, number>>;
}) {
  const t = await getTranslations("operations");
  return (
    <nav aria-label={t("navLabel")} className="flex flex-wrap gap-2">
      {(Object.keys(operationViews) as Array<keyof typeof operationViews>).map((view) => {
        const count = counts?.[view];
        const isAlert = view === "late-car" && (count ?? 0) > 0;
        return (
          <Link
            key={view}
            href={`/${locale}/operations/${view}` as never}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-all sm:text-sm ${
              isAlert
                ? "border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100"
                : "border-[var(--edge)] bg-[var(--surface)] text-[#4A4741] shadow-[0_2px_10px_rgba(22,21,19,0.03)] hover:border-[#9A7B4F] hover:text-[#161513]"
            }`}
          >
            <span>{t(view)}</span>
            {count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  isAlert ? "bg-red-200/80 text-red-800" : "bg-[#F4F1EA] text-[#6E685F]"
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
