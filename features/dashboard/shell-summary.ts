import "server-only";
import { and, count, eq, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
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
import { can, type Identity } from "@/lib/auth";

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
  canViewFinance: boolean;
  canViewFleet: boolean;
  canViewRentals: boolean;
};

export async function getConciergeShellSummary(actor: Identity): Promise<ConciergeShellSummary> {
  const canViewFinance = can(actor, "finance", "read");
  const canViewFleet = can(actor, "fleet", "read");
  const canViewRentals = can(actor, "rentals", "read");
  const canViewCustomers = can(actor, "customers", "read");

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
      canViewFinance,
      canViewFleet,
      canViewRentals,
    };
  }

  const now = new Date();
  const day = formatOmanDateTime(now).slice(0, 10);
  const policy = canViewFleet
    ? await fleetAlertSettings()
    : { nearServiceKm: 500, expirySoonDays: 30 };
  const expiryLimitDate = new Date(now.getTime() + policy.expirySoonDays * 86_400_000);
  const expiryLimit = formatOmanDateTime(expiryLimitDate).slice(0, 10);
  const monthStart = parseOmanDateTime(`${day.slice(0, 7)}-01T00:00`);

  const vehicleScope =
    actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds);
  const rentalScope =
    actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds);

  const zero = Promise.resolve([{ value: 0 }]);

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
    canViewFleet ? db.select({ value: count() }).from(vehicles).where(vehicleScope) : zero,
    canViewFleet
      ? db.select({ value: count() }).from(vehicles).where(and(vehicleScope, availableFleet))
      : zero,
    canViewRentals
      ? db
          .select({ value: count() })
          .from(rentals)
          .where(and(rentalScope, inArray(rentals.status, ["ACTIVE", "RESERVED"])))
      : zero,
    canViewCustomers
      ? db.select({ value: count() }).from(customers).where(eq(customers.isActive, true))
      : zero,
    canViewRentals
      ? db
          .select({ value: count() })
          .from(rentals)
          .where(and(rentalScope, eq(rentals.status, "ACTIVE"), lt(rentals.expectedReturnAt, now)))
      : zero,
    canViewFleet
      ? db
          .select({ value: count() })
          .from(vehicles)
          .innerJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
          .where(
            and(
              vehicleScope,
              eq(vehicles.isActive, true),
              or(
                sql`${vehicles.currentOdometerKm} + ${policy.nearServiceKm} >= ${vehicleServiceSettings.lastEngineServiceKm} + ${vehicleServiceSettings.engineServiceIntervalKm}`,
                sql`${vehicles.currentOdometerKm} + ${policy.nearServiceKm} >= ${vehicleServiceSettings.lastGearOilChangeKm} + ${vehicleServiceSettings.gearOilIntervalKm}`,
              ),
            ),
          )
      : zero,
    canViewFleet
      ? db
          .select({ value: count() })
          .from(vehicles)
          .innerJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
          .where(
            and(
              vehicleScope,
              eq(vehicles.isActive, true),
              lte(vehicleRegistrations.mulkiyaExpiryDate, expiryLimit),
            ),
          )
      : zero,
    canViewFleet
      ? db
          .select({ value: count() })
          .from(vehicles)
          .innerJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
          .where(
            and(
              vehicleScope,
              eq(vehicles.isActive, true),
              lte(vehicleInsurance.validUntil, expiryLimit),
            ),
          )
      : zero,
    canViewFinance
      ? db
          .select({
            value: sql<string>`coalesce(sum(${customerLedger.debitBaisa}) - sum(${customerLedger.creditBaisa}), 0)::bigint`,
          })
          .from(customerLedger)
          .leftJoin(rentals, eq(customerLedger.rentalId, rentals.id))
          .where(rentalScope)
      : zero,
    canViewFinance
      ? db
          .select({ value: sql<string>`coalesce(sum(${rentalCharges.amountBaisa}), 0)::bigint` })
          .from(rentalCharges)
          .innerJoin(rentals, eq(rentalCharges.rentalId, rentals.id))
          .where(
            and(
              rentalScope,
              ne(rentals.status, "CANCELLED"),
              eq(rentalCharges.type, "RENT_CHARGE"),
              gte(rentalCharges.createdAt, monthStart),
            ),
          )
      : zero,
  ]);

  return {
    monthlyRevenueBaisa: Number(revenue[0]?.value ?? 0),
    outstandingBaisa: Number(outstanding[0]?.value ?? 0),
    totalVehicles: Number(totalVehicles[0]?.value ?? 0),
    availableVehicles: Number(availableVehicles[0]?.value ?? 0),
    openRentals: Number(openRentals[0]?.value ?? 0),
    activeCustomers: Number(activeCustomers[0]?.value ?? 0),
    lateVehicles: Number(lateVehicles[0]?.value ?? 0),
    nearService: Number(nearService[0]?.value ?? 0),
    expiringDocs: Number(mulkiyaExpiring[0]?.value ?? 0) + Number(insuranceExpiring[0]?.value ?? 0),
    canViewFinance,
    canViewFleet,
    canViewRentals,
  };
}
