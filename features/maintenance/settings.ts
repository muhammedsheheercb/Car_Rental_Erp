import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { operationalSettings } from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { DEFAULT_FLEET_ALERTS } from "./calculations";
export async function fleetAlertSettings() {
  const [row] = await db
    .select()
    .from(operationalSettings)
    .where(eq(operationalSettings.key, "fleet-alerts"));
  return row ?? DEFAULT_FLEET_ALERTS;
}
export async function saveFleetAlerts(raw: unknown, actor: Identity) {
  if (!["ADMIN", "SUPER_ADMIN"].includes(actor.role) || !can(actor, "settings", "update"))
    throw new Error("Administrator settings permission is required.");
  const values = z
    .object({
      nearServiceKm: z.coerce.number().int().min(0).max(100000),
      expirySoonDays: z.coerce.number().int().min(0).max(3650),
    })
    .parse(raw);
  await db
    .insert(operationalSettings)
    .values({ key: "fleet-alerts", ...values, updatedBy: actor.id })
    .onConflictDoUpdate({
      target: operationalSettings.key,
      set: { ...values, updatedBy: actor.id, updatedAt: new Date() },
    });
}
