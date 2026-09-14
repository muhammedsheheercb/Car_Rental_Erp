"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  branches,
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehiclePricing,
  vehicleRegistrations,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { createBrand, createVehicle, deleteBrand, updateBrand } from "@/features/fleet/service";
import { requirePermission } from "@/lib/auth";
import { brandSchema, vehicleSchema } from "@/lib/validation";

export async function createBrandAction(formData: FormData) {
  const actor = await requirePermission("fleet", "create");
  const models = formData
    .getAll("models")
    .flatMap((value) => String(value).split("\n"))
    .map((value) => value.trim())
    .filter(Boolean);
  const input = { name: String(formData.get("name") ?? "").trim(), models };
  if (!brandSchema.safeParse(input).success)
    return { ok: false, message: "Enter a brand name and at least one model." };
  try {
    await createBrand(input, actor);
    revalidatePath("/en/fleet/master");
    return { ok: true, message: "Vehicle brand created successfully." };
  } catch {
    return { ok: false, message: "This brand or model already exists." };
  }
}
export async function createVehicleAction(input: unknown) {
  const actor = await requirePermission("fleet", "create");
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    const labels: Record<string, string> = {
      cylinderCount: "Cylinder count",
      year: "Year",
      seatCount: "Seat count",
      currentOdometerKm: "Current odometer",
      lastEngineServiceKm: "Last engine service",
      lastGearOilChangeKm: "Last gear-oil change",
      engineServiceIntervalKm: "Engine service interval",
      gearOilIntervalKm: "Gear-oil interval",
    };
    const label = typeof field === "string" ? (labels[field] ?? field) : "This value";
    const message = ["invalid_type", "too_big", "too_small"].includes(issue?.code ?? "")
      ? `${label} must be a whole number within the allowed range.`
      : (issue?.message ?? "Check the vehicle details.");
    return { ok: false, message };
  }
  try {
    const vehicle = await createVehicle(parsed.data, actor);
    revalidatePath("/en/fleet");
    return { ok: true, message: "Vehicle created successfully.", id: vehicle.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "We could not create this vehicle.",
    };
  }
}
export async function deleteBrandAction(id: string, deactivate = false) {
  const actor = await requirePermission("fleet", "delete");
  try {
    await deleteBrand(id, actor, deactivate);
    revalidatePath("/en/fleet/master");
    return {
      ok: true,
      message: deactivate
        ? "Vehicle brand deactivated successfully."
        : "Vehicle brand deleted successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "We could not delete this brand.",
    };
  }
}
export async function updateBrandAction(id: string, input: unknown) {
  const actor = await requirePermission("fleet", "update");
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid brand details." };
  try {
    await updateBrand(id, parsed.data, actor);
    revalidatePath("/en/fleet/master");
    return { ok: true, message: "Vehicle brand updated successfully." };
  } catch {
    return { ok: false, message: "A matching brand or model already exists." };
  }
}
export async function getVehicleDetailsAction(id: string) {
  const actor = await requirePermission("fleet", "read");
  const [vehicle] = await db
    .select({
      id: vehicles.id,
      number: vehicles.vehicleNumber,
      year: vehicles.year,
      color: vehicles.color,
      registration: vehicles.registrationNumber,
      chassis: vehicles.chassisNumber,
      engine: vehicles.engineNumber,
      odometer: vehicles.currentOdometerKm,
      status: vehicles.status,
      createdAt: vehicles.createdAt,
      updatedAt: vehicles.updatedAt,
      brand: vehicleBrands.name,
      model: vehicleModels.name,
      branch: branches.name,
      insuranceCompany: vehicleInsurance.company,
      insuranceNumber: vehicleInsurance.policyNumber,
      insuranceUntil: vehicleInsurance.validUntil,
      mulkiyaUntil: vehicleRegistrations.mulkiyaExpiryDate,
      issuingDetail: vehicleRegistrations.issuingDetail,
      engineInterval: vehicleServiceSettings.engineServiceIntervalKm,
      gearInterval: vehicleServiceSettings.gearOilIntervalKm,
    })
    .from(vehicles)
    .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
    .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
    .innerJoin(branches, eq(vehicles.branchId, branches.id))
    .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
    .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
    .leftJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
    .where(
      and(
        eq(vehicles.id, id),
        actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
      ),
    )
    .limit(1);
  if (!vehicle) throw new Error("Vehicle not found or access is restricted.");
  const pricing = await db.select().from(vehiclePricing).where(eq(vehiclePricing.vehicleId, id));
  return { ...vehicle, pricing };
}
