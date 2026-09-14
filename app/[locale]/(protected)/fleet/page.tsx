import { and, count, desc, eq, ilike, inArray } from "drizzle-orm";
import Link from "next/link";
import { VehicleActions } from "@/components/vehicle-actions";
import { db } from "@/db/client";
import { vehicleBrands, vehicleModels, vehicles } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branch?: string; page?: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const { q = "", branch, page = "1" } = await searchParams;
  const where = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
    branch ? eq(vehicles.branchId, branch) : undefined,
    q ? ilike(vehicles.registrationNumber, `%${q}%`) : undefined,
  );
  const [records, total] = await Promise.all([
    db
      .select({
        id: vehicles.id,
        number: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        status: vehicles.status,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
      })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .where(where)
      .orderBy(desc(vehicles.createdAt))
      .limit(15)
      .offset(Math.max(0, (Number(page) - 1) * 15)),
    db.select({ count: count() }).from(vehicles).where(where),
  ]);
  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-[var(--accent)]">FLEET</p>
          <h1 className="mt-2 text-3xl font-semibold">Vehicles</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link
            href="/en/fleet/master"
            className="min-h-11 rounded-lg border border-[var(--edge)] px-3 py-3 text-center text-sm sm:px-4"
          >
            Vehicle master
          </Link>
          <Link
            href="/en/fleet/new"
            className="min-h-11 rounded-lg bg-[var(--accent)] px-3 py-3 text-center text-sm font-semibold text-black sm:px-4"
          >
            Create vehicle
          </Link>
        </div>
      </div>
      <form className="mt-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search registration number"
          className="min-h-11 w-full max-w-md rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3"
        />
      </form>
      <p className="mt-4 text-sm text-[var(--muted)]">{total[0]?.count ?? 0} vehicles</p>
      <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain]">
        <table className="min-w-[42rem] w-full text-start text-sm">
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th className="p-4">Vehicle</th>
              <th className="p-4">Registration</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((vehicle) => (
              <tr key={vehicle.id} className="border-t border-[var(--edge)]">
                <td className="p-4 font-medium">
                  {vehicle.brand} {vehicle.model}
                  <p className="font-mono text-xs text-[var(--muted)]">{vehicle.number}</p>
                </td>
                <td className="p-4">{vehicle.registration}</td>
                <td className="p-4">{vehicle.status}</td>
                <td className="p-2 whitespace-nowrap">
                  <VehicleActions
                    id={vehicle.id}
                    name={`${vehicle.brand} ${vehicle.model}`}
                    registration={vehicle.registration}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && <p className="p-8 text-[var(--muted)]">No vehicles found.</p>}
      </div>
    </>
  );
}
