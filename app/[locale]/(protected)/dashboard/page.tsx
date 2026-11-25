import { and, asc, count, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OperationsLinks } from "@/components/operations-links";
import { db } from "@/db/client";
import {
  branches,
  customerLedger,
  customers,
  payments,
  rentalCharges,
  rentals,
  vehicleInsurance,
  vehicleRegistrations,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { availableFleet } from "@/features/rentals/availability";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { requireIdentity } from "@/lib/auth";

const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const [{ locale }, query, user, t, tCommon] = await Promise.all([
    params,
    searchParams,
    requireIdentity(),
    getTranslations("dashboard"),
    getTranslations("common"),
  ]);
  const now = new Date();
  const day = formatOmanDateTime(now).slice(0, 10);
  const todayStart = parseOmanDateTime(`${day}T00:00`);
  const todayEnd = new Date(parseOmanDateTime(`${day}T00:00`).getTime() + 86_400_000 - 1);
  const policy = await fleetAlertSettings();
  const expiryLimitDate = new Date(now);
  expiryLimitDate.setTime(expiryLimitDate.getTime() + policy.expirySoonDays * 86_400_000);
  const expiryLimit = formatOmanDateTime(expiryLimitDate).slice(0, 10);
  const permittedBranchScope =
    user.role === "SUPER_ADMIN" ? undefined : inArray(branches.id, user.branchIds);
  const permittedBranches = await db
    .select({ id: branches.id, name: branches.name, code: branches.code })
    .from(branches)
    .where(and(eq(branches.isActive, true), permittedBranchScope))
    .orderBy(asc(branches.name));

  const rawBranch = query.branch?.trim() ?? "";
  let selectedBranchIds: string[] | undefined;
  let selectedBranchId = "";
  if (rawBranch) {
    if (UUID_RE.test(rawBranch)) {
      const match = permittedBranches.find((b) => b.id === rawBranch);
      if (match) {
        selectedBranchId = match.id;
        selectedBranchIds = [match.id];
      }
    } else {
      const matched = await db
        .select({ id: branches.id })
        .from(branches)
        .where(
          and(
            permittedBranchScope,
            or(ilike(branches.name, `%${rawBranch}%`), ilike(branches.code, `%${rawBranch}%`)),
          ),
        );
      selectedBranchIds = matched.map((b) => b.id);
      if (matched.length === 1) selectedBranchId = matched[0].id;
    }
  }

  const effectiveBranchIds =
    selectedBranchIds ?? (user.role === "SUPER_ADMIN" ? undefined : user.branchIds);
  const noBranchMatch = effectiveBranchIds !== undefined && effectiveBranchIds.length === 0;
  const vehicleScope = noBranchMatch
    ? sql`false`
    : effectiveBranchIds
      ? inArray(vehicles.branchId, effectiveBranchIds)
      : undefined;
  const rentalScope = noBranchMatch
    ? sql`false`
    : effectiveBranchIds
      ? inArray(rentals.branchId, effectiveBranchIds)
      : undefined;
  const paymentScope = noBranchMatch
    ? sql`false`
    : effectiveBranchIds
      ? inArray(payments.branchId, effectiveBranchIds)
      : undefined;
  const branchScope = noBranchMatch
    ? sql`false`
    : effectiveBranchIds
      ? inArray(branches.id, effectiveBranchIds)
      : undefined;
  const [
    totalVehicles,
    availableVehicles,
    onRent,
    reserved,
    todayArrivals,
    todayReservations,
    lateVehicles,
    nearService,
    mulkiyaExpiring,
    insuranceExpiring,
    activeCustomers,
    outstanding,
    advances,
    revenue,
    branchRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(vehicles).where(vehicleScope),
    db.select({ value: count() }).from(vehicles).where(and(vehicleScope, availableFleet)),
    db
      .select({ value: count() })
      .from(rentals)
      .where(and(rentalScope, eq(rentals.status, "ACTIVE"))),
    db
      .select({ value: count() })
      .from(rentals)
      .where(and(rentalScope, eq(rentals.status, "RESERVED"))),
    db
      .select({ value: count() })
      .from(rentals)
      .where(
        and(
          rentalScope,
          eq(rentals.status, "ACTIVE"),
          gte(rentals.expectedReturnAt, todayStart),
          lte(rentals.expectedReturnAt, todayEnd),
        ),
      ),
    db
      .select({ value: count() })
      .from(rentals)
      .where(
        and(
          rentalScope,
          eq(rentals.status, "RESERVED"),
          gte(rentals.startsAt, todayStart),
          lte(rentals.startsAt, todayEnd),
        ),
      ),
    db
      .select({ value: count() })
      .from(rentals)
      .where(and(rentalScope, eq(rentals.status, "ACTIVE"), lt(rentals.expectedReturnAt, now))),
    db
      .select({ value: count() })
      .from(vehicles)
      .innerJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .where(
        and(
          vehicleScope,
          eq(vehicles.isActive, true),
          sql`${vehicles.currentOdometerKm} + ${policy.nearServiceKm} >= ${vehicleServiceSettings.lastEngineServiceKm} + ${vehicleServiceSettings.engineServiceIntervalKm}`,
        ),
      ),
    db
      .select({ value: count() })
      .from(vehicles)
      .innerJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .where(
        and(
          vehicleScope,
          gte(vehicleRegistrations.mulkiyaExpiryDate, day),
          lte(vehicleRegistrations.mulkiyaExpiryDate, expiryLimit),
        ),
      ),
    db
      .select({ value: count() })
      .from(vehicles)
      .innerJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .where(
        and(
          vehicleScope,
          gte(vehicleInsurance.validUntil, day),
          lte(vehicleInsurance.validUntil, expiryLimit),
        ),
      ),
    db.select({ value: count() }).from(customers).where(eq(customers.isActive, true)),
    db
      .select({
        value: sql<number>`coalesce(sum(${customerLedger.debitBaisa}) - sum(${customerLedger.creditBaisa}), 0)::int`,
      })
      .from(customerLedger)
      .leftJoin(rentals, eq(customerLedger.rentalId, rentals.id))
      .where(rentalScope),
    db
      .select({ value: sql<number>`coalesce(sum(${payments.amountBaisa}), 0)::int` })
      .from(payments)
      .innerJoin(rentals, eq(payments.rentalId, rentals.id))
      .where(and(paymentScope, eq(payments.direction, "RECEIPT"), eq(rentals.status, "RESERVED"))),
    db
      .select({ value: sql<number>`coalesce(sum(${rentalCharges.amountBaisa}), 0)::int` })
      .from(rentalCharges)
      .innerJoin(rentals, eq(rentalCharges.rentalId, rentals.id))
      .where(
        and(
          rentalScope,
          eq(rentalCharges.type, "RENT_CHARGE"),
          gte(rentalCharges.createdAt, parseOmanDateTime(`${day.slice(0, 7)}-01T00:00`)),
        ),
      ),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(branchScope),
  ]);
  const branchSummary = await Promise.all(
    branchRows.map(async (branch) => {
      const [fleet, active, reservation] = await Promise.all([
        db
          .select({ value: count() })
          .from(vehicles)
          .where(and(eq(vehicles.branchId, branch.id), availableFleet)),
        db
          .select({ value: count() })
          .from(rentals)
          .where(and(eq(rentals.branchId, branch.id), eq(rentals.status, "ACTIVE"))),
        db
          .select({ value: count() })
          .from(rentals)
          .where(and(eq(rentals.branchId, branch.id), eq(rentals.status, "RESERVED"))),
      ]);
      return {
        ...branch,
        available: fleet[0]?.value ?? 0,
        active: active[0]?.value ?? 0,
        reserved: reservation[0]?.value ?? 0,
      };
    }),
  );
  const metrics: [string, string | number][] = [
    [t("totalVehicles"), totalVehicles[0]?.value ?? 0],
    [t("availableVehicles"), availableVehicles[0]?.value ?? 0],
    [t("onRent"), onRent[0]?.value ?? 0],
    [t("reserved"), reserved[0]?.value ?? 0],
    [t("todayArrival"), todayArrivals[0]?.value ?? 0],
    [t("todayReserve"), todayReservations[0]?.value ?? 0],
    [t("lateCar"), lateVehicles[0]?.value ?? 0],
    [t("nearService"), nearService[0]?.value ?? 0],
    [t("mulkiyaAlerts", { days: policy.expirySoonDays }), mulkiyaExpiring[0]?.value ?? 0],
    [t("insuranceAlerts", { days: policy.expirySoonDays }), insuranceExpiring[0]?.value ?? 0],
    [t("activeCustomers"), activeCustomers[0]?.value ?? 0],
    [t("outstandingPayments"), formatOMR(outstanding[0]?.value ?? 0)],
    [t("advanceCollected"), formatOMR(advances[0]?.value ?? 0)],
    [t("currentRevenue"), formatOMR(revenue[0]?.value ?? 0)],
  ];
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">{t("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">
            {t("greeting", { name: user.displayName })}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {user.role === "SUPER_ADMIN"
              ? t("scopeAll")
              : t("scopeAssigned", { count: user.branchIds.length })}
          </p>
        </div>
        {permittedBranches.length > 1 && (
          <form className="flex flex-wrap items-center gap-2">
            <select
              name="branch"
              defaultValue={selectedBranchId}
              aria-label={tCommon("branch")}
              className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm"
            >
              <option value="">{tCommon("allPermittedBranches")}</option>
              {permittedBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} · {branch.code}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
            >
              {tCommon("filter")}
            </button>
            {rawBranch && (
              <Link
                href={`/${locale}/dashboard` as never}
                className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
              >
                {tCommon("clear")}
              </Link>
            )}
          </form>
        )}
      </div>
      <OperationsLinks locale={locale} />
      <section className="grid gap-px overflow-hidden border border-[var(--edge)] bg-[var(--edge)] sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-h-28 bg-[var(--surface)] p-4">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <section className="border border-[var(--edge)] bg-[var(--surface)]">
        <div className="border-b border-[var(--edge)] p-4">
          <h2 className="font-semibold">{t("branchOperations")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th className="p-3">{tCommon("branch")}</th>
                <th className="p-3 text-center">{t("available")}</th>
                <th className="p-3 text-center">{t("onRent")}</th>
                <th className="p-3 text-center">{t("reserved")}</th>
              </tr>
            </thead>
            <tbody>
              {branchSummary.map((branch) => (
                <tr key={branch.id} className="border-t border-[var(--edge)]">
                  <td className="p-3 font-medium">
                    {branch.name}
                    <span className="ms-2 font-mono text-xs text-[var(--muted)]">
                      {branch.code}
                    </span>
                  </td>
                  <td className="p-3 text-center">{branch.available}</td>
                  <td className="p-3 text-center">{branch.active}</td>
                  <td className="p-3 text-center">{branch.reserved}</td>
                </tr>
              ))}
              {!branchSummary.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[var(--muted)]">
                    {t("noAssignedBranches")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
