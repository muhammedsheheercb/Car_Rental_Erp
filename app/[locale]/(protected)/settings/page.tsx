import { and, eq, inArray } from "drizzle-orm";
import { AlertSettingsForm, SignatureForm } from "@/components/settings-forms";
import { db } from "@/db/client";
import { userSignatures } from "@/db/schema";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { signatureUsers } from "@/features/signatures/service";
import { can, requirePermission } from "@/lib/auth";
export default async function SettingsPage() {
  const actor = await requirePermission("settings", "read");
  const [policy, options] = await Promise.all([fleetAlertSettings(), signatureUsers(actor)]);
  const existing = options.length
    ? await db
        .select({ id: userSignatures.id, userId: userSignatures.userId })
        .from(userSignatures)
        .where(
          and(
            inArray(
              userSignatures.userId,
              options.map((u) => u.id),
            ),
            eq(userSignatures.isCurrent, true),
          ),
        )
    : [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        {can(actor, "settings", "update") ? (
          <SignatureForm
            users={options}
            initialUser={options.find((u) => u.id === actor.id)?.id ?? options[0]?.id ?? ""}
            existing={existing}
          />
        ) : (
          <p>Signature changes require settings update permission.</p>
        )}
        {["ADMIN", "SUPER_ADMIN"].includes(actor.role) && can(actor, "settings", "update") ? (
          <AlertSettingsForm
            nearServiceKm={policy.nearServiceKm}
            expirySoonDays={policy.expirySoonDays}
          />
        ) : (
          <p>
            Near To Service: {policy.nearServiceKm} KM remaining. Expiring Soon:{" "}
            {policy.expirySoonDays} days remaining.
          </p>
        )}
      </div>
    </div>
  );
}
