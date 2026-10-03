import "server-only";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  customerLedger,
  rentalCancellations,
  rentalCharges,
  rentalExtensions,
  rentals,
  vehicleDamageEvidence,
  vehicles,
} from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { validateEvidencePhoto } from "@/lib/image-file";
import { putPrivateCustomerDocument } from "@/lib/r2";
import { cancellationSchema, damageSchema, extensionSchema } from "@/lib/validation";
import {
  calculateExcessKm,
  calculateExpectedReturn,
  parseOmanDateTime,
} from "./booking-calculations";
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
    if (returnedAt < rental.startsAt || returnedAt > new Date())
      throw new Error("Return time must be between pickup and now in Oman time.");
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
  });
}
