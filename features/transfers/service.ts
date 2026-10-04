import "server-only";
import { and, asc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  customerLedger,
  customers,
  invoices,
  payments,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  vehicleBrands,
  vehicleOdometerHistory,
  vehiclePricing,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { MAX_BAISA, parseOMR } from "@/features/finance/calculations";
import { totals } from "@/features/finance/service";
import { operationalBlocking } from "@/features/rentals/availability";
import { parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, type Identity } from "@/lib/auth";
import { transferBalance, transferMileage } from "./calculations";

const amount = z.string().transform(parseOMR);
const km = z.coerce.number().int().min(0).max(MAX_BAISA);
const schema = z.object({
  rentalId: z.uuid(),
  newVehicleId: z.uuid(),
  requestId: z.uuid(),
  transferredAt: z.string().transform(parseOmanDateTime),
  endingKm: km,
  newStartingKm: km,
  damage: amount,
  washing: amount,
  petrol: amount,
  received: amount,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  remarks: z.string().trim().min(1).max(1000),
});
export async function transferCandidates(rental: typeof rentals.$inferSelect, actor: Identity) {
  return db
    .select({
      vehicle: vehicles,
      brand: vehicleBrands.name,
      service: vehicleServiceSettings,
      pricing: vehiclePricing,
    })
    .from(vehicles)
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .leftJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
    .innerJoin(
      vehiclePricing,
      and(
        eq(vehiclePricing.vehicleId, vehicles.id),
        eq(vehiclePricing.period, rental.pricingPeriod),
      ),
    )
    .where(
      and(
        ne(vehicles.id, rental.vehicleId),
        eq(vehicles.isActive, true),
        eq(vehicles.status, "AVAILABLE"),
        actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
        sql`not ${operationalBlocking}`,
        sql`not exists (select 1 from ${rentals} where ${rentals.vehicleId} = ${vehicles.id} and (${rentals.status} = 'ACTIVE' or (${rentals.status} = 'RESERVED' and ${rentals.startsAt} < ${rental.expectedReturnAt.toISOString()}::timestamptz and ${rentals.expectedReturnAt} > CURRENT_TIMESTAMP)))`,
      ),
    );
}
export async function swapVehicle(raw: unknown, actor: Identity) {
  const input = schema.parse(raw);
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(rentals).where(eq(rentals.id, input.rentalId));
    if (!candidate || !can(actor, "rentals", "update", candidate.branchId))
      throw new Error("Booking not found or access denied.");
    // Every fleet mutation locks vehicle rows first. Deterministic ordering prevents opposite swaps deadlocking.
    const locked = await tx
      .select()
      .from(vehicles)
      .where(inArray(vehicles.id, [candidate.vehicleId, input.newVehicleId]))
      .orderBy(asc(vehicles.id))
      .for("update");
    const [r] = await tx.select().from(rentals).where(eq(rentals.id, candidate.id)).for("update");
    const [existing] = await tx
      .select()
      .from(rentalVehicleSwaps)
      .where(eq(rentalVehicleSwaps.requestId, input.requestId));
    if (existing) {
      if (existing.rentalId !== r.id) throw new Error("Request already used.");
      return existing;
    }
    if (r.vehicleId !== candidate.vehicleId)
      throw new Error("Vehicle changed. Reload the booking before transferring.");
    const previous = locked.find((v) => v.id === r.vehicleId);
    const next = locked.find((v) => v.id === input.newVehicleId);
    if (r.status !== "ACTIVE" || !previous || !next || next.id === previous.id)
      throw new Error("An active rental and a different replacement vehicle are required.");
    if (!can(actor, "rentals", "update", next.branchId))
      throw new Error("Replacement branch access denied.");
    if (
      input.transferredAt < (r.segmentStartedAt ?? r.startsAt) ||
      input.transferredAt > new Date() ||
      input.transferredAt >= r.expectedReturnAt
    )
      throw new Error(
        "Transfer must fall within the remaining rental period and cannot be in the future.",
      );
    const [eligible] = await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, next.id),
          eq(vehicles.isActive, true),
          eq(vehicles.status, "AVAILABLE"),
          sql`not ${operationalBlocking}`,
        ),
      );
    if (!eligible) throw new Error("Replacement vehicle is blocked or unavailable.");
    const [conflict] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, next.id),
          ne(rentals.id, r.id),
          or(
            eq(rentals.status, "ACTIVE"),
            and(
              eq(rentals.status, "RESERVED"),
              lt(rentals.startsAt, r.expectedReturnAt),
              gt(rentals.expectedReturnAt, input.transferredAt),
            ),
          ),
        ),
      );
    if (conflict) throw new Error("Replacement conflicts with a rental or reservation.");
    const [final] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.rentalId, r.id), eq(invoices.status, "FINALIZED")));
    if (final) throw new Error("A finalized invoice must be reversed before transfer.");
    if (input.endingKm < previous.currentOdometerKm || input.newStartingKm < next.currentOdometerKm)
      throw new Error("Odometer readings cannot move backwards.");
    const mileage = transferMileage({
      startingKm: r.pickupOdometerKm ?? previous.currentOdometerKm,
      endingKm: input.endingKm,
      maximumKm: r.includedKm,
      freeKm: r.freeKm,
      excessRateBaisa: r.excessKmChargeBaisa,
      openKm: r.openKm,
    });
    const added = mileage.extraBaisa + input.damage + input.washing + input.petrol;
    if (r.totalBaisa + added > MAX_BAISA) throw new Error("Rental total is too large.");
    const financial = await totals(tx, r.id);
    const balance = transferBalance(financial.balance, added, input.received);
    for (const [component, charge] of [
      ["EXCESS_KM", mileage.extraBaisa],
      ["DAMAGE", input.damage],
      ["WASHING", input.washing],
      ["PETROL", input.petrol],
    ] as const) {
      if (!charge) continue;
      await tx.insert(rentalCharges).values({
        rentalId: r.id,
        type: component === "DAMAGE" ? "DAMAGE" : "RENT_CHARGE",
        component,
        amountBaisa: charge,
        description: `Vehicle transfer ${component}`,
        createdBy: actor.id,
      });
      await tx.insert(customerLedger).values({
        rentalId: r.id,
        customerId: r.customerId,
        type: component === "DAMAGE" ? "DAMAGE" : "RENT_CHARGE",
        debitBaisa: charge,
        description: `Vehicle transfer ${component}`,
      });
    }
    if (input.received) {
      const [p] = await tx
        .insert(payments)
        .values({
          rentalId: r.id,
          customerId: r.customerId,
          branchId: r.branchId,
          receiptNumber: `RCT-${crypto.randomUUID().toUpperCase()}`,
          requestId: input.requestId,
          kind: "RECEIPT",
          direction: "RECEIPT",
          method: input.method,
          amountBaisa: input.received,
          recordedBy: actor.id,
          note: "Payment at vehicle transfer",
        })
        .returning();
      await tx.insert(customerLedger).values({
        rentalId: r.id,
        customerId: r.customerId,
        paymentId: p.id,
        type: "PAYMENT",
        creditBaisa: input.received,
        description: p.receiptNumber,
      });
    }
    const [c] = await tx.select().from(customers).where(eq(customers.id, r.customerId));
    const [history] = await tx
      .insert(rentalVehicleSwaps)
      .values({
        requestId: input.requestId,
        rentalId: r.id,
        previousVehicleId: previous.id,
        newVehicleId: next.id,
        segmentStartedAt: r.segmentStartedAt ?? r.startsAt,
        transferredAt: input.transferredAt,
        expectedReturnAt: r.expectedReturnAt,
        startingKm: r.pickupOdometerKm ?? previous.currentOdometerKm,
        endingKm: input.endingKm,
        newStartingKm: input.newStartingKm,
        remainingMaximumKm: mileage.remainingMaximumKm,
        remainingFreeKm: mileage.remainingFreeKm,
        chargesBaisa: added,
        balanceBaisa: balance.newBalance,
        receivedBaisa: input.received,
        snapshot: {
          booking: r,
          customer: c,
          previousVehicle: previous,
          newVehicle: next,
          mileage,
          charges: { damage: input.damage, washing: input.washing, petrol: input.petrol },
          balanceBefore: financial.balance,
          balanceToTransfer: balance.balanceToTransfer,
          pricePolicy: "PRESERVE_CONTRACT",
          user: actor.displayName,
        },
        remarks: input.remarks,
        createdBy: actor.id,
      })
      .returning();
    await tx
      .update(vehicles)
      .set({ status: "AVAILABLE", currentOdometerKm: input.endingKm, updatedAt: new Date() })
      .where(eq(vehicles.id, previous.id));
    await tx
      .update(vehicles)
      .set({ status: "INACTIVE", currentOdometerKm: input.newStartingKm, updatedAt: new Date() })
      .where(eq(vehicles.id, next.id));
    await tx.insert(vehicleOdometerHistory).values([
      {
        vehicleId: previous.id,
        odometerKm: input.endingKm,
        recordedBy: actor.id,
        note: `Transfer out ${r.agreementNumber}`,
      },
      {
        vehicleId: next.id,
        odometerKm: input.newStartingKm,
        recordedBy: actor.id,
        note: `Transfer in ${r.agreementNumber}`,
      },
    ]);
    await tx
      .update(rentals)
      .set({
        vehicleId: next.id,
        pickupOdometerKm: input.newStartingKm,
        segmentStartedAt: input.transferredAt,
        includedKm: mileage.remainingMaximumKm,
        freeKm: mileage.remainingFreeKm,
        subtotalBaisa: r.subtotalBaisa + added,
        totalBaisa: r.totalBaisa + added,
        updatedAt: new Date(),
      })
      .where(eq(rentals.id, r.id));
    return history;
  });
}
