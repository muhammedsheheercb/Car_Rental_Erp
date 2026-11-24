import "server-only";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditLogs,
  customerLedger,
  financeFines,
  invoices,
  payments,
  rentalCancellations,
  rentalCharges,
  rentalExtensions,
  rentals,
  rentalVehicleSwaps,
  vehicleDamageEvidence,
  vehiclePricing,
  vehicleServices,
  vehicles,
} from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { validateEvidencePhoto } from "@/lib/image-file";
import { putPrivateCustomerDocument } from "@/lib/r2";
import {
  bookingUpdateSchema,
  cancellationSchema,
  damageSchema,
  extensionSchema,
} from "@/lib/validation";
import {
  calculateExcessKm,
  calculateExpectedReturn,
  parseOmanDateTime,
} from "./booking-calculations";
import { calculateRentalCharge } from "./calculations";
import { calculateLateCharges, cancellationPolicy } from "./late-charges";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockRental(tx: Tx, id: string, actor: Identity) {
  const [candidate] = await tx.select().from(rentals).where(eq(rentals.id, id)).limit(1);
  if (!candidate || !can(actor, "rentals", "update", candidate.branchId))
    throw new Error("Rental not found or access denied.");
  const [vehicle] = await tx
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, candidate.vehicleId))
    .for("update");
  const [rental] = await tx.select().from(rentals).where(eq(rentals.id, id)).for("update");
  if (!rental || !vehicle || rental.vehicleId !== vehicle.id)
    throw new Error("Vehicle changed. Reload the booking and try again.");
  return { rental, vehicle };
}
const boundedMoney = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)
    throw new Error("Financial amount is too large or invalid.");
  return value;
};
async function addCharge(
  tx: Tx,
  rental: typeof rentals.$inferSelect,
  actor: Identity,
  amount: number,
  component: string,
  description: string,
) {
  if (!amount) return;
  await tx.insert(rentalCharges).values({
    rentalId: rental.id,
    type: ["RENTAL", "EXCESS_KM"].includes(component) ? "RENT_CHARGE" : "FINE",
    component,
    description,
    amountBaisa: boundedMoney(amount),
    createdBy: actor.id,
  });
  await tx.insert(customerLedger).values({
    rentalId: rental.id,
    customerId: rental.customerId,
    type: ["RENTAL", "EXCESS_KM"].includes(component) ? "RENT_CHARGE" : "FINE",
    debitBaisa: amount,
    description,
  });
}
export async function extendContract(raw: unknown, actor: Identity) {
  const input = extensionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { rental } = await lockRental(tx, input.rentalId, actor);
    if (rental.status !== "ACTIVE") throw new Error("Only active contracts can be extended.");
    if (!can(actor, "rentals", "approve", rental.branchId))
      throw new Error("Extension approval permission is required.");
    const deadline = calculateExpectedReturn(
      rental.expectedReturnAt,
      rental.pricingPeriod,
      input.duration,
    );
    if (deadline <= new Date()) throw new Error("The new return deadline must be in the future.");
    const [conflict] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, rental.vehicleId),
          ne(rentals.id, rental.id),
          inArray(rentals.status, ["ACTIVE", "RESERVED"]),
          lt(rentals.startsAt, deadline),
          gt(rentals.expectedReturnAt, rental.startsAt),
        ),
      )
      .limit(1);
    if (conflict) throw new Error("Extension conflicts with another vehicle reservation.");
    const additionalRent = boundedMoney(input.duration * rental.dailyRateBaisa);
    await tx.insert(rentalExtensions).values({
      rentalId: rental.id,
      previousExpectedReturnAt: rental.expectedReturnAt,
      newExpectedReturnAt: deadline,
      duration: input.duration,
      period: rental.pricingPeriod,
      additionalRentBaisa: additionalRent,
      approvedBy: actor.id,
      remarks: input.remarks,
    });
    await addCharge(
      tx,
      rental,
      actor,
      additionalRent,
      "RENTAL",
      `Approved extension: ${input.duration} ${rental.pricingPeriod.toLowerCase()} periods`,
    );
    await tx
      .update(rentals)
      .set({
        expectedReturnAt: deadline,
        rentDuration: rental.rentDuration + input.duration,
        subtotalBaisa: boundedMoney(rental.subtotalBaisa + additionalRent),
        totalBaisa: boundedMoney(rental.totalBaisa + additionalRent),
        updatedAt: new Date(),
      })
      .where(eq(rentals.id, rental.id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "RENTAL_EXTENDED",
      entityType: "rental",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        duration: input.duration,
        period: rental.pricingPeriod,
        additionalRentBaisa: additionalRent,
        remarks: input.remarks,
      },
    });
  });
}
export async function cancelAgreement(raw: unknown, actor: Identity) {
  const input = cancellationSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { rental, vehicle } = await lockRental(tx, input.rentalId, actor);
    if (!["RESERVED", "ACTIVE"].includes(rental.status))
      throw new Error("Only reservations or active agreements can be cancelled.");
    const policy = cancellationPolicy({
      createdAt: rental.createdAt,
      now: new Date(),
      windowMinutes: rental.cancellationWindowMinutes,
      authorizedAdmin:
        (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") &&
        can(actor, "rentals", "approve", rental.branchId),
    });
    if (!policy.allowed)
      throw new Error(
        "The 15-minute cancellation window has expired. An authorized admin must cancel this agreement.",
      );
    if (input.startingKm !== (rental.pickupOdometerKm ?? vehicle.currentOdometerKm))
      throw new Error("Starting KM must match the agreement.");
    if (rental.status === "ACTIVE" && input.endingKm < vehicle.currentOdometerKm)
      throw new Error("Ending KM cannot be below the latest recorded vehicle KM.");
    await tx.insert(rentalCancellations).values({
      rentalId: rental.id,
      previousStatus: rental.status,
      startingKm: input.startingKm,
      endingKm: input.endingKm,
      remarks: input.remarks,
      overridden: policy.overridden,
      cancelledBy: actor.id,
    });
    await tx
      .update(rentals)
      .set({ status: "CANCELLED", returnOdometerKm: input.endingKm, updatedAt: new Date() })
      .where(eq(rentals.id, rental.id));
    if (rental.status === "ACTIVE")
      await tx
        .update(vehicles)
        .set({
          status: "AVAILABLE",
          currentOdometerKm: Math.max(vehicle.currentOdometerKm, input.endingKm),
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, vehicle.id));
    // Charges, receipts and ledger history are retained. Refunds/adjustments require their own transactions.
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "RENTAL_CANCELLED",
      entityType: "rental",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        previousStatus: rental.status,
        overridden: policy.overridden,
        remarks: input.remarks,
      },
    });
  });
}
export async function recordDamage(raw: unknown, file: File, actor: Identity) {
  const input = damageSchema.parse(raw);
  await validateEvidencePhoto(file);
  return db.transaction(async (tx) => {
    const { rental } = await lockRental(tx, input.rentalId, actor);
    if (input.phase === "BEFORE_RENTAL" && rental.status !== "RESERVED")
      throw new Error("Before-rental evidence must be recorded before checkout.");
    if (input.phase === "AFTER_RETURN" && rental.status !== "RETURNED")
      throw new Error("After-return evidence requires a returned rental.");
    const key = `damage/${rental.vehicleId}/${rental.id}/${input.phase.toLowerCase()}/${crypto.randomUUID()}`;
    await putPrivateCustomerDocument(key, file);
    await tx.insert(vehicleDamageEvidence).values({
      rentalId: rental.id,
      vehicleId: rental.vehicleId,
      customerId: rental.customerId,
      phase: input.phase,
      location: input.location,
      description: input.description,
      remarks: input.remarks,
      objectKey: key,
      contentType: file.type,
      recordedBy: actor.id,
    });
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "DAMAGE_RECORDED",
      entityType: "damage",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        phase: input.phase,
        location: input.location,
        description: input.description,
      },
    });
  });
}
export async function returnContract(
  raw: { rentalId: string; returnedAt: string; endingKm: string },
  actor: Identity,
) {
  const returnedAt = parseOmanDateTime(raw.returnedAt);
  const endingKm = Number(raw.endingKm);
  if (!Number.isInteger(endingKm) || endingKm < 0 || endingKm > 2_147_483_647)
    throw new Error("Ending KM is invalid.");
  return db.transaction(async (tx) => {
    const { rental, vehicle } = await lockRental(tx, raw.rentalId, actor);
    if (rental.status !== "ACTIVE") throw new Error("Only active rentals can be returned.");
    if (returnedAt < (rental.segmentStartedAt ?? rental.startsAt) || returnedAt > new Date())
      throw new Error("Return time must be between pickup and now in Oman time.");
    if (endingKm < vehicle.currentOdometerKm)
      throw new Error("Ending KM cannot be below the latest recorded vehicle KM.");
    const late = calculateLateCharges({
      expectedReturnAt: rental.expectedReturnAt,
      assessedAt: returnedAt,
      policy: {
        hourlyRateBaisa: rental.lateFeeBaisa,
        additionalDayRentBaisa: rental.additionalDayRentBaisa,
        graceMinutes: rental.lateGraceMinutes,
        hourlyWindowHours: rental.lateWindowHours,
        overdueFinePerDayBaisa: rental.overdueFineBaisa,
      },
    });
    const excess =
      calculateExcessKm({
        maximumKm: rental.includedKm,
        freeKm: rental.freeKm,
        openKm: rental.openKm,
        startingKm: rental.pickupOdometerKm ?? 0,
        returnKm: endingKm,
      }) * rental.excessKmChargeBaisa;
    await addCharge(
      tx,
      rental,
      actor,
      late.additionalRentalBaisa,
      "RENTAL",
      "Additional overdue daily rent",
    );
    await addCharge(
      tx,
      rental,
      actor,
      late.lateFeeBaisa,
      "LATE_FEE",
      "Hourly late fee after free grace",
    );
    await addCharge(
      tx,
      rental,
      actor,
      late.overdueFineBaisa,
      "OVERDUE_FINE",
      "Fine for completed overdue days",
    );
    await addCharge(tx, rental, actor, excess, "EXCESS_KM", "Excess kilometre charge");
    const added = late.totalBaisa + excess;
    await tx
      .update(rentals)
      .set({
        status: "RETURNED",
        actualReturnAt: returnedAt,
        returnedBy: actor.id,
        returnOdometerKm: endingKm,
        subtotalBaisa: boundedMoney(rental.subtotalBaisa + added),
        totalBaisa: boundedMoney(rental.totalBaisa + added),
        updatedAt: new Date(),
      })
      .where(eq(rentals.id, rental.id));
    await tx
      .update(vehicles)
      .set({
        status: "AVAILABLE",
        currentOdometerKm: Math.max(vehicle.currentOdometerKm, endingKm),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehicle.id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "RENTAL_RETURNED",
      entityType: "rental",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        endingKm,
        addedChargesBaisa: added,
        totalBaisa: boundedMoney(rental.totalBaisa + added),
      },
    });
  });
}

export async function updateBooking(raw: unknown, actor: Identity) {
  const input = bookingUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { rental, vehicle } = await lockRental(tx, input.rentalId, actor);
    if (!["RESERVED", "ACTIVE"].includes(rental.status))
      throw new Error("Only reserved or active bookings can be edited.");
    for (const branchId of [input.pickupBranchId, input.returnBranchId])
      if (!can(actor, "rentals", "update", branchId))
        throw new Error("You do not have permission for the selected branch.");

    if (rental.status === "ACTIVE") {
      await tx
        .update(rentals)
        .set({
          returnBranchId: input.returnBranchId,
          freeKm: input.freeKm,
          openKm: input.openKm,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(rentals.id, rental.id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        event: "BOOKING_UPDATED",
        entityType: "rental",
        entityId: rental.id,
        branchId: rental.branchId,
        metadata: {
          action: "BOOKING_UPDATED",
          agreementNumber: rental.agreementNumber,
          status: "ACTIVE",
          returnBranchId: input.returnBranchId,
          freeKm: input.freeKm,
          openKm: input.openKm,
        },
      });
      return;
    }

    const startsAt = input.startsAt ?? rental.startsAt;
    const pricingPeriod = input.pricingPeriod ?? rental.pricingPeriod;
    const rentDuration = input.rentDuration ?? rental.rentDuration;
    const pickupOdometerKm =
      input.pickupOdometerKm ?? rental.pickupOdometerKm ?? vehicle.currentOdometerKm;
    if (pickupOdometerKm < vehicle.currentOdometerKm)
      throw new Error("Starting KM cannot be below the current vehicle odometer.");

    const expectedReturnAt = calculateExpectedReturn(startsAt, pricingPeriod, rentDuration);
    const [conflict] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, rental.vehicleId),
          ne(rentals.id, rental.id),
          inArray(rentals.status, ["RESERVED", "ACTIVE"]),
          lt(rentals.startsAt, expectedReturnAt),
          gt(rentals.expectedReturnAt, startsAt),
        ),
      )
      .limit(1);
    if (conflict) throw new Error("Updated dates conflict with another booking for this vehicle.");

    let dailyRateBaisa = rental.dailyRateBaisa;
    let includedKm = rental.includedKm;
    let excessKmChargeBaisa = rental.excessKmChargeBaisa;
    let lateFeeBaisa = rental.lateFeeBaisa;
    let additionalDayRentBaisa = rental.additionalDayRentBaisa;

    if (pricingPeriod !== rental.pricingPeriod) {
      const [configuredPricing] = await tx
        .select()
        .from(vehiclePricing)
        .where(
          and(
            eq(vehiclePricing.vehicleId, rental.vehicleId),
            eq(vehiclePricing.period, pricingPeriod),
          ),
        )
        .limit(1);
      if (!configuredPricing)
        throw new Error("Selected vehicle has no rental configuration for this period.");
      const [dailyPricing] = await tx
        .select()
        .from(vehiclePricing)
        .where(
          and(eq(vehiclePricing.vehicleId, rental.vehicleId), eq(vehiclePricing.period, "DAILY")),
        )
        .limit(1);
      dailyRateBaisa = configuredPricing.listRentBaisa;
      includedKm = configuredPricing.includedKm;
      excessKmChargeBaisa = configuredPricing.excessKmChargeBaisa;
      lateFeeBaisa = configuredPricing.lateFeeBaisa;
      additionalDayRentBaisa =
        pricingPeriod === "DAILY"
          ? configuredPricing.listRentBaisa
          : (dailyPricing?.listRentBaisa ?? rental.additionalDayRentBaisa);
    }

    const calculation = calculateRentalCharge({
      startsAt,
      expectedReturnAt,
      pricingPeriod,
      rentDuration,
      dailyRateBaisa,
      includedKm,
      freeKm: input.freeKm,
      openKm: input.openKm,
      excessKmChargeBaisa,
      lateFeeBaisa,
    });
    const delta = calculation.totalBaisa - rental.totalBaisa;
    if (delta !== 0) {
      await tx.insert(rentalCharges).values({
        rentalId: rental.id,
        type: "ADJUSTMENT",
        component: "RENTAL",
        description: `Booking edit rent adjustment (${rentDuration} ${pricingPeriod.toLowerCase()} period(s))`,
        amountBaisa: delta,
        createdBy: actor.id,
      });
      await tx.insert(customerLedger).values({
        customerId: rental.customerId,
        rentalId: rental.id,
        type: "ADJUSTMENT",
        debitBaisa: delta > 0 ? delta : 0,
        creditBaisa: delta < 0 ? Math.abs(delta) : 0,
        description: `Booking edit adjustment ${rental.agreementNumber}`,
      });
    }

    await tx
      .update(rentals)
      .set({
        pickupBranchId: input.pickupBranchId,
        returnBranchId: input.returnBranchId,
        startsAt,
        expectedReturnAt,
        pricingPeriod,
        rentDuration,
        pickupOdometerKm,
        dailyRateBaisa,
        includedKm,
        excessKmChargeBaisa,
        lateFeeBaisa,
        additionalDayRentBaisa,
        freeKm: input.freeKm,
        openKm: input.openKm,
        subtotalBaisa: boundedMoney(calculation.subtotalBaisa),
        taxBaisa: boundedMoney(calculation.taxBaisa),
        totalBaisa: boundedMoney(calculation.totalBaisa),
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(rentals.id, rental.id));

    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BOOKING_UPDATED",
      entityType: "rental",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        action: "BOOKING_UPDATED",
        agreementNumber: rental.agreementNumber,
        status: "RESERVED",
        previousTotalBaisa: rental.totalBaisa,
        newTotalBaisa: calculation.totalBaisa,
      },
    });
  });
}

export async function deleteBooking(rentalId: string, actor: Identity) {
  if (!z.string().uuid().safeParse(rentalId).success) throw new Error("Invalid booking ID.");
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1);
    if (!candidate) throw new Error("Booking not found.");
    if (!can(actor, "rentals", "delete", candidate.branchId)) throw new Error("FORBIDDEN");
    await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(eq(vehicles.id, candidate.vehicleId))
      .for("update");
    const [rental] = await tx.select().from(rentals).where(eq(rentals.id, rentalId)).for("update");
    if (!rental) throw new Error("Booking not found.");
    if (rental.status !== "RESERVED")
      throw new Error(
        "Only pending reservations with no financial history can be deleted. Cancel active agreements instead.",
      );
    const [paymentRef, invoiceRef, fineRef, extRef, cancelRef, swapRef, damageRef, serviceRef] =
      await Promise.all([
        tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(eq(invoices.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: financeFines.id })
          .from(financeFines)
          .where(eq(financeFines.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: rentalExtensions.id })
          .from(rentalExtensions)
          .where(eq(rentalExtensions.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: rentalCancellations.id })
          .from(rentalCancellations)
          .where(eq(rentalCancellations.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: rentalVehicleSwaps.id })
          .from(rentalVehicleSwaps)
          .where(eq(rentalVehicleSwaps.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: vehicleDamageEvidence.id })
          .from(vehicleDamageEvidence)
          .where(eq(vehicleDamageEvidence.rentalId, rentalId))
          .limit(1),
        tx
          .select({ id: vehicleServices.id })
          .from(vehicleServices)
          .where(eq(vehicleServices.rentalId, rentalId))
          .limit(1),
      ]);
    if (
      paymentRef.length ||
      invoiceRef.length ||
      fineRef.length ||
      extRef.length ||
      cancelRef.length ||
      swapRef.length ||
      damageRef.length ||
      serviceRef.length
    ) {
      throw new Error(
        "This booking has payments, invoices, fines, or operational records and cannot be deleted. Cancel the agreement instead.",
      );
    }
    await tx.delete(customerLedger).where(eq(customerLedger.rentalId, rentalId));
    await tx.delete(rentalCharges).where(eq(rentalCharges.rentalId, rentalId));
    await tx.delete(rentals).where(eq(rentals.id, rentalId));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BOOKING_DELETED",
      entityType: "rental",
      entityId: rentalId,
      branchId: rental.branchId,
      metadata: { action: "BOOKING_DELETED", agreementNumber: rental.agreementNumber },
    });
  });
}
