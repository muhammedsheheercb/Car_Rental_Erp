import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
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
  vehicleBrands,
  vehicleImages,
  vehicleInsurance,
  vehicleModels,
  vehiclePricing,
  vehicleRegistrations,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { resolveVehicleOperationalStatus } from "@/features/fleet/vehicle-actions";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import {
  availableFleet,
  operationalBlocking,
  vehicleCommitmentStatus,
} from "@/features/rentals/availability";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requireIdentity } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function buildLastSixMonths(currentYm: string) {
  const [yearStr, monthStr] = currentYm.split("-");
  const baseYear = Number.parseInt(yearStr, 10);
  const baseMonth = Number.parseInt(monthStr, 10) - 1;
  const result: { ym: string; label: string }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(Date.UTC(baseYear, baseMonth - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    result.push({
      ym: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[m],
    });
  }
  return result;
}

function buildSmoothCurvePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    path += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return path;
}

export default async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const [{ locale }, query, user, t, tCommon, tStatus] = await Promise.all([
    params,
    searchParams,
    requireIdentity(),
    getTranslations("dashboard"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const now = new Date();
  const day = formatOmanDateTime(now).slice(0, 10);
  const currentYm = day.slice(0, 7);
  const todayStart = parseOmanDateTime(`${day}T00:00`);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);
  const currentMonthStart = parseOmanDateTime(`${currentYm}-01T00:00`);
  const sixMonths = buildLastSixMonths(currentYm);
  const sixMonthsStart = parseOmanDateTime(`${sixMonths[0].ym}-01T00:00`);

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
    featuredVehicles,
    monthlyRevenueRows,
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
          gte(rentalCharges.createdAt, currentMonthStart),
        ),
      ),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(branchScope)
      .orderBy(asc(branches.name)),
    db
      .select({
        id: vehicles.id,
        number: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        status: vehicles.status,
        isActive: vehicles.isActive,
        branch: branches.name,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
        dailyRateBaisa: vehiclePricing.listRentBaisa,
        imageId: vehicleImages.id,
        rentalStatus: vehicleCommitmentStatus,
        operationallyBlocked: operationalBlocking,
      })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .innerJoin(branches, eq(vehicles.branchId, branches.id))
      .leftJoin(
        vehiclePricing,
        and(eq(vehiclePricing.vehicleId, vehicles.id), eq(vehiclePricing.period, "DAILY")),
      )
      .leftJoin(
        vehicleImages,
        and(eq(vehicleImages.vehicleId, vehicles.id), eq(vehicleImages.isPrimary, true)),
      )
      .where(and(vehicleScope, eq(vehicles.isActive, true)))
      .orderBy(
        sql`case when ${vehicleImages.id} is not null then 0 else 1 end`,
        desc(vehicles.createdAt),
      )
      .limit(2),
    db
      .select({
        ym: sql<string>`to_char(${rentalCharges.createdAt} AT TIME ZONE 'Asia/Muscat', 'YYYY-MM')`,
        totalBaisa: sql<number>`coalesce(sum(${rentalCharges.amountBaisa}), 0)::int`,
      })
      .from(rentalCharges)
      .innerJoin(rentals, eq(rentalCharges.rentalId, rentals.id))
      .where(
        and(
          rentalScope,
          eq(rentalCharges.type, "RENT_CHARGE"),
          gte(rentalCharges.createdAt, sixMonthsStart),
        ),
      )
      .groupBy(sql`to_char(${rentalCharges.createdAt} AT TIME ZONE 'Asia/Muscat', 'YYYY-MM')`),
  ]);

  const branchSummary = await Promise.all(
    branchRows.map(async (branch) => {
      const [fleet, active, reservation, branchRev] = await Promise.all([
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
        db
          .select({ value: sql<number>`coalesce(sum(${rentalCharges.amountBaisa}), 0)::int` })
          .from(rentalCharges)
          .innerJoin(rentals, eq(rentalCharges.rentalId, rentals.id))
          .where(
            and(
              eq(rentals.branchId, branch.id),
              eq(rentalCharges.type, "RENT_CHARGE"),
              gte(rentalCharges.createdAt, currentMonthStart),
            ),
          ),
      ]);
      return {
        ...branch,
        available: fleet[0]?.value ?? 0,
        active: active[0]?.value ?? 0,
        reserved: reservation[0]?.value ?? 0,
        revenueBaisa: branchRev[0]?.value ?? 0,
      };
    }),
  );

  // Build real 6-month revenue curve coordinates
  const revenueByYm = new Map(monthlyRevenueRows.map((row) => [row.ym, row.totalBaisa]));
  const series = sixMonths.map((item) => ({
    ...item,
    baisa: revenueByYm.get(item.ym) ?? 0,
  }));
  const maxBaisa = Math.max(1000, ...series.map((s) => s.baisa));
  const chartPoints = series.map((item, idx) => ({
    x: 16 + (idx * 288) / Math.max(1, series.length - 1),
    y: 108 - (item.baisa / maxBaisa) * 84,
    label: item.label,
    baisa: item.baisa,
  }));
  const curvePath = buildSmoothCurvePath(chartPoints);
  const lastPoint = chartPoints[chartPoints.length - 1];
  const prevMonthBaisa = series[series.length - 2]?.baisa ?? 0;
  const currMonthBaisa = series[series.length - 1]?.baisa ?? 0;
  const rawPct =
    prevMonthBaisa >= 5000 ? ((currMonthBaisa - prevMonthBaisa) / prevMonthBaisa) * 100 : null;
  const paceLabel =
    rawPct !== null && Math.abs(rawPct) <= 999
      ? `${rawPct >= 0 ? "+" : ""}${rawPct.toFixed(1)}%`
      : formatOMR(currMonthBaisa);

  const counts = {
    totalVehicles: totalVehicles[0]?.value ?? 0,
    availableVehicles: availableVehicles[0]?.value ?? 0,
    onRent: onRent[0]?.value ?? 0,
    reserved: reserved[0]?.value ?? 0,
    todayArrivals: todayArrivals[0]?.value ?? 0,
    todayReservations: todayReservations[0]?.value ?? 0,
    lateVehicles: lateVehicles[0]?.value ?? 0,
    nearService: nearService[0]?.value ?? 0,
    mulkiyaExpiring: mulkiyaExpiring[0]?.value ?? 0,
    insuranceExpiring: insuranceExpiring[0]?.value ?? 0,
    activeCustomers: activeCustomers[0]?.value ?? 0,
    outstandingBaisa: outstanding[0]?.value ?? 0,
    advancesBaisa: advances[0]?.value ?? 0,
    revenueBaisa: revenue[0]?.value ?? 0,
  };

  const telemetryCards: Array<{
    label: string;
    value: string | number;
    tone?: "default" | "danger" | "warn" | "accent";
    href?: string;
  }> = [
    { label: t("totalVehicles"), value: counts.totalVehicles, href: `/${locale}/fleet` },
    {
      label: t("availableVehicles"),
      value: counts.availableVehicles,
      tone: "accent",
      href: `/${locale}/operations/available`,
    },
    { label: t("onRent"), value: counts.onRent, href: `/${locale}/operations/on-rent` },
    { label: t("reserved"), value: counts.reserved, href: `/${locale}/rentals?status=RESERVED` },
    {
      label: t("todayArrival"),
      value: counts.todayArrivals,
      href: `/${locale}/operations/today-arrival`,
    },
    {
      label: t("todayReserve"),
      value: counts.todayReservations,
      href: `/${locale}/operations/today-reserve`,
    },
    {
      label: t("lateCar"),
      value: counts.lateVehicles,
      tone: counts.lateVehicles > 0 ? "danger" : "default",
      href: `/${locale}/operations/late-car`,
    },
    {
      label: t("nearService"),
      value: counts.nearService,
      tone: counts.nearService > 0 ? "warn" : "default",
      href: `/${locale}/near-to-service`,
    },
    {
      label: t("mulkiyaAlerts", { days: policy.expirySoonDays }),
      value: counts.mulkiyaExpiring,
      tone: counts.mulkiyaExpiring > 0 ? "warn" : "default",
      href: `/${locale}/expiry`,
    },
    {
      label: t("insuranceAlerts", { days: policy.expirySoonDays }),
      value: counts.insuranceExpiring,
      tone: counts.insuranceExpiring > 0 ? "warn" : "default",
      href: `/${locale}/expiry`,
    },
    { label: t("activeCustomers"), value: counts.activeCustomers, href: `/${locale}/customers` },
    {
      label: t("outstandingPayments"),
      value: formatOMR(counts.outstandingBaisa),
      href: `/${locale}/ledger`,
    },
    {
      label: t("advanceCollected"),
      value: formatOMR(counts.advancesBaisa),
      href: `/${locale}/finance/advance`,
    },
    {
      label: t("currentRevenue"),
      value: formatOMR(counts.revenueBaisa),
      tone: "accent",
      href: `/${locale}/reports?report=vehicle-income`,
    },
  ];

  const canCreateRental = can(user, "rentals", "create");

  return (
    <div className="space-y-6">
      {/* Signature Showroom Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9A7B4F]">
            {t("signatureShowroom")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#161513] sm:text-3xl">
            {t("greeting", { name: user.displayName })}
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
            {user.role === "SUPER_ADMIN"
              ? t("scopeAll")
              : t("scopeAssigned", { count: user.branchIds.length })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {permittedBranches.length > 1 && (
            <form className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-11 items-center rounded-full border border-[var(--edge)] bg-[var(--surface)] px-4 shadow-[0_2px_10px_rgba(22,21,19,0.03)] focus-within:border-[#9A7B4F]">
                <select
                  name="branch"
                  defaultValue={selectedBranchId}
                  aria-label={tCommon("branch")}
                  className="cursor-pointer bg-transparent text-xs font-medium text-[#161513] focus:outline-none sm:text-sm"
                >
                  <option value="">{tCommon("allPermittedBranches")}</option>
                  {permittedBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} · {branch.code}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-full border border-[var(--edge)] bg-[var(--surface)] px-4 text-xs font-semibold text-[#161513] shadow-[0_2px_10px_rgba(22,21,19,0.03)] transition-colors hover:border-[#9A7B4F] sm:text-sm"
              >
                {tCommon("filter")}
              </button>
              {rawBranch && (
                <Link
                  href={`/${locale}/dashboard` as never}
                  className="min-h-11 content-center rounded-full border border-[var(--edge)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[#8A6830] hover:border-[#9A7B4F]"
                >
                  {tCommon("clear")}
                </Link>
              )}
            </form>
          )}
          {canCreateRental && (
            <Link
              href={`/${locale}/rentals` as never}
              data-keep-light-text
              className="inline-flex min-h-11 items-center rounded-full bg-[#161513] px-5 text-xs font-semibold text-[#FAF8F5] shadow-[0_6px_18px_rgba(22,21,19,0.16)] transition-all hover:bg-[#292623] sm:text-sm"
            >
              {t("newReservation")}
            </Link>
          )}
        </div>
      </div>

      {/* Featured Showroom Vehicle Cards (Concept #14 Signature Gallery) */}
      {featuredVehicles.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2">
          {featuredVehicles.map((car) => {
            const opStatus = resolveVehicleOperationalStatus({
              rentalStatus: car.rentalStatus,
              status: car.status,
              isActive: car.isActive,
              operationallyBlocked: Boolean(car.operationallyBlocked),
            });
            const statusColor =
              opStatus === "AVAILABLE"
                ? "text-emerald-700"
                : opStatus === "ON_RENT"
                  ? "text-amber-700"
                  : opStatus === "RESERVED"
                    ? "text-sky-700"
                    : "text-[var(--muted)]";
            const dotColor =
              opStatus === "AVAILABLE"
                ? "bg-emerald-600"
                : opStatus === "ON_RENT"
                  ? "bg-amber-600"
                  : opStatus === "RESERVED"
                    ? "bg-sky-600"
                    : "bg-stone-400";
            return (
              <Link
                key={car.id}
                href={`/${locale}/fleet?q=${encodeURIComponent(car.registration)}` as never}
                className="group overflow-hidden rounded-[22px] border border-[var(--edge)] bg-[var(--surface)] shadow-[0_8px_28px_rgba(22,21,19,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#CFA968] hover:shadow-[0_14px_34px_rgba(22,21,19,0.09)]"
              >
                <div className="relative h-48 w-full overflow-hidden bg-gradient-to-b from-[#EAE5DB] via-[#F3EFE7] to-[#FAF8F4] sm:h-56">
                  {car.imageId ? (
                    /* biome-ignore lint/performance/noImgElement: authenticated private vehicle photo */
                    <img
                      src={`/api/vehicle-images/${car.imageId}`}
                      alt={`${car.brand} ${car.model}`}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-[#9A7B4F]">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 260 92"
                        className="h-24 w-full max-w-[260px]"
                        fill="none"
                      >
                        <path
                          d="M22 64 L36 44 L82 35 L114 21 L176 22 L206 37 L238 44 L242 64 Z"
                          stroke="#161513"
                          strokeOpacity="0.28"
                          strokeWidth="2"
                          fill="#161513"
                          fillOpacity="0.05"
                        />
                        <path
                          d="M88 37 L116 26 L170 26 L196 37 Z"
                          stroke="#9A7B4F"
                          strokeOpacity="0.45"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx="72"
                          cy="66"
                          r="13"
                          stroke="#161513"
                          strokeOpacity="0.35"
                          strokeWidth="2.2"
                          fill="#FAF8F4"
                        />
                        <circle
                          cx="194"
                          cy="66"
                          r="13"
                          stroke="#161513"
                          strokeOpacity="0.35"
                          strokeWidth="2.2"
                          fill="#FAF8F4"
                        />
                        <line
                          x1="12"
                          y1="80"
                          x2="248"
                          y2="80"
                          stroke="#9A7B4F"
                          strokeOpacity="0.3"
                          strokeWidth="1.2"
                        />
                      </svg>
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#8A8479]">
                        {car.brand} · {car.registration}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[#161513] sm:text-lg">
                      {car.brand} {car.model}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]">
                      {car.registration} · {car.branch}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm font-semibold tabular-nums text-[#161513] sm:text-base">
                      {car.dailyRateBaisa != null
                        ? `${formatOMR(car.dailyRateBaisa)} ${t("perDay")}`
                        : car.number}
                    </p>
                    <p
                      className={`mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold ${statusColor}`}
                    >
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotColor}`} />
                      {translateStatus(tStatus, opStatus)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[22px] border border-[var(--edge)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
          {t("noFeaturedVehicles")}
        </section>
      )}

      {/* Quick Operations Pill Links */}
      <OperationsLinks
        locale={locale}
        counts={{
          "today-reserve": counts.todayReservations,
          "today-arrival": counts.todayArrivals,
          "on-rent": counts.onRent,
          available: counts.availableVehicles,
          "late-car": counts.lateVehicles,
        }}
      />

      {/* Signature Lower Split: Branch Operations + 6-Month Revenue Pace */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section className="flex flex-col overflow-hidden rounded-[22px] border border-[var(--edge)] bg-[var(--surface)] shadow-[0_8px_28px_rgba(22,21,19,0.04)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--edge)] px-5 py-4">
            <h2 className="text-base font-semibold text-[#161513]">{t("branchOperations")}</h2>
            <span className="text-xs font-semibold text-[#9A7B4F]">
              {t("activeBranchesBadge", { count: branchSummary.length })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead className="border-b border-[var(--edge)] bg-[var(--raised)] text-[10px] uppercase tracking-[0.07em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{tCommon("branch")}</th>
                  <th className="px-2 py-3 text-center font-semibold">{t("available")}</th>
                  <th className="px-2 py-3 text-center font-semibold">{t("onRent")}</th>
                  <th className="px-2 py-3 text-center font-semibold">{t("reserved")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("revenueCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--edge)]">
                {branchSummary.map((branch) => (
                  <tr key={branch.id} className="transition-colors hover:bg-[#FAF8F4]">
                    <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-[#161513]">
                      <span>{branch.name}</span>
                      <span className="ms-1.5 inline-block whitespace-nowrap rounded bg-[#F4F1EA] px-1.5 py-0.5 font-mono text-[10.5px] font-normal text-[var(--muted)]">
                        {branch.code}
                      </span>
                    </td>
                    <td className="px-2 py-3.5 text-center tabular-nums">{branch.available}</td>
                    <td className="px-2 py-3.5 text-center tabular-nums">{branch.active}</td>
                    <td className="px-2 py-3.5 text-center tabular-nums">{branch.reserved}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-end font-semibold tabular-nums text-[#161513]">
                      {formatOMR(branch.revenueBaisa)}
                    </td>
                  </tr>
                ))}
                {!branchSummary.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[var(--muted)]">
                      {t("noAssignedBranches")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6-Month Live Revenue Pace SVG Card */}
        <section className="flex flex-col justify-between rounded-[22px] border border-[var(--edge)] bg-[var(--surface)] p-5 shadow-[0_8px_28px_rgba(22,21,19,0.04)] sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#161513]">{t("revenuePace")}</h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-emerald-700">
              {paceLabel}
            </span>
          </div>
          <div className="my-4">
            <svg
              role="img"
              aria-label={t("revenuePace")}
              viewBox="0 0 320 138"
              className="h-36 w-full"
            >
              <defs>
                <linearGradient id="ivoryPaceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9A7B4F" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#9A7B4F" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="12" y1="34" x2="308" y2="34" stroke="#EDE8DE" strokeDasharray="3 4" />
              <line x1="12" y1="72" x2="308" y2="72" stroke="#EDE8DE" strokeDasharray="3 4" />
              <line x1="12" y1="108" x2="308" y2="108" stroke="#EDE8DE" />
              {curvePath && (
                <>
                  <path
                    d={`${curvePath} L ${lastPoint.x.toFixed(1)} 108 L ${chartPoints[0].x.toFixed(1)} 108 Z`}
                    fill="url(#ivoryPaceFill)"
                  />
                  <path
                    d={curvePath}
                    fill="none"
                    stroke="#161513"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </>
              )}
              {lastPoint && (
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="5"
                  fill="#9A7B4F"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              )}
              {chartPoints.map((pt) => (
                <text
                  key={pt.label}
                  x={pt.x}
                  y="130"
                  textAnchor="middle"
                  fill="#8A8479"
                  fontSize="10.5"
                >
                  {pt.label}
                </text>
              ))}
            </svg>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--edge)] pt-3 text-xs text-[var(--muted)]">
            <span className="min-w-0 truncate">{t("allAmountsVerified")}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#161513]">
              {formatOMR(counts.revenueBaisa)}
            </span>
          </div>
        </section>
      </div>

      {/* Complete Live Operational Metrics Grid (All 14 KPIs Accessible & Clickable) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#8A8479]">
            {t("operationalMetrics")}
          </h2>
          <Link
            href={`/${locale}/fleet` as never}
            className="text-xs font-semibold text-[#8A6830] hover:underline"
          >
            {t("viewFleet")} →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {telemetryCards.map((item) => {
            const cardTone =
              item.tone === "danger"
                ? "border-red-200 bg-red-50/70"
                : item.tone === "warn"
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-[var(--edge)] bg-[var(--surface)]";
            const valueTone =
              item.tone === "danger"
                ? "text-red-700"
                : item.tone === "warn"
                  ? "text-amber-800"
                  : item.tone === "accent"
                    ? "text-[#8A6830]"
                    : "text-[#161513]";
            const content = (
              <>
                <p className="text-xs font-medium leading-snug text-[var(--muted)]">{item.label}</p>
                <p className={`mt-2 text-lg font-semibold tabular-nums ${valueTone}`}>
                  {item.value}
                </p>
              </>
            );
            return item.href ? (
              <Link
                key={item.label}
                href={item.href as never}
                className={`flex min-h-[5.5rem] flex-col justify-between rounded-2xl border p-3.5 shadow-[0_2px_10px_rgba(22,21,19,0.03)] transition-all hover:-translate-y-0.5 hover:border-[#CFA968] ${cardTone}`}
              >
                {content}
              </Link>
            ) : (
              <div
                key={item.label}
                className={`flex min-h-[5.5rem] flex-col justify-between rounded-2xl border p-3.5 shadow-[0_2px_10px_rgba(22,21,19,0.03)] ${cardTone}`}
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
