import { and, asc, desc, eq, inArray, not } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OperationsLinks } from "@/components/operations-links";
import { RentalBookingForm } from "@/components/rental-booking-form";
import { db } from "@/db/client";
import {
  branches,
  customers,
  rentals,
  vehicleBrands,
  vehicleModels,
  vehiclePricing,
  vehicles,
} from "@/db/schema";
import { operationalBlocking } from "@/features/rentals/availability";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePermission } from "@/lib/auth";
export default async function RentalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [identity, t] = await Promise.all([
    requirePermission("rentals", "read"),
    getTranslations(),
  ]);
  const scoped =
    identity.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, identity.branchIds);
  const [vehicleRows, customerRows, pricingRows, branchRows, recent, reservedPeriods] =
    await Promise.all([
      db
        .select({
          id: vehicles.id,
          number: vehicles.vehicleNumber,
          brand: vehicleBrands.name,
          model: vehicleModels.name,
          branchId: vehicles.branchId,
          currentOdometerKm: vehicles.currentOdometerKm,
        })
        .from(vehicles)
        .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
        .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
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
          startsAt: rentals.startsAt,
          expectedReturnAt: rentals.expectedReturnAt,
          total: rentals.totalBaisa,
          customer: customers.name,
          vehicle: vehicles.vehicleNumber,
        })
        .from(rentals)
        .innerJoin(customers, eq(rentals.customerId, customers.id))
        .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
        .where(
          identity.role === "SUPER_ADMIN"
            ? undefined
            : inArray(rentals.branchId, identity.branchIds),
        )
        .orderBy(desc(rentals.createdAt))
        .limit(20),
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
  const canCreate = can(identity, "rentals", "create");
  const defaultBranch = branchRows[0]?.id ?? "";
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--accent)]">OPERATIONS / RENTALS</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("rentals")}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Reservations are checked against customer identity, blacklist status and vehicle conflicts
          on the server.
        </p>
      </div>
      <OperationsLinks locale={locale} />
      {canCreate && (
        <RentalBookingForm
          vehicles={vehicleRows}
          prices={pricingRows}
          customers={customerRows}
          branches={branchRows}
          defaultBranch={defaultBranch}
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
      <section className="overflow-hidden border border-[var(--edge)] bg-[var(--surface)]">
        <div className="border-b border-[var(--edge)] p-4">
          <h2 className="font-semibold">Recent agreements</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th className="p-3">Agreement</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-[var(--edge)]">
                  <td className="p-3 font-medium">
                    <Link
                      href={`/${locale}/rentals/${r.id}` as never}
                      className="text-[var(--accent)] underline"
                    >
                      {r.agreement}
                    </Link>
                  </td>
                  <td className="p-3">{r.customer}</td>
                  <td className="p-3">{r.vehicle}</td>
                  <td className="p-3 text-[var(--muted)]">
                    {r.startsAt.toLocaleString("en-GB", { timeZone: "Asia/Muscat" })} –{" "}
                    {r.expectedReturnAt.toLocaleString("en-GB", { timeZone: "Asia/Muscat" })}
                  </td>
                  <td className="p-3">
                    <span className="border border-[var(--edge)] px-2 py-1 text-xs">
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">{formatOMR(r.total)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--muted)]">
                    No agreements yet.
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
