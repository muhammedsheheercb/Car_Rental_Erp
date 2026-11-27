import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { branches, vehicleServiceSettings, vehicles } from "@/db/schema";
import { serviceDue } from "@/features/maintenance/calculations";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { requirePagePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

const PAGE_SIZE = 15;
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function NearServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; branch?: string; page?: string }>;
}) {
  const { locale } = await params;
  const actor = await requirePagePermission(locale, "fleet", "read");
  const [query, tNear, tExpiry, tCommon, tStatus] = await Promise.all([
    searchParams,
    getTranslations("fleet.nearService"),
    getTranslations("fleet.expiry"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const q = query.q?.trim() ?? "";
  const branchFilter = query.branch && UUID_RE.test(query.branch) ? query.branch : "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [policy, rows, branchOptions] = await Promise.all([
    fleetAlertSettings(),
    db
      .select({ v: vehicles, s: vehicleServiceSettings, branch: branches.name })
      .from(vehicles)
      .innerJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
          branchFilter ? eq(vehicles.branchId, branchFilter) : undefined,
        ),
      ),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(branches.id, actor.branchIds),
        ),
      )
      .orderBy(asc(branches.name)),
  ]);

  const alerts = rows
    .flatMap(({ v, s, branch }) =>
      [
        {
          type: "Engine",
          ...serviceDue(
            v.currentOdometerKm,
            s.lastEngineServiceKm,
            s.engineServiceIntervalKm,
            policy.nearServiceKm,
          ),
        },
        {
          type: "Gear Oil",
          ...serviceDue(
            v.currentOdometerKm,
            s.lastGearOilChangeKm,
            s.gearOilIntervalKm,
            policy.nearServiceKm,
          ),
        },
      ]
        .filter(
          (a) =>
            a.show &&
            `${v.vehicleNumber} ${v.registrationNumber} ${branch}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .map((a) => ({ ...a, v, branch })),
    )
    .sort((a, b) => a.remainingKm - b.remainingKm);

  const total = alerts.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = alerts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (branchFilter) p.set("branch", branchFilter);
    p.set("page", String(nextPage));
    return `/${locale}/near-to-service?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--accent)]">{tNear("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{tNear("title")}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {tNear("subtitle", { km: policy.nearServiceKm.toLocaleString() })}
          </p>
        </div>
        <Link
          href={`/${locale}/service` as never}
          className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-4 text-sm"
        >
          {tNear("serviceRecords")}
        </Link>
      </div>

      <form className="grid gap-3 sm:grid-cols-3">
        <input
          name="q"
          defaultValue={q}
          placeholder={tExpiry("searchPlaceholder")}
          aria-label={tCommon("search")}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
        />
        <select
          name="branch"
          defaultValue={branchFilter}
          aria-label={tCommon("branch")}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">{tCommon("allBranches")}</option>
          {branchOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {b.code}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
          >
            {tCommon("search")}
          </button>
          {(q || branchFilter) && (
            <Link
              href={`/${locale}/near-to-service` as never}
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
            >
              {tCommon("clear")}
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-[var(--muted)]">{tNear("alertsCount", { count: total })}</p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--edge)] bg-[var(--surface)]">
        <table className="w-full min-w-[46rem] text-start text-sm">
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              {[
                tCommon("vehicle"),
                tCommon("registration"),
                tNear("serviceTypeCol"),
                tNear("currentKmCol"),
                tNear("nextServiceKmCol"),
                tNear("kmRemainingCol"),
                tCommon("branch"),
                tCommon("status"),
              ].map((h) => (
                <th key={h} className="p-3 text-start text-xs font-medium uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={`${a.v.id}-${a.type}`} className="border-t border-[var(--edge)]">
                <td className="p-3 font-medium">{a.v.vehicleNumber}</td>
                <td className="p-3 font-mono text-xs">{a.v.registrationNumber}</td>
                <td className="p-3">{translateStatus(tStatus, a.type)}</td>
                <td className="p-3">{a.v.currentOdometerKm.toLocaleString()}</td>
                <td className="p-3">{a.nextServiceKm.toLocaleString()}</td>
                <td className="p-3 font-semibold">{a.remainingKm.toLocaleString()}</td>
                <td className="p-3">{a.branch}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${
                      a.status === "Due / Overdue"
                        ? "bg-red-500/20 text-red-200"
                        : "bg-amber-400/20 text-amber-200"
                    }`}
                  >
                    {translateStatus(tStatus, a.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-6 text-sm text-[var(--muted)]">{tNear("noAlerts")}</p>}
      </div>

      {total > PAGE_SIZE && (
        <nav aria-label={tNear("title")} className="flex items-center justify-end gap-3 text-sm">
          {safePage > 1 && (
            <Link
              href={pageHref(safePage - 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              {tCommon("previous")}
            </Link>
          )}
          <span className="text-[var(--muted)]">
            {tCommon("pageOf", { page: safePage, total: totalPages })}
          </span>
          {safePage < totalPages && (
            <Link
              href={pageHref(safePage + 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              {tCommon("next")}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
