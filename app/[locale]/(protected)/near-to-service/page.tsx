import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { branches, vehicleServiceSettings, vehicles } from "@/db/schema";
import { serviceDue } from "@/features/maintenance/calculations";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { requirePermission } from "@/lib/auth";
export default async function NearServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const { locale } = await params;
  const { q = "" } = await searchParams;
  const [policy, rows] = await Promise.all([
    fleetAlertSettings(),
    db
      .select({ v: vehicles, s: vehicleServiceSettings, branch: branches.name })
      .from(vehicles)
      .innerJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
        ),
      ),
  ]);
  const alerts = rows
    .flatMap(({ v, s, branch }) =>
      [
        {
          type: "Engine",
          ...serviceDue(
            v.currentOdometerKm,
            s.lastEngineServiceKm,
            s.engineServiceIntervalKm,
            policy.nearServiceKm,
          ),
        },
        {
          type: "Gear Oil",
          ...serviceDue(
            v.currentOdometerKm,
            s.lastGearOilChangeKm,
            s.gearOilIntervalKm,
            policy.nearServiceKm,
          ),
        },
      ]
        .filter(
          (a) =>
            a.show &&
            `${v.vehicleNumber} ${v.registrationNumber} ${branch}`
              .toLowerCase()
              .includes(q.toLowerCase()),
        )
        .map((a) => ({ ...a, v, branch })),
    )
    .sort((a, b) => a.remainingKm - b.remainingKm);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">Near To Service</h1>
      <p>
        Vehicles within {policy.nearServiceKm} KM of the next service, including overdue service.
      </p>
      <Link href={`/${locale}/service` as never}>Service</Link>
      <form className="flex gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Vehicle / Registration / Branch"
          aria-label="Search near service"
          className="input"
        />
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Vehicle",
                "Registration",
                "Service Type",
                "Current KM",
                "Next Service KM",
                "KM Remaining",
                "Branch",
                "Status",
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={`${a.v.id}-${a.type}`} className="border-t border-[var(--edge)]">
                <td className="p-3">{a.v.vehicleNumber}</td>
                <td className="p-3">{a.v.registrationNumber}</td>
                <td className="p-3">{a.type}</td>
                <td className="p-3">{a.v.currentOdometerKm}</td>
                <td className="p-3">{a.nextServiceKm}</td>
                <td className="p-3 font-semibold">{a.remainingKm}</td>
                <td className="p-3">{a.branch}</td>
                <td className="p-3">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!alerts.length && <p>No vehicles near service.</p>}
    </div>
  );
}
