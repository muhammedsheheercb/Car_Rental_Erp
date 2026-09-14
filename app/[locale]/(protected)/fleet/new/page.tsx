import { asc, eq, inArray } from "drizzle-orm";
import { VehicleWizard } from "@/components/vehicle-wizard";
import { db } from "@/db/client";
import { branches, vehicleBrands, vehicleModels } from "@/db/schema";
import { requirePermission } from "@/lib/auth";

export default async function NewVehiclePage() {
  const actor = await requirePermission("fleet", "create");
  const [brands, models, availableBranches] = await Promise.all([
    db
      .select({ id: vehicleBrands.id, name: vehicleBrands.name })
      .from(vehicleBrands)
      .where(eq(vehicleBrands.isActive, true))
      .orderBy(asc(vehicleBrands.name)),
    db
      .select({ id: vehicleModels.id, brandId: vehicleModels.brandId, name: vehicleModels.name })
      .from(vehicleModels)
      .where(eq(vehicleModels.isActive, true))
      .orderBy(asc(vehicleModels.name)),
    actor.role === "SUPER_ADMIN"
      ? db
          .select({ id: branches.id, name: branches.name, code: branches.code })
          .from(branches)
          .where(eq(branches.isActive, true))
      : db
          .select({ id: branches.id, name: branches.name, code: branches.code })
          .from(branches)
          .where(inArray(branches.id, actor.branchIds)),
  ]);
  return <VehicleWizard brands={brands} models={models} branches={availableBranches} />;
}
