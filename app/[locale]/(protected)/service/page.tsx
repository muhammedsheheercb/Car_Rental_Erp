import { and, desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ServiceForm, ServiceStatusForm } from "@/components/service-form";
import { db } from "@/db/client";
import {
  branches,
  customers,
  rentals,
  serviceHistory,
  userBranches,
  users,
  vehicleBrands,
  vehicleServices,
  vehicles,
} from "@/db/schema";
import { omrInput } from "@/features/invoices/calculations";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";
export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; branch?: string; page?: string }>;
}) {
  const [actor, { locale }, query, tService, tNav, tCommon, tStatus] = await Promise.all([
    requirePermission("fleet", "read"),
    params,
    searchParams,
    getTranslations("service"),
    getTranslations("nav"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const statusFilter = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
    query.status ?? "",
  )
    ? (query.status as string)
    : "";
  const branchFilter =
    query.branch && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(query.branch)
      ? query.branch
      : "";
  const [fleet, staff, bookings, records] = await Promise.all([
    db
      .select({ v: vehicles, brand: vehicleBrands.name, branch: branches.name })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
        ),
      ),
    db
      .select({ id: users.id, name: users.displayName, branchId: userBranches.branchId })
      .from(users)
      .leftJoin(userBranches, eq(userBranches.userId, users.id))
      .where(
        and(
          eq(users.isActive, true),
          actor.role === "SUPER_ADMIN"
            ? undefined
            : or(eq(users.id, actor.id), inArray(userBranches.branchId, actor.branchIds)),
        ),
      ),
    db
      .select({ r: rentals, customer: customers.name })
      .from(rentals)
      .innerJoin(customers, eq(customers.id, rentals.customerId))
      .where(
        and(
          inArray(rentals.status, ["ACTIVE", "RETURNED"]),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds),
        ),
      ),
    db
      .select({ s: vehicleServices, v: vehicles, branch: branches.name, staff: users.displayName })
      .from(vehicleServices)
      .innerJoin(vehicles, eq(vehicles.id, vehicleServices.vehicleId))
      .innerJoin(branches, eq(branches.id, vehicleServices.branchId))
      .leftJoin(users, eq(users.id, vehicleServices.staffId))
      .where(
        actor.role === "SUPER_ADMIN"
          ? undefined
          : inArray(vehicleServices.branchId, actor.branchIds),
      )
      .orderBy(desc(vehicleServices.createdAt)),
  ]);
  const branchOptions = [
    ...new Map(
      fleet.map(({ v, branch }) => [v.branchId, { id: v.branchId, name: branch }]),
    ).values(),
  ];
  const filtered = records.filter(({ s, v }) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (branchFilter && (s.branchId ?? v.branchId) !== branchFilter) return false;
    return `${v.vehicleNumber} ${v.registrationNumber} ${s.type} ${s.status} ${String(s.snapshot.customer ?? "")}`
      .toLowerCase()
      .includes((query.q ?? "").toLowerCase());
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / 15));
  const safePage = Math.min(page, totalPages);
  const shown = filtered.slice((safePage - 1) * 15, safePage * 15);
  const servicePageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (query.q) p.set("q", query.q);
    if (statusFilter) p.set("status", statusFilter);
    if (branchFilter) p.set("branch", branchFilter);
    p.set("page", String(nextPage));
    return `/${locale}/service?${p.toString()}`;
  };
  const history = shown.length
    ? await db
        .select()
        .from(serviceHistory)
        .where(
          inArray(
            serviceHistory.serviceId,
            shown.map((r) => r.s.id),
          ),
        )
        .orderBy(desc(serviceHistory.createdAt))
    : [];
  const now = formatOmanDateTime(new Date());
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{tService("title")}</h1>
      <div className="flex flex-wrap gap-4">
        <Link href={`/${locale}/near-to-service` as never}>{tNav("nearToService")}</Link>
        <Link href={`/${locale}/expiry` as never}>{tNav("expiry")}</Link>
      </div>
      {can(actor, "fleet", "create") && (
        <ServiceForm
          actorId={actor.id}
          now={now}
          vehicles={fleet
            .filter(({ v }) => can(actor, "fleet", "create", v.branchId))
            .map(({ v, brand, branch }) => ({
              id: v.id,
              name: v.vehicleNumber,
              registration: v.registrationNumber,
              brand,
              branch,
              km: v.currentOdometerKm,
              staff: [
                ...new Map(
                  staff
                    .filter((s) => s.id === actor.id || s.branchId === v.branchId)
                    .map((s) => [s.id, { id: s.id, name: s.name }]),
                ).values(),
              ],
              bookings: bookings
                .filter(({ r }) => r.vehicleId === v.id)
                .map(({ r, customer }) => ({
                  id: r.id,
                  name: `${r.agreementNumber} · ${customer}`,
                  customer,
                  out: formatOmanDateTime(r.startsAt),
                })),
            }))}
        />
      )}
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          name="q"
          defaultValue={query.q}
          placeholder={tService("searchPlaceholder")}
          aria-label={tCommon("search")}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          aria-label={tCommon("status")}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">{tCommon("allStatuses")}</option>
          <option value="SCHEDULED">{tStatus("SCHEDULED")}</option>
          <option value="IN_PROGRESS">{tStatus("IN_PROGRESS")}</option>
          <option value="COMPLETED">{tStatus("COMPLETED")}</option>
          <option value="CANCELLED">{tStatus("CANCELLED")}</option>
        </select>
        <select
          name="branch"
          defaultValue={branchFilter}
          aria-label={tCommon("branch")}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
        >
          <option value="">{tCommon("allBranches")}</option>
          {branchOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
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
          {(query.q || statusFilter || branchFilter) && (
            <Link
              href={`/${locale}/service` as never}
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
            >
              {tCommon("clear")}
            </Link>
          )}
        </div>
      </form>
      <section className="grid gap-4">
        {shown.map(({ s, v, branch, staff }) => (
          <article key={s.id} className="rounded-xl border border-[var(--edge)] p-4">
            <h2 className="text-lg font-semibold">
              {v.vehicleNumber} · {v.registrationNumber} · {translateStatus(tStatus, s.type)}
            </h2>
            <p>
              {translateStatus(tStatus, s.serviceBy)} · {translateStatus(tStatus, s.status)} ·{" "}
              {branch} · {tService("staff")}: {staff ?? "—"}
            </p>
            <p>
              {tService("outLabel")}: {s.outAt ? formatOmanDateTime(s.outAt) : "—"} ·{" "}
              {tService("completedLabel")}:{" "}
              {s.completedAt ? formatOmanDateTime(s.completedAt) : "—"}
            </p>
            <p>
              {tCommon("km")}: {s.kmReading ?? "—"} → {s.serviceOdometerKm ?? "—"} ·{" "}
              {tService("dueLabel")}: {s.dueDate ?? "—"} / {s.dueOdometerKm ?? "—"} {tCommon("km")}
            </p>
            <p>
              {tCommon("customer")}: {String(s.snapshot.customer ?? "—")} ·{" "}
              {tService("bookingLabel")}: {String(s.snapshot.booking ?? "—")}
            </p>
            <p>
              {tService("expenseLabel")}: {tCommon("omr")} {omrInput(s.costBaisa)} ·{" "}
              {s.paymentMode ? translateStatus(tStatus, s.paymentMode) : "—"}
            </p>
            <p>{s.note}</p>
            {!["COMPLETED", "CANCELLED"].includes(s.status) &&
              can(actor, "fleet", "update", s.branchId ?? v.branchId) && (
                <ServiceStatusForm
                  serviceId={s.id}
                  currentKm={v.currentOdometerKm}
                  status={s.status}
                  now={now}
                />
              )}
            <details className="mt-3">
              <summary>{tService("serviceHistory")}</summary>
              {history
                .filter((h) => h.serviceId === s.id)
                .map((h) => (
                  <p key={h.id}>
                    {formatOmanDateTime(h.createdAt)} {tCommon("omanTime")} ·{" "}
                    {translateStatus(tStatus, h.action)} · {String(h.snapshot.remarks ?? "")}
                  </p>
                ))}
            </details>
          </article>
        ))}
        {!shown.length && <p>{tService("noServices")}</p>}
      </section>
      {filtered.length > 15 && (
        <nav aria-label={tService("title")} className="flex items-center justify-end gap-3 text-sm">
          {safePage > 1 && (
            <Link
              href={servicePageHref(safePage - 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              {tCommon("previous")}
            </Link>
          )}
          <span className="text-[var(--muted)]">
            {tCommon("pageOf", { page: safePage, total: totalPages })} ·{" "}
            {tCommon("recordsCount", { count: filtered.length })}
          </span>
          {safePage < totalPages && (
            <Link
              href={servicePageHref(safePage + 1) as never}
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
