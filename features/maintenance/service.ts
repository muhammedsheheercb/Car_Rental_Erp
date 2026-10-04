import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  customers,
  rentals,
  serviceExpenses,
  serviceHistory,
  userBranches,
  users,
  vehicleBrands,
  vehicleOdometerHistory,
  vehicleServiceSettings,
  vehicleServices,
  vehicles,
} from "@/db/schema";
import { parseOMR } from "@/features/finance/calculations";
import { parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, type Identity } from "@/lib/auth";

const km = z.coerce.number().int().min(0).max(2147483647);
const optionalUUID = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.uuid().optional(),
);
const schema = z.object({
  vehicleId: z.uuid(),
  requestId: z.uuid(),
  rentalId: optionalUUID,
  staffId: z.uuid(),
  serviceBy: z.enum(["COMPANY", "CUSTOMER"]),
  type: z.enum(["ENGINE", "GEAR_OIL", "OTHER"]),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]),
  outAt: z.string().transform(parseOmanDateTime),
  completedAt: z.string().optional(),
  kmReading: km,
  serviceOdometerKm: km,
  cost: z.string().transform(parseOMR),
  paymentMode: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  dueDate: z.string().optional(),
  dueOdometerKm: z.preprocess((v) => (v === "" ? undefined : v), km.optional()),
  remarks: z.string().trim().min(1).max(2000),
});
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function blockCheck(tx: Tx, vehicleId: string, serviceId?: string) {
  const [rental] = await tx
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.vehicleId, vehicleId), inArray(rentals.status, ["ACTIVE", "RESERVED"])));
  if (rental)
    throw new Error(
      "Company service cannot start while the vehicle has an active rental or reservation.",
    );
  const [other] = await tx
    .select({ id: vehicleServices.id })
    .from(vehicleServices)
    .where(
      and(
        eq(vehicleServices.vehicleId, vehicleId),
        eq(vehicleServices.status, "IN_PROGRESS"),
        serviceId ? ne(vehicleServices.id, serviceId) : undefined,
      ),
    );
  if (other) throw new Error("This vehicle already has a service in progress.");
}
async function complete(
  tx: Tx,
  s: typeof vehicleServices.$inferSelect,
  v: typeof vehicles.$inferSelect,
  actor: Identity,
  odometer: number,
  at: Date,
  cost: number,
  mode: "CASH" | "CARD" | "BANK_TRANSFER",
) {
  if (odometer < (s.kmReading ?? v.currentOdometerKm) || odometer < v.currentOdometerKm)
    throw new Error("Service KM cannot move the vehicle odometer backwards.");
  if (at < (s.outAt ?? s.createdAt) || at > new Date())
    throw new Error("Completion must be between the service out time and now in Oman time.");
  const [settings] = await tx
    .select()
    .from(vehicleServiceSettings)
    .where(eq(vehicleServiceSettings.vehicleId, v.id));
  if (["ENGINE", "GEAR_OIL"].includes(s.type)) {
    if (!settings)
      throw new Error("Configure the vehicle's service intervals before completing this service.");
    const previous =
      s.type === "ENGINE" ? settings.lastEngineServiceKm : settings.lastGearOilChangeKm;
    if (odometer < previous)
      throw new Error("Service reading cannot move service history backwards.");
    await tx
      .update(vehicleServiceSettings)
      .set({
        ...(s.type === "ENGINE"
          ? { lastEngineServiceKm: odometer }
          : { lastGearOilChangeKm: odometer }),
        updatedAt: new Date(),
      })
      .where(eq(vehicleServiceSettings.id, settings.id));
  }
  await tx
    .update(vehicles)
    .set({ currentOdometerKm: odometer, updatedAt: new Date() })
    .where(eq(vehicles.id, v.id));
  await tx.insert(vehicleOdometerHistory).values({
    vehicleId: v.id,
    odometerKm: odometer,
    recordedBy: actor.id,
    note: `${s.type} service ${s.id}`,
  });
  if (cost)
    await tx.insert(serviceExpenses).values({
      serviceId: s.id,
      amountBaisa: cost,
      paidBy: s.serviceBy,
      paymentMode: mode,
      recordedBy: actor.id,
    });
}
export async function createService(raw: unknown, actor: Identity) {
  const input = schema.parse(raw);
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId))
      .for("update");
    if (!v?.isActive || !can(actor, "fleet", "create", v.branchId))
      throw new Error("Vehicle not found or access denied.");
    const [existing] = await tx
      .select()
      .from(vehicleServices)
      .where(eq(vehicleServices.requestId, input.requestId));
    if (existing) {
      if (existing.vehicleId !== v.id) throw new Error("Request already used.");
      return existing;
    }
    if (input.outAt > new Date())
      throw new Error(
        "Service out time cannot be in the future. Use Due Date to schedule future work.",
      );
    if (input.serviceOdometerKm < input.kmReading || input.kmReading < v.currentOdometerKm)
      throw new Error("Service odometer readings cannot move backwards.");
    const [staff] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.staffId),
          eq(users.isActive, true),
          input.staffId === actor.id
            ? undefined
            : sql`exists (select 1 from ${userBranches} where ${userBranches.userId}=${users.id} and ${userBranches.branchId}=${v.branchId})`,
        ),
      );
    if (!staff) throw new Error("Select active staff assigned to this vehicle's branch.");
    const [r] = input.rentalId
      ? await tx.select().from(rentals).where(eq(rentals.id, input.rentalId)).for("update")
      : [];
    if (
      input.rentalId &&
      (!r ||
        r.vehicleId !== v.id ||
        !can(actor, "fleet", "create", r.branchId) ||
        !["ACTIVE", "RETURNED"].includes(r.status) ||
        input.outAt < (r.segmentStartedAt ?? r.startsAt) ||
        input.outAt > (r.actualReturnAt ?? new Date()))
    )
      throw new Error("Customer booking must match this vehicle and its occupied rental period.");
    if (input.serviceBy === "CUSTOMER" && (!r || input.status !== "COMPLETED"))
      throw new Error("Service By Customer requires an occupied booking and a completed service.");
    if (input.status !== "COMPLETED" && input.cost)
      throw new Error("Record the actual expense when service is completed.");
    if (input.status === "IN_PROGRESS") await blockCheck(tx, v.id);
    if (input.status === "SCHEDULED" && !input.dueDate && !input.dueOdometerKm)
      throw new Error("Scheduled service requires a due date or due KM.");
    const dueDate = input.dueDate ? parseOmanDateTime(`${input.dueDate}T00:00`) : undefined;
    const [c] = r ? await tx.select().from(customers).where(eq(customers.id, r.customerId)) : [];
    const [brand] = await tx
      .select({ name: vehicleBrands.name })
      .from(vehicleBrands)
      .where(eq(vehicleBrands.id, v.brandId));
    const at =
      input.status === "COMPLETED"
        ? input.completedAt
          ? parseOmanDateTime(input.completedAt)
          : input.outAt
        : null;
    const [record] = await tx
      .insert(vehicleServices)
      .values({
        vehicleId: v.id,
        requestId: input.requestId,
        branchId: v.branchId,
        serviceBy: input.serviceBy,
        rentalId: r?.id,
        customerId: r?.customerId,
        staffId: input.staffId,
        status: input.status,
        type: input.type,
        outAt: input.outAt,
        kmReading: input.kmReading,
        serviceOdometerKm: input.status === "COMPLETED" ? input.serviceOdometerKm : null,
        completedAt: at,
        costBaisa: input.status === "COMPLETED" ? input.cost : 0,
        paymentMode: input.paymentMode,
        dueDate: dueDate ? input.dueDate : null,
        dueOdometerKm: input.dueOdometerKm,
        note: input.remarks,
        snapshot: {
          vehicle: v.vehicleNumber,
          brand: brand?.name,
          registration: v.registrationNumber,
          customer: c?.name ?? null,
          customerMobile: c?.mobile ?? null,
          booking: r?.agreementNumber ?? null,
          bookingOutAt: r?.startsAt.toISOString() ?? null,
        },
        createdBy: actor.id,
      })
      .returning();
    if (at)
      await complete(
        tx,
        record,
        v,
        actor,
        input.serviceOdometerKm,
        at,
        input.cost,
        input.paymentMode,
      );
    await tx
      .insert(serviceHistory)
      .values({ serviceId: record.id, action: "CREATED", snapshot: record, actorId: actor.id });
    return record;
  });
}
export async function changeService(raw: unknown, actor: Identity) {
  const input = z
    .object({
      serviceId: z.uuid(),
      status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
      serviceOdometerKm: km,
      completedAt: z.string(),
      cost: z.string().transform(parseOMR),
      paymentMode: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
      remarks: z.string().trim().min(1).max(2000),
    })
    .parse(raw);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(vehicleServices)
      .where(eq(vehicleServices.id, input.serviceId));
    if (!candidate) throw new Error("Service not found.");
    const [v] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, candidate.vehicleId))
      .for("update");
    const [s] = await tx
      .select()
      .from(vehicleServices)
      .where(eq(vehicleServices.id, candidate.id))
      .for("update");
    if (!v || !s || !can(actor, "fleet", "update", s.branchId ?? v.branchId))
      throw new Error("Service not found or access denied.");
    if (["COMPLETED", "CANCELLED"].includes(s.status))
      throw new Error("Completed or cancelled service history is immutable.");
    if (input.status === "IN_PROGRESS" && s.status !== "SCHEDULED")
      throw new Error("Only scheduled services can start.");
    if (input.status === "IN_PROGRESS") await blockCheck(tx, v.id, s.id);
    const at = input.status === "COMPLETED" ? parseOmanDateTime(input.completedAt) : null;
    if (at)
      await complete(tx, s, v, actor, input.serviceOdometerKm, at, input.cost, input.paymentMode);
    const [updated] = await tx
      .update(vehicleServices)
      .set({
        status: input.status,
        completedAt: at,
        serviceOdometerKm: at ? input.serviceOdometerKm : s.serviceOdometerKm,
        costBaisa: at ? input.cost : s.costBaisa,
        paymentMode: at ? input.paymentMode : s.paymentMode,
        updatedAt: new Date(),
      })
      .where(eq(vehicleServices.id, s.id))
      .returning();
    await tx.insert(serviceHistory).values({
      serviceId: s.id,
      action: input.status,
      snapshot: { before: s, after: updated, remarks: input.remarks },
      actorId: actor.id,
    });
    return updated;
  });
}
