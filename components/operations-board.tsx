"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { formatLateDuration } from "@/features/rentals/operations-time";
import { translateStatus } from "@/lib/i18n-helpers";

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
  const tOps = useTranslations("operations");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
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
    <section aria-label={tOps("navLabel")} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {!shown.length && (
        <p className="rounded-xl border border-[var(--edge)] p-6 text-[var(--muted)] md:col-span-2">
          {tOps("noVehicles")}
        </p>
      )}
      {shown.map((row) => {
        const rawLate = row.expectedReturnAt
          ? formatLateDuration(new Date(row.expectedReturnAt), now)
          : "—";
        const displayLate = rawLate === "On time" ? translateStatus(tStatus, "On time") : rawLate;
        const details: {
          key: string;
          label: string;
          value: string | undefined;
          isLate?: boolean;
        }[] = [
          { key: "reg", label: tCommon("registration"), value: row.registration },
          ...(view === "available"
            ? [
                { key: "brand", label: tOps("brand"), value: row.brand },
                { key: "model", label: tOps("model"), value: row.model },
              ]
            : [
                { key: "customer", label: tCommon("customer"), value: row.customer },
                { key: "mobile", label: tOps("mobile"), value: row.mobile },
                {
                  key: "starts",
                  label:
                    view === "today-reserve" ? tOps("reservationDateTime") : tOps("outDateTime"),
                  value: dateTime(row.startsAt),
                },
                {
                  key: "expected",
                  label: tOps("expectedReturn"),
                  value: dateTime(row.expectedReturnAt),
                },
                ...(view !== "today-reserve"
                  ? [
                      {
                        key: "late",
                        label: tOps("lateStatus"),
                        value: displayLate,
                        isLate: rawLate !== "On time" && rawLate !== "—",
                      },
                    ]
                  : []),
              ]),
          { key: "branch", label: tCommon("branch"), value: row.branch },
          ...(row.user ? [{ key: "user", label: tCommon("user"), value: row.user }] : []),
          {
            key: "status",
            label: tCommon("status"),
            value: translateStatus(tStatus, row.status ?? "AVAILABLE"),
          },
        ];
        return (
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
                  {view === "today-reserve" ? tOps("reservationTime") : tOps("expectedArrivalTime")}
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
              {details.map((entry) => (
                <div key={entry.key} className="contents">
                  <dt className="text-[var(--muted)]">{entry.label}</dt>
                  <dd
                    className={`min-w-0 break-words ${entry.isLate ? "font-semibold text-red-300" : ""}`}
                  >
                    {entry.value}
                  </dd>
                </div>
              ))}
            </dl>
            {view === "available" && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--edge)] pt-3">
                <Link
                  href={`/${locale}/rentals?vehicleId=${row.id}` as never}
                  className="min-h-10 content-center rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-black"
                >
                  {tOps("bookVehicle")}
                </Link>
                <Link
                  href={
                    `/${locale}/fleet?registration=${encodeURIComponent(row.registration)}` as never
                  }
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 text-sm"
                >
                  {tOps("fleetActions")}
                </Link>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
