"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatLateDuration } from "@/features/rentals/operations-time";

export type OperationsRow = {
  id: string;
  vehicle: string;
  registration: string;
  branch: string;
  customer?: string;
  mobile?: string;
  startsAt?: string;
  expectedReturnAt?: string;
  user?: string;
  status?: string;
  brand?: string;
  model?: string;
};
const dateTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        timeZone: "Asia/Muscat",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const time = (value?: string) =>
  value
    ? new Date(value).toLocaleTimeString("en-GB", {
        timeZone: "Asia/Muscat",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export function OperationsBoard({
  view,
  rows,
  initialNow,
}: {
  view: string;
  rows: OperationsRow[];
  initialNow: string;
}) {
  const [now, setNow] = useState(new Date(initialNow));
  const router = useRouter();
  const locale = usePathname().split("/")[1] || "en";
  useEffect(() => {
    const anchor = performance.now();
    const serverTime = new Date(initialNow).getTime();
    setNow(new Date(serverTime));
    const tick = setInterval(
      () => setNow(new Date(serverTime + performance.now() - anchor)),
      15_000,
    );
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router, initialNow]);
  const shown =
    view === "late-car"
      ? rows.filter((row) => row.expectedReturnAt && new Date(row.expectedReturnAt) < now)
      : rows;
  return (
    <section aria-label="Vehicle list" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {!shown.length && (
        <p className="rounded-xl border border-[var(--edge)] p-6 text-[var(--muted)] md:col-span-2">
          No vehicles to show.
        </p>
      )}
      {shown.map((row) => (
        <article
          key={row.id}
          className="min-w-0 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
        >
          {(view === "today-reserve" || view === "today-arrival") && (
            <p className="mb-3 text-3xl font-semibold text-[var(--accent)]">
              <time dateTime={view === "today-reserve" ? row.startsAt : row.expectedReturnAt}>
                {time(view === "today-reserve" ? row.startsAt : row.expectedReturnAt)}
              </time>
              <span className="ms-2 text-sm font-normal">
                {view === "today-reserve" ? "Reservation Time" : "Expected Arrival Time"}
              </span>
            </p>
          )}
          <h2 className="text-lg font-semibold">
            {view === "available" ? (
              row.vehicle
            ) : (
              <Link
                href={`/${locale}/rentals/${row.id}` as never}
                className="text-[var(--accent)] underline"
              >
                {row.vehicle}
              </Link>
            )}
          </h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            {Object.entries({
              Registration: row.registration,
              ...(view === "available"
                ? { Brand: row.brand, Model: row.model }
                : {
                    Customer: row.customer,
                    Mobile: row.mobile,
                    [view === "today-reserve" ? "Reservation Date/Time" : "Out Date/Time"]:
                      dateTime(row.startsAt),
                    "Expected Return": dateTime(row.expectedReturnAt),
                    ...(view !== "today-reserve"
                      ? {
                          "Late status": row.expectedReturnAt
                            ? formatLateDuration(new Date(row.expectedReturnAt), now)
                            : "—",
                        }
                      : {}),
                  }),
              Branch: row.branch,
              ...(row.user ? { User: row.user } : {}),
              Status: row.status ?? "Available",
            }).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd
                  className={`min-w-0 break-words ${label === "Late status" && value !== "On time" ? "font-semibold text-red-300" : ""}`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}
