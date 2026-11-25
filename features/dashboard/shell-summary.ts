import "server-only";
import { and, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  customerLedger,
  customers,
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
import type { Identity } from "@/lib/auth";

type ConciergeShellSummary = {
  monthlyRevenueBaisa: number;
  outstandingBaisa: number;
  totalVehicles: number;
  availableVehicles: number;
  openRentals: number;
  activeCustomers: number;
  lateVehicles: number;
  nearService: number;
  expiringDocs: number;
};

export async function getConciergeShellSummary(actor: Identity): Promise<ConciergeShellSummary> {
  const now = new Date();
  const day = formatOmanDateTime(now).slice(0, 10);
  const policy = await fleetAlertSettings();
  const expiryLimitDate = new Date(now.getTime() + policy.expirySoonDays * 86_400_000);
  const expiryLimit = formatOmanDateTime(expiryLimitDate).slice(0, 10);
  const monthStart = parseOmanDateTime(`${day.slice(0, 7)}-01T00:00`);

  const hasBranches = actor.role === "SUPER_ADMIN" || actor.branchIds.length > 0;
  if (!hasBranches) {
    return {
      monthlyRevenueBaisa: 0,
      outstandingBaisa: 0,
      totalVehicles: 0,
      availableVehicles: 0,
      openRentals: 0,
      activeCustomers: 0,
      lateVehicles: 0,
      nearService: 0,
      expiringDocs: 0,
    };
  }

  const vehicleScope =
    actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds);
  const rentalScope =
    actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds);

  const [
    totalVehicles,
    availableVehicles,
    openRentals,
    activeCustomers,
    lateVehicles,
    nearService,
    mulkiyaExpiring,
    insuranceExpiring,
    outstanding,
    revenue,
  ] = await Promise.all([
    db.select({ value: count() }).from(vehicles).where(vehicleScope),
    db.select({ value: count() }).from(vehicles).where(and(vehicleScope, availableFleet)),
    db
      .select({ value: count() })
      .from(rentals)
      .where(and(rentalScope, inArray(rentals.status, ["ACTIVE", "RESERVED"]))),
    db.select({ value: count() }).from(customers).where(eq(customers.isActive, true)),
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
    db
      .select({
        value: sql<number>`coalesce(sum(${customerLedger.debitBaisa}) - sum(${customerLedger.creditBaisa}), 0)::int`,
      })
      .from(customerLedger)
      .leftJoin(rentals, eq(customerLedger.rentalId, rentals.id))
      .where(rentalScope),
    db
      .select({ value: sql<number>`coalesce(sum(${rentalCharges.amountBaisa}), 0)::int` })
      .from(rentalCharges)
      .innerJoin(rentals, eq(rentalCharges.rentalId, rentals.id))
      .where(
        and(
          rentalScope,
          eq(rentalCharges.type, "RENT_CHARGE"),
          gte(rentalCharges.createdAt, monthStart),
        ),
      ),
  ]);

  return {
    monthlyRevenueBaisa: revenue[0]?.value ?? 0,
    outstandingBaisa: outstanding[0]?.value ?? 0,
    totalVehicles: totalVehicles[0]?.value ?? 0,
    availableVehicles: availableVehicles[0]?.value ?? 0,
    openRentals: openRentals[0]?.value ?? 0,
    activeCustomers: activeCustomers[0]?.value ?? 0,
    lateVehicles: lateVehicles[0]?.value ?? 0,
    nearService: nearService[0]?.value ?? 0,
    expiringDocs: (mulkiyaExpiring[0]?.value ?? 0) + (insuranceExpiring[0]?.value ?? 0),
  };
}
