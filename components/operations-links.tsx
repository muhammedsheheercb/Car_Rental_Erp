import Link from "next/link";
export const operationViews = {
  "today-reserve": "Today Reserve",
  "today-arrival": "Today Arrival",
  "on-rent": "On Rent",
  available: "Available Vehicles",
  "late-car": "Late Car",
} as const;
export function OperationsLinks({ locale }: { locale: string }) {
  return (
    <nav aria-label="Vehicle operations" className="flex flex-wrap gap-2">
      {Object.entries(operationViews).map(([view, label]) => (
        <Link
          key={view}
          href={`/${locale}/operations/${view}` as never}
          className="min-h-11 rounded-lg border border-[var(--edge)] px-3 py-3 text-sm hover:text-[var(--accent)]"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
