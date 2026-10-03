import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  rentals,
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehicleOdometerHistory,
  vehiclePricing,
  vehicleRegistrations,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { brandSchema, normalizeMasterName, vehicleSchema } from "@/lib/validation";

export async function createBrand(input: unknown, actor: Identity) {
  if (!can(actor, "fleet", "create")) throw new Error("FORBIDDEN");
  const value = brandSchema.parse(input);
  return db.transaction(async (tx) => {
    const [brand] = await tx
      .insert(vehicleBrands)
      .values({ name: value.name.trim(), normalizedName: normalizeMasterName(value.name) })
      .returning();
    await tx.insert(vehicleModels).values(
      value.models.map((name) => ({
        brandId: brand.id,
        name: name.trim(),
        normalizedName: normalizeMasterName(name),
      })),
    );
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BRAND_CREATED",
      entityType: "vehicle_brand",
      entityId: brand.id,
    });
    return brand;
  });
}
export async function deleteBrand(id: string, actor: Identity, deactivate = false) {
  if (!can(actor, "fleet", "delete")) throw new Error("FORBIDDEN");
  const models = await db
    .select({ id: vehicleModels.id })
    .from(vehicleModels)
    .where(eq(vehicleModels.brandId, id));
  const [used] = models.length
    ? await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          inArray(
            vehicles.modelId,
            models.map((model) => model.id),
          ),
        )
        .limit(1)
    : [];
  if (used && !deactivate)
    throw new Error("This brand is used by an existing vehicle. Deactivate it instead.");
  if (used) {
    await db.transaction(async (tx) => {
      await tx
        .update(vehicleBrands)
        .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
        .where(eq(vehicleBrands.id, id));
      await tx
        .update(vehicleModels)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(vehicleModels.brandId, id));
    });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(vehicleModels).where(eq(vehicleModels.brandId, id));
    await tx.delete(vehicleBrands).where(eq(vehicleBrands.id, id));
  });
}
export async function updateBrand(id: string, input: unknown, actor: Identity) {
  if (!can(actor, "fleet", "update")) throw new Error("FORBIDDEN");
  const value = brandSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx
      .update(vehicleBrands)
      .set({
        name: value.name.trim(),
        normalizedName: normalizeMasterName(value.name),
        updatedAt: new Date(),
      })
      .where(eq(vehicleBrands.id, id));
    const current = await tx.select().from(vehicleModels).where(eq(vehicleModels.brandId, id));
    for (const name of value.models) {
      const normalizedName = normalizeMasterName(name);
      if (!current.some((model) => model.normalizedName === normalizedName))
        await tx.insert(vehicleModels).values({ brandId: id, name: name.trim(), normalizedName });
    }
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BRAND_UPDATED",
      entityType: "vehicle_brand",
      entityId: id,
    });
  });
}
export async function createVehicle(input: unknown, actor: Identity) {
  const value = vehicleSchema.parse(input);
  if (!can(actor, "fleet", "create", value.branchId)) throw new Error("FORBIDDEN");
  const [model] = await db
    .select()
    .from(vehicleModels)
    .where(and(eq(vehicleModels.id, value.modelId), eq(vehicleModels.brandId, value.brandId)))
    .limit(1);
  if (!model) throw new Error("Selected model does not belong to the brand.");
  for (const price of [value.daily, value.weekly, value.monthly])
    if (
      price.listRentBaisa < price.minimumRentBaisa &&
      !(actor.role === "ADMIN" || actor.role === "SUPER_ADMIN")
    )
      throw new Error("Price cannot be below the configured minimum.");
  const belowMinimum = [value.daily, value.weekly, value.monthly].some(
    (price) => price.listRentBaisa < price.minimumRentBaisa,
  );
  if (belowMinimum && !value.overrideReason)
    throw new Error("A price override reason is required.");
  return db.transaction(async (tx) => {
    const [vehicle] = await tx
      .insert(vehicles)
      .values({
        vehicleNumber: value.vehicleNumber,
        brandId: value.brandId,
        modelId: value.modelId,
        branchId: value.branchId,
        year: value.year,
        cylinderCount: value.cylinderCount,
        color: value.color,
        registrationNumber: value.registrationNumber,
        fuelType: value.fuelType,
        capacity: value.capacity,
        gearbox: value.gearbox,
        seatCount: value.seatCount,
        engineNumber: value.engineNumber,
        chassisNumber: value.chassisNumber,
        purchaseDate: value.purchaseDate.toISOString().slice(0, 10),
        currentOdometerKm: value.currentOdometerKm,
      })
      .returning();
    await tx.insert(vehicleInsurance).values({
      vehicleId: vehicle.id,
      company: value.insuranceCompany,
      policyNumber: value.insuranceNumber,
      validUntil: value.insuranceValidUntil.toISOString().slice(0, 10),
    });
    await tx.insert(vehicleServiceSettings).values({
      vehicleId: vehicle.id,
      lastEngineServiceKm: value.lastEngineServiceKm,
      lastGearOilChangeKm: value.lastGearOilChangeKm,
      engineServiceIntervalKm: value.engineServiceIntervalKm,
      gearOilIntervalKm: value.gearOilIntervalKm,
    });
    await tx.insert(vehicleRegistrations).values({
      vehicleId: vehicle.id,
      mulkiyaExpiryDate: value.mulkiyaExpiryDate.toISOString().slice(0, 10),
      issuingDetail: value.mulkiyaIssuingDetail,
    });
    await tx.insert(vehiclePricing).values(
      [
        ["DAILY", value.daily],
        ["WEEKLY", value.weekly],
        ["MONTHLY", value.monthly],
      ].map(([period, price]) => ({
        vehicleId: vehicle.id,
        period: period as "DAILY" | "WEEKLY" | "MONTHLY",
        ...(price as {
          listRentBaisa: number;
          minimumRentBaisa: number;
          includedKm: number;
          excessKmChargeBaisa: number;
        }),
        lateFeeBaisa: value.lateFeeBaisa,
        lateGraceMinutes: value.lateGraceMinutes,
        lateWindowHours: value.lateWindowHours,
        overdueFineBaisa: value.overdueFineBaisa,
      })),
    );
    await tx.insert(vehicleOdometerHistory).values({
      vehicleId: vehicle.id,
      odometerKm: value.currentOdometerKm,
      recordedBy: actor.id,
      note: "Initial vehicle odometer",
    });
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: belowMinimum ? "PRICE_OVERRIDDEN" : "VEHICLE_CREATED",
      entityType: "vehicle",
      entityId: vehicle.id,
      branchId: vehicle.branchId,
      metadata: belowMinimum ? { reason: value.overrideReason } : {},
    });
    return vehicle;
  });
}

/** Update all vehicle-owned records together so a form submission cannot leave a partial vehicle. */
export async function updateVehicle(id: string, input: unknown, actor: Identity) {
  const value = vehicleSchema.parse(input);
  const [existing] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!existing) throw new Error("Vehicle not found.");
  if (
    !can(actor, "fleet", "update", existing.branchId) ||
    !can(actor, "fleet", "update", value.branchId)
  )
    throw new Error("FORBIDDEN");
  const [model] = await db
    .select()
    .from(vehicleModels)
    .where(and(eq(vehicleModels.id, value.modelId), eq(vehicleModels.brandId, value.brandId)))
    .limit(1);
  if (!model) throw new Error("Selected model does not belong to the brand.");
  const prices = [value.daily, value.weekly, value.monthly];
  if (
    prices.some((price) => price.listRentBaisa < price.minimumRentBaisa) &&
    !(actor.role === "ADMIN" || actor.role === "SUPER_ADMIN")
  )
    throw new Error("Price cannot be below the configured minimum.");
  const belowMinimum = prices.some((price) => price.listRentBaisa < price.minimumRentBaisa);
  if (belowMinimum && !value.overrideReason)
    throw new Error("A price override reason is required.");
  return db.transaction(async (tx) => {
    await tx
      .update(vehicles)
      .set({
        vehicleNumber: value.vehicleNumber,
        brandId: value.brandId,
        modelId: value.modelId,
        branchId: value.branchId,
        year: value.year,
        cylinderCount: value.cylinderCount,
        color: value.color,
        registrationNumber: value.registrationNumber,
        fuelType: value.fuelType,
        capacity: value.capacity,
        gearbox: value.gearbox,
        seatCount: value.seatCount,
        engineNumber: value.engineNumber,
        chassisNumber: value.chassisNumber,
        purchaseDate: value.purchaseDate.toISOString().slice(0, 10),
        currentOdometerKm: value.currentOdometerKm,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id));
    await tx
      .update(vehicleInsurance)
      .set({
        company: value.insuranceCompany,
        policyNumber: value.insuranceNumber,
        validUntil: value.insuranceValidUntil.toISOString().slice(0, 10),
        updatedAt: new Date(),
      })
      .where(eq(vehicleInsurance.vehicleId, id));
    await tx
      .update(vehicleServiceSettings)
      .set({
        lastEngineServiceKm: value.lastEngineServiceKm,
        lastGearOilChangeKm: value.lastGearOilChangeKm,
        engineServiceIntervalKm: value.engineServiceIntervalKm,
        gearOilIntervalKm: value.gearOilIntervalKm,
        updatedAt: new Date(),
      })
      .where(eq(vehicleServiceSettings.vehicleId, id));
    await tx
      .update(vehicleRegistrations)
      .set({
        mulkiyaExpiryDate: value.mulkiyaExpiryDate.toISOString().slice(0, 10),
        issuingDetail: value.mulkiyaIssuingDetail || null,
        updatedAt: new Date(),
      })
      .where(eq(vehicleRegistrations.vehicleId, id));
    for (const [period, price] of [
      ["DAILY", value.daily],
      ["WEEKLY", value.weekly],
      ["MONTHLY", value.monthly],
    ] as const)
      await tx
        .update(vehiclePricing)
        .set({
          ...price,
          lateFeeBaisa: value.lateFeeBaisa,
          lateGraceMinutes: value.lateGraceMinutes,
          lateWindowHours: value.lateWindowHours,
          overdueFineBaisa: value.overdueFineBaisa,
          updatedAt: new Date(),
        })
        .where(and(eq(vehiclePricing.vehicleId, id), eq(vehiclePricing.period, period)));
    if (value.currentOdometerKm !== existing.currentOdometerKm)
      await tx.insert(vehicleOdometerHistory).values({
        vehicleId: id,
        odometerKm: value.currentOdometerKm,
        recordedBy: actor.id,
        note: "Vehicle updated",
      });
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: belowMinimum ? "PRICE_OVERRIDDEN" : "VEHICLE_UPDATED",
      entityType: "vehicle",
      entityId: id,
      branchId: value.branchId,
      metadata: belowMinimum ? { reason: value.overrideReason } : {},
    });
  });
}

export async function deleteVehicle(id: string, actor: Identity, deactivate = false) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!vehicle) throw new Error("Vehicle not found.");
  if (!can(actor, "fleet", deactivate ? "update" : "delete", vehicle.branchId))
    throw new Error("FORBIDDEN");
  if (vehicle.status !== "AVAILABLE")
    throw new Error("This vehicle is not available and cannot be deleted or deactivated.");
  if (deactivate) {
    await db.transaction(async (tx) => {
      await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
      const [commitment] = await tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(and(eq(rentals.vehicleId, id), inArray(rentals.status, ["RESERVED", "ACTIVE"])))
        .limit(1);
      if (commitment) throw new Error("Vehicle has a pending reservation or active rental.");
      await tx
        .update(vehicles)
        .set({
          status: "INACTIVE",
          isActive: false,
          deactivatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        event: "VEHICLE_DEACTIVATED",
        entityType: "vehicle",
        entityId: id,
        branchId: vehicle.branchId,
      });
    });
    return { deactivated: true };
  }
  const [odometerHistory] = await db
    .select({ total: count() })
    .from(vehicleOdometerHistory)
    .where(eq(vehicleOdometerHistory.vehicleId, id));
  if ((odometerHistory?.total ?? 0) > 1)
    throw new Error(
      "This vehicle has operational history and cannot be deleted. Deactivate it instead.",
    );
  await db.transaction(async (tx) => {
    await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
    const [history] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.vehicleId, id))
      .limit(1);
    if (history) throw new Error("Vehicle has rental history. Deactivate it instead.");
    await tx.delete(vehiclePricing).where(eq(vehiclePricing.vehicleId, id));
    await tx.delete(vehicleRegistrations).where(eq(vehicleRegistrations.vehicleId, id));
    await tx.delete(vehicleServiceSettings).where(eq(vehicleServiceSettings.vehicleId, id));
    await tx.delete(vehicleInsurance).where(eq(vehicleInsurance.vehicleId, id));
    await tx.delete(vehicleOdometerHistory).where(eq(vehicleOdometerHistory.vehicleId, id));
    await tx.delete(vehicles).where(eq(vehicles.id, id));
  });
  return { deactivated: false };
}

export async function setVehicleActive(id: string, active: boolean, actor: Identity) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  if (!vehicle) throw new Error("Vehicle not found.");
  if (!can(actor, "fleet", "update", vehicle.branchId)) throw new Error("FORBIDDEN");
  if (!active && vehicle.status !== "AVAILABLE")
    throw new Error(
      "This vehicle is reserved, rented, overdue, transferred, in service, or otherwise unavailable and cannot be deactivated.",
    );
  if (active && vehicle.status !== "INACTIVE")
    throw new Error("Only an inactive vehicle can be activated.");
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for("update");
    const [commitment] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.vehicleId, id), inArray(rentals.status, ["RESERVED", "ACTIVE"])))
      .limit(1);
    if (commitment) throw new Error("Vehicle has a pending reservation or active rental.");
    if (!current || (active ? current.status !== "INACTIVE" : current.status !== "AVAILABLE"))
      throw new Error("Vehicle status changed. Refresh the fleet page.");
    await tx
      .update(vehicles)
      .set({
        status: active ? "AVAILABLE" : "INACTIVE",
        isActive: active,
        deactivatedAt: active ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: active ? "VEHICLE_UPDATED" : "VEHICLE_DEACTIVATED",
      entityType: "vehicle",
      entityId: id,
      branchId: vehicle.branchId,
      metadata: { active },
    });
  });
}
