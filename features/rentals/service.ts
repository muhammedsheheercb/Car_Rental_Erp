import "server-only";
import { and, eq, gt, inArray, lt, ne, not, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditLogs,
  customerLedger,
  payments,
  rentalCharges,
  rentals,
  vehiclePricing,
  vehicles,
} from "@/db/schema";
import { assertCustomerCanBeBooked } from "@/features/customers/eligibility";
import { can, type Identity } from "@/lib/auth";
import { reservationSchema } from "@/lib/validation";
import { operationalBlocking } from "./availability";
import {
  calculateExpectedReturn,
  formatOmanDateTime,
  validateDownPayment,
} from "./booking-calculations";
import { calculateRentalCharge } from "./calculations";

const agreementNumber = () =>
  `OMR-${formatOmanDateTime(new Date()).slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

export async function createReservation(rawInput: unknown, actor: Identity) {
  const input = reservationSchema.parse(rawInput);
  const actorId = actor.id;
  for (const branchId of [input.branchId, input.pickupBranchId, input.returnBranchId])
    if (!can(actor, "rentals", "create", branchId)) throw new Error("FORBIDDEN");
  const allowPriceOverride =
    (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") &&
    can(actor, "rentals", "override_price", input.branchId);
  const expectedReturnAt = calculateExpectedReturn(
    input.startsAt,
    input.pricingPeriod,
    input.rentDuration,
  );
  return db.transaction(async (tx) => {
    // Lock the fleet row first: concurrent checkouts for one vehicle serialize here.
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, input.vehicleId), not(operationalBlocking)))
      .for("update");
    if (!vehicle?.isActive || vehicle.status !== "AVAILABLE")
      throw new Error("Vehicle is unavailable for booking.");
    if (!can(actor, "rentals", "create", vehicle.branchId)) throw new Error("FORBIDDEN");
    if (input.pickupOdometerKm < vehicle.currentOdometerKm)
      throw new Error("Starting KM cannot be below the current vehicle odometer.");
    await assertCustomerCanBeBooked(input.customerId, tx);
    const [configuredPricing] = await tx
      .select()
      .from(vehiclePricing)
      .where(
        and(
          eq(vehiclePricing.vehicleId, input.vehicleId),
          eq(vehiclePricing.period, input.pricingPeriod),
        ),
      )
      .limit(1);
    if (!configuredPricing)
      throw new Error(
        "Booking blocked: this vehicle has no rental configuration for the selected period.",
      );
    if (!allowPriceOverride && input.dailyRateBaisa !== configuredPricing.listRentBaisa)
      throw new Error("Only an authorized admin can override configured rent.");
    if (input.dailyRateBaisa < configuredPricing.minimumRentBaisa)
      throw new Error("Rent rate cannot be below the vehicle's configured minimum rent.");
    if (
      input.includedKm !== configuredPricing.includedKm ||
      input.excessKmChargeBaisa !== configuredPricing.excessKmChargeBaisa ||
      input.lateFeeBaisa !== configuredPricing.lateFeeBaisa
    )
      throw new Error("Vehicle pricing has changed. Reload its rental configuration.");
    const conflicts = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, input.vehicleId),
          inArray(rentals.status, ["RESERVED", "ACTIVE"]),
          or(
            eq(rentals.status, "ACTIVE"),
            and(
              lt(rentals.startsAt, expectedReturnAt),
              gt(rentals.expectedReturnAt, input.startsAt),
            ),
          ),
        ),
      )
      .limit(1);
    if (conflicts.length) throw new Error("Vehicle is already reserved for part of this period.");
    const [dailyPrice] = await tx
      .select()
      .from(vehiclePricing)
      .where(and(eq(vehiclePricing.vehicleId, input.vehicleId), eq(vehiclePricing.period, "DAILY")))
      .limit(1);
    if (!dailyPrice)
      throw new Error("Daily rental configuration is required for additional overdue rent.");
    const latePolicy = {
      additionalDayRentBaisa:
        input.pricingPeriod === "DAILY" ? input.dailyRateBaisa : dailyPrice.listRentBaisa,
      lateGraceMinutes: configuredPricing.lateGraceMinutes ?? 60,
      lateWindowHours: configuredPricing.lateWindowHours ?? 4,
      overdueFineBaisa: configuredPricing.overdueFineBaisa ?? 5000,
    };
    const calculation = calculateRentalCharge({ ...input, ...latePolicy, expectedReturnAt });
    validateDownPayment(input.downPaymentBaisa, calculation.totalBaisa, input.depositBaisa);
    if (calculation.totalBaisa + input.depositBaisa > 2_147_483_647)
      throw new Error("Booking total is too large.");
    const { downPaymentBaisa, paymentMode, ...booking } = input;
    const [rental] = await tx
      .insert(rentals)
      .values({
        ...booking,
        ...latePolicy,
        expectedReturnAt,
        agreementNumber: agreementNumber(),
        status: "RESERVED",
        subtotalBaisa: calculation.subtotalBaisa,
        taxBaisa: calculation.taxBaisa,
        totalBaisa: calculation.totalBaisa,
        createdBy: actorId,
      })
      .returning();
    await tx.insert(rentalCharges).values({
      rentalId: rental.id,
      type: "RENT_CHARGE",
      description: `Rental charge (${input.rentDuration} ${input.pricingPeriod.toLowerCase()} period(s))`,
      amountBaisa: calculation.totalBaisa,
      createdBy: actorId,
    });
    if (calculation.totalBaisa > 0) {
      await tx.insert(customerLedger).values({
        customerId: input.customerId,
        rentalId: rental.id,
        type: "RENT_CHARGE",
        debitBaisa: calculation.totalBaisa,
        description: `Agreement ${rental.agreementNumber}`,
      });
    }
    if (input.depositBaisa > 0)
      await tx.insert(customerLedger).values({
        customerId: input.customerId,
        rentalId: rental.id,
        type: "DEPOSIT",
        debitBaisa: input.depositBaisa,
        description: `Security deposit ${rental.agreementNumber}`,
      });
    if (downPaymentBaisa > 0) {
      const [payment] = await tx
        .insert(payments)
        .values({
          rentalId: rental.id,
          customerId: input.customerId,
          branchId: input.branchId,
          direction: "RECEIPT",
          kind: "ADVANCE",
          method: paymentMode,
          amountBaisa: downPaymentBaisa,
          receiptNumber: `RCT-${crypto.randomUUID().toUpperCase()}`,
          recordedBy: actorId,
          note: "Booking down payment",
        })
        .returning();
      await tx.insert(customerLedger).values({
        customerId: input.customerId,
        rentalId: rental.id,
        paymentId: payment.id,
        type: "PAYMENT",
        creditBaisa: downPaymentBaisa,
        description: `Booking receipt ${payment.receiptNumber}`,
      });
      await tx.insert(auditLogs).values({
        actorId,
        event: "ADVANCE_RECORDED",
        entityType: "payment",
        entityId: payment.id,
        branchId: input.branchId,
        metadata: {
          receiptNumber: payment.receiptNumber,
          agreementNumber: rental.agreementNumber,
          amountBaisa: downPaymentBaisa,
          method: paymentMode,
        },
      });
    }
    await tx.insert(auditLogs).values({
      actorId,
      event: "BOOKING_CREATED",
      entityType: "rental",
      entityId: rental.id,
      branchId: input.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        period: input.pricingPeriod,
        duration: input.rentDuration,
        totalBaisa: calculation.totalBaisa,
      },
    });
    if (input.dailyRateBaisa !== configuredPricing.listRentBaisa)
      await tx.insert(auditLogs).values({
        actorId,
        event: "PRICE_OVERRIDDEN",
        entityType: "rental",
        entityId: rental.id,
        branchId: input.branchId,
        metadata: {
          agreementNumber: rental.agreementNumber,
          period: input.pricingPeriod,
          requestedRateBaisa: input.dailyRateBaisa,
          configuredRateBaisa: configuredPricing.listRentBaisa,
          lowestPermittedRateBaisa: configuredPricing.minimumRentBaisa,
        },
      });
    return rental;
  });
}

export async function activateRental(rentalId: string, pickupOdometerKm: number, actorId: string) {
  if (!z.string().uuid().safeParse(rentalId).success) throw new Error("Invalid booking ID.");
  if (
    !Number.isInteger(pickupOdometerKm) ||
    pickupOdometerKm < 0 ||
    pickupOdometerKm > 2_147_483_647
  )
    throw new Error("Pickup odometer is invalid.");
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(rentals).where(eq(rentals.id, rentalId));
    if (!candidate) throw new Error("Reservation not found.");
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, candidate.vehicleId), not(operationalBlocking)))
      .for("update");
    const [rental] = await tx.select().from(rentals).where(eq(rentals.id, rentalId)).for("update");
    if (rental?.status !== "RESERVED") throw new Error("Only a reservation can be checked out.");
    if (
      !vehicle ||
      rental.vehicleId !== vehicle.id ||
      !vehicle.isActive ||
      vehicle.status !== "AVAILABLE"
    )
      throw new Error("Vehicle is unavailable.");
    if (pickupOdometerKm < vehicle.currentOdometerKm)
      throw new Error("Pickup odometer is invalid.");
    await assertCustomerCanBeBooked(rental.customerId, tx);
    const now = new Date();
    const effectiveStart = now < rental.startsAt ? now : rental.startsAt;
    const [conflict] = await tx
      .select({ id: rentals.id, status: rentals.status })
      .from(rentals)
      .where(
        and(
          eq(rentals.vehicleId, rental.vehicleId),
          ne(rentals.id, rental.id),
          or(
            eq(rentals.status, "ACTIVE"),
            and(
              eq(rentals.status, "RESERVED"),
              lt(rentals.startsAt, rental.expectedReturnAt),
              gt(rentals.expectedReturnAt, effectiveStart),
            ),
          ),
        ),
      )
      .limit(1);
    if (conflict) {
      throw new Error(
        conflict.status === "ACTIVE"
          ? "Vehicle is already on rent."
          : "Cannot check out early: another reservation overlaps this period.",
      );
    }
    await tx
      .update(rentals)
      .set({ status: "ACTIVE", pickupOdometerKm, updatedAt: now })
      .where(eq(rentals.id, rentalId));
    await tx
      .update(vehicles)
      .set({ status: "INACTIVE", currentOdometerKm: pickupOdometerKm, updatedAt: now })
      .where(eq(vehicles.id, rental.vehicleId));
    await tx.insert(auditLogs).values({
      actorId,
      event: "RENTAL_STARTED",
      entityType: "rental",
      entityId: rental.id,
      branchId: rental.branchId,
      metadata: {
        agreementNumber: rental.agreementNumber,
        pickupOdometerKm,
      },
    });
    return { ...rental, status: "ACTIVE" as const, pickupOdometerKm, actorId };
  });
}
