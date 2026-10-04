import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { branches, vehicleInsurance, vehicleRegistrations, vehicles } from "@/db/schema";
import { expiryStatus } from "@/features/maintenance/calculations";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { requirePermission } from "@/lib/auth";
export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const { q = "", status = "" } = await searchParams;
  const [policy, rows] = await Promise.all([
    fleetAlertSettings(),
    db
      .select({
        v: vehicles,
        branch: branches.name,
        insurance: vehicleInsurance.validUntil,
        mulkiya: vehicleRegistrations.mulkiyaExpiryDate,
      })
      .from(vehicles)
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
        ),
      ),
  ]);
  const now = new Date();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Expiry</h1>
      <p>
        Today in Oman: {formatOmanDateTime(now).slice(0, 10)} · Expiring Soon threshold:{" "}
        {policy.expirySoonDays} days. Documents remain valid through their expiry date.
      </p>
      <form className="flex flex-wrap gap-3">
        <input
          name="q"
          className="input"
          defaultValue={q}
          placeholder="Vehicle / Registration / Branch"
          aria-label="Search expiry"
        />
        <select name="status" defaultValue={status} aria-label="Expiry status" className="input">
          <option value="">All statuses</option>
          {["Expired", "Expiring Soon", "Valid", "Not configured"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="btn">
          Search / Filter
        </button>
      </form>
      {(["mulkiya", "insurance"] as const).map((type) => {
        const items = rows
          .map((r) => ({ ...r, ...expiryStatus(r[type], now, policy.expirySoonDays) }))
          .filter(
            (r) =>
              (!status || r.status === status) &&
              `${r.v.vehicleNumber} ${r.v.registrationNumber} ${r.branch}`
                .toLowerCase()
                .includes(q.toLowerCase()),
          )
          .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));
        return (
          <section key={type}>
            <h2 className="text-xl font-semibold">
              {type === "mulkiya" ? "Mulkiya Expiry" : "Insurance Expiry"}
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Vehicle",
                      "Registration",
                      "Expiry Date",
                      "Days Remaining",
                      "Branch",
                      "Status",
                    ].map((h) => (
                      <th className="p-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.v.id} className="border-t border-[var(--edge)]">
                      <td className="p-3">{r.v.vehicleNumber}</td>
                      <td className="p-3">{r.v.registrationNumber}</td>
                      <td className="p-3">{r[type] ?? "—"}</td>
                      <td className="p-3 font-semibold">{r.daysRemaining ?? "—"}</td>
                      <td className="p-3">{r.branch}</td>
                      <td className="p-3">
                        <span
                          className={
                            r.status === "Expired"
                              ? "text-red-400"
                              : r.status === "Expiring Soon"
                                ? "text-amber-300"
                                : ""
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!items.length && <p>No matching vehicles.</p>}
          </section>
        );
      })}
    </div>
  );
}
