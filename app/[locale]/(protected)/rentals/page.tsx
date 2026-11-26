import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookingRowActions } from "@/components/booking-row-actions";
import { BookingsControls } from "@/components/bookings-controls";
import { OperationsLinks } from "@/components/operations-links";
import { RentalBookingForm } from "@/components/rental-booking-form";
import { db } from "@/db/client";
import {
  branches,
  customerBlacklist,
  customers,
  rentals,
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehiclePricing,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { operationalBlocking } from "@/features/rentals/availability";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePagePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

const PAGE_SIZE = 15;
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function RentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    vehicleId?: string;
    customerId?: string;
    q?: string;
    status?: string;
    branch?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const [identity, t, tRentals, tCommon, tStatus] = await Promise.all([
    requirePagePermission(locale, "rentals", "read"),
    getTranslations(),
    getTranslations("rentals"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const scoped =
    identity.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, identity.branchIds);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const q = query.q?.trim() ?? "";
  const statusFilter = ["RESERVED", "ACTIVE", "RETURNED", "CANCELLED"].includes(query.status ?? "")
    ? (query.status as "RESERVED" | "ACTIVE" | "RETURNED" | "CANCELLED")
    : undefined;
  const branchFilter = query.branch && UUID_RE.test(query.branch) ? query.branch : undefined;

  const parseDate = (value?: string) => {
    try {
      return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseOmanDateTime(`${value}T00:00`)
        : undefined;
    } catch {
      return undefined;
    }
  };
  const fromDate = parseDate(query.from);
  const toDate = parseDate(query.to);

  const listWhere = and(
    identity.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, identity.branchIds),
    statusFilter ? eq(rentals.status, statusFilter) : undefined,
    branchFilter ? eq(rentals.branchId, branchFilter) : undefined,
    fromDate ? gte(rentals.startsAt, fromDate) : undefined,
    toDate ? lt(rentals.startsAt, new Date(toDate.getTime() + 86_400_000)) : undefined,
    q
      ? or(
          ilike(rentals.agreementNumber, `%${q}%`),
          ilike(customers.name, `%${q}%`),
          ilike(customers.mobile, `%${q}%`),
          ilike(vehicles.vehicleNumber, `%${q}%`),
          ilike(vehicles.registrationNumber, `%${q}%`),
        )
      : undefined,
  );

  const today = formatOmanDateTime(new Date()).slice(0, 10);

  const [
    vehicleRows,
    customerRows,
    preselectedCustomer,
    activeBlacklistRows,
    pricingRows,
    branchRows,
    recent,
    totalRows,
    reservedPeriods,
  ] = await Promise.all([
    db
      .select({
        id: vehicles.id,
        number: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
        branchId: vehicles.branchId,
        branchName: branches.name,
        currentOdometerKm: vehicles.currentOdometerKm,
        nextEngineServiceKm: sql<
          number | null
        >`${vehicleServiceSettings.lastEngineServiceKm} + ${vehicleServiceSettings.engineServiceIntervalKm}`,
        nextGearOilKm: sql<
          number | null
        >`${vehicleServiceSettings.lastGearOilChangeKm} + ${vehicleServiceSettings.gearOilIntervalKm}`,
        insuranceExpiry: vehicleInsurance.validUntil,
      })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .innerJoin(branches, eq(vehicles.branchId, branches.id))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicles.isActive, true),
          eq(vehicles.status, "AVAILABLE"),
          not(operationalBlocking),
          scoped,
        ),
      )
      .orderBy(asc(vehicles.vehicleNumber)),
    db
      .select({
        id: customers.id,
        name: customers.name,
        mobile: customers.mobile,
        address: customers.address,
        civilIdNumber: customers.civilIdNumber,
        civilIdExpiry: customers.civilIdExpiry,
        passportNumber: customers.passportNumber,
        passportExpiry: customers.passportExpiry,
        drivingLicenceNumber: customers.drivingLicenceNumber,
        drivingLicenceExpiry: customers.drivingLicenceExpiry,
        visaNumber: customers.visaNumber,
        visaExpiry: customers.visaExpiry,
        sponsorDetails: customers.sponsorDetails,
      })
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.name))
      .limit(200),
    query.customerId && UUID_RE.test(query.customerId)
      ? db
          .select({
            id: customers.id,
            name: customers.name,
            mobile: customers.mobile,
            address: customers.address,
            civilIdNumber: customers.civilIdNumber,
            civilIdExpiry: customers.civilIdExpiry,
            passportNumber: customers.passportNumber,
            passportExpiry: customers.passportExpiry,
            drivingLicenceNumber: customers.drivingLicenceNumber,
            drivingLicenceExpiry: customers.drivingLicenceExpiry,
            visaNumber: customers.visaNumber,
            visaExpiry: customers.visaExpiry,
            sponsorDetails: customers.sponsorDetails,
          })
          .from(customers)
          .where(and(eq(customers.id, query.customerId), eq(customers.isActive, true)))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        customerId: customerBlacklist.customerId,
        reason: customerBlacklist.reason,
      })
      .from(customerBlacklist)
      .where(
        and(
          eq(customerBlacklist.isActive, true),
          or(isNull(customerBlacklist.startsAt), lte(customerBlacklist.startsAt, today)),
          or(isNull(customerBlacklist.endsAt), gte(customerBlacklist.endsAt, today)),
        ),
      ),
    db
      .select({
        vehicleId: vehiclePricing.vehicleId,
        period: vehiclePricing.period,
        listRentBaisa: vehiclePricing.listRentBaisa,
        minimumRentBaisa: vehiclePricing.minimumRentBaisa,
        includedKm: vehiclePricing.includedKm,
        excessKmChargeBaisa: vehiclePricing.excessKmChargeBaisa,
        lateFeeBaisa: vehiclePricing.lateFeeBaisa,
      })
      .from(vehiclePricing),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.isActive, true),
          identity.role === "SUPER_ADMIN" ? undefined : inArray(branches.id, identity.branchIds),
        ),
      )
      .orderBy(asc(branches.name)),
    db
      .select({
        id: rentals.id,
        agreement: rentals.agreementNumber,
        status: rentals.status,
        branchId: rentals.branchId,
        pickupBranchId: rentals.pickupBranchId,
        returnBranchId: rentals.returnBranchId,
        branchName: branches.name,
        startsAt: rentals.startsAt,
        expectedReturnAt: rentals.expectedReturnAt,
        pricingPeriod: rentals.pricingPeriod,
        rentDuration: rentals.rentDuration,
        pickupOdometerKm: rentals.pickupOdometerKm,
        vehicleOdometerKm: vehicles.currentOdometerKm,
        freeKm: rentals.freeKm,
        openKm: rentals.openKm,
        notes: rentals.notes,
        total: rentals.totalBaisa,
        customer: customers.name,
        customerMobile: customers.mobile,
        vehicle: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
      })
      .from(rentals)
      .innerJoin(customers, eq(rentals.customerId, customers.id))
      .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .innerJoin(branches, eq(rentals.branchId, branches.id))
      .where(listWhere)
      .orderBy(desc(rentals.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: count() })
      .from(rentals)
      .innerJoin(customers, eq(rentals.customerId, customers.id))
      .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .where(listWhere),
    db
      .select({
        vehicleId: rentals.vehicleId,
        startsAt: rentals.startsAt,
        expectedReturnAt: rentals.expectedReturnAt,
        status: rentals.status,
      })
      .from(rentals)
      .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
      .where(and(inArray(rentals.status, ["RESERVED", "ACTIVE"]), scoped)),
  ]);

  const blacklistByCustomer = new Map<string, string>();
  for (const row of activeBlacklistRows) {
    if (!blacklistByCustomer.has(row.customerId)) {
      blacklistByCustomer.set(row.customerId, row.reason);
    }
  }

  const mergedCustomers = (
    preselectedCustomer[0] && !customerRows.some((c) => c.id === preselectedCustomer[0].id)
      ? [preselectedCustomer[0], ...customerRows]
      : customerRows
  ).map((c) => ({
    ...c,
    blacklistReason: blacklistByCustomer.get(c.id) ?? null,
  }));

  const canCreate = can(identity, "rentals", "create");
  const defaultBranch = branchRows[0]?.id ?? "";
  const total = totalRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusFilter) p.set("status", statusFilter);
    if (branchFilter) p.set("branch", branchFilter);
    if (query.from) p.set("from", query.from);
    if (query.to) p.set("to", query.to);
    p.set("page", String(nextPage));
    return `/${locale}/rentals?${p.toString()}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--accent)]">{tRentals("eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("nav.rentals")}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{tRentals("subtitle")}</p>
      </div>
      <OperationsLinks locale={locale} />
      {canCreate && (
        <RentalBookingForm
          locale={locale}
          vehicles={vehicleRows}
          prices={pricingRows}
          customers={mergedCustomers}
          branches={branchRows}
          defaultBranch={defaultBranch}
          initialVehicleId={query.vehicleId}
          initialCustomerId={query.customerId}
          canOverridePrice={
            (identity.role === "ADMIN" || identity.role === "SUPER_ADMIN") &&
            can(identity, "rentals", "override_price")
          }
          userName={identity.displayName}
          reservations={reservedPeriods.map((reservation) => ({
            ...reservation,
            startsAt: reservation.startsAt.toISOString(),
            expectedReturnAt: reservation.expectedReturnAt.toISOString(),
          }))}
        />
      )}
      <section className="overflow-hidden rounded-2xl border border-[var(--edge)] bg-[var(--surface)]">
        <div className="border-b border-[var(--edge)] p-4">
          <h2 className="font-semibold">{tRentals("bookingsHeading")}</h2>
        </div>
        <BookingsControls total={total} branches={branchRows} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[66rem] text-start text-sm">
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th className="p-3 text-start">{tRentals("agreementCol")}</th>
                <th className="p-3 text-start">{tCommon("customer")}</th>
                <th className="p-3 text-start">{tCommon("vehicle")}</th>
                <th className="p-3 text-start">{tCommon("branch")}</th>
                <th className="p-3 text-start">{tRentals("periodCol")}</th>
                <th className="p-3 text-center">{tCommon("status")}</th>
                <th className="p-3 text-end">{tCommon("total")}</th>
                <th className="p-3 text-center">{tCommon("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-[var(--edge)] hover:bg-white/5">
                  <td className="p-3 font-medium">
                    <Link
                      href={`/${locale}/rentals/${r.id}` as never}
                      className="text-[var(--accent)] underline"
                    >
                      {r.agreement}
                    </Link>
                  </td>
                  <td className="p-3">
                    <p>{r.customer}</p>
                    <p className="text-xs text-[var(--muted)]">{r.customerMobile}</p>
                  </td>
                  <td className="p-3">
                    <p>{r.vehicle}</p>
                    <p className="font-mono text-xs text-[var(--muted)]">{r.registration}</p>
                  </td>
                  <td className="p-3 text-xs">{r.branchName}</td>
                  <td className="p-3 text-xs text-[var(--muted)]">
                    {r.startsAt.toLocaleString("en-GB", { timeZone: "Asia/Muscat" })} –{" "}
                    {r.expectedReturnAt.toLocaleString("en-GB", { timeZone: "Asia/Muscat" })}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${
                        r.status === "ACTIVE"
                          ? "bg-red-500/20 text-red-100"
                          : r.status === "RESERVED"
                            ? "bg-amber-400/20 text-amber-100"
                            : r.status === "RETURNED"
                              ? "bg-emerald-400/15 text-emerald-200"
                              : "bg-white/10 text-[var(--muted)]"
                      }`}
                    >
                      {translateStatus(tStatus, r.status)}
                    </span>
                  </td>
                  <td className="p-3 text-end font-mono">{formatOMR(r.total)}</td>
                  <td className="p-3 text-center">
                    <BookingRowActions
                      locale={locale}
                      booking={{
                        id: r.id,
                        agreement: r.agreement,
                        status: r.status,
                        startsAtIso: r.startsAt.toISOString(),
                        pricingPeriod: r.pricingPeriod,
                        rentDuration: r.rentDuration,
                        pickupBranchId: r.pickupBranchId,
                        returnBranchId: r.returnBranchId,
                        pickupOdometerKm: r.pickupOdometerKm ?? r.vehicleOdometerKm,
                        freeKm: r.freeKm,
                        openKm: r.openKm,
                        notes: r.notes ?? "",
                        vehicleLabel: `${r.vehicle} (${r.registration})`,
                        customerName: r.customer,
                      }}
                      branches={branchRows}
                      canUpdate={can(identity, "rentals", "update", r.branchId)}
                      canDelete={can(identity, "rentals", "delete", r.branchId)}
                      canPrint={can(identity, "rentals", "print", r.branchId)}
                    />
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--muted)]">
                    {tRentals("noBookings")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <nav
            aria-label={tRentals("bookingsHeading")}
            className="flex items-center justify-end gap-3 border-t border-[var(--edge)] p-4 text-sm"
          >
            {page > 1 && (
              <Link
                href={pageHref(page - 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                {tCommon("previous")}
              </Link>
            )}
            <span className="text-[var(--muted)]">
              {tCommon("pageOf", { page, total: totalPages })}
            </span>
            {page < totalPages && (
              <Link
                href={pageHref(page + 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                {tCommon("next")}
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
