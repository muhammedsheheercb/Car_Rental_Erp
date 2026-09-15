import { and, count, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import Link from "next/link";
import { FleetControls } from "@/components/fleet-controls";
import { VehicleActions } from "@/components/vehicle-actions";
import { db } from "@/db/client";
import {
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehicleRegistrations,
  vehicles,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export default async function FleetPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ q?: string; branch?: string; page?: string; filter?: string }>;
  params: Promise<{ locale: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const [{ q = "", branch, page = "1", filter = "all" }, { locale }] = await Promise.all([
    searchParams,
    params,
  ]);
  const currentPage = Math.max(1, Number(page) || 1);
  const today = new Date().toISOString().slice(0, 10);
  const filterWhere =
    filter === "available"
      ? and(eq(vehicles.status, "AVAILABLE"), eq(vehicles.isActive, true))
      : filter === "unavailable"
        ? or(eq(vehicles.status, "INACTIVE"), eq(vehicles.isActive, false))
        : filter === "mulkiya_expired"
          ? lt(vehicleRegistrations.mulkiyaExpiryDate, today)
          : filter === "insurance_expired"
            ? lt(vehicleInsurance.validUntil, today)
            : undefined;
  const where = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
    branch ? eq(vehicles.branchId, branch) : undefined,
    q
      ? or(
          ilike(vehicles.registrationNumber, `%${q}%`),
          ilike(vehicles.vehicleNumber, `%${q}%`),
          ilike(vehicleBrands.name, `%${q}%`),
          ilike(vehicleModels.name, `%${q}%`),
        )
      : undefined,
    filterWhere,
  );
  const [records, total] = await Promise.all([
    db
      .select({
        id: vehicles.id,
        number: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        status: vehicles.status,
        isActive: vehicles.isActive,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
      })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(vehicles.createdAt))
      .limit(15)
      .offset((currentPage - 1) * 15),
    db
      .select({ count: count() })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .where(where),
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
            href={`/${locale}/fleet/master`}
            className="min-h-11 rounded-lg border border-[var(--edge)] px-3 py-3 text-center text-sm sm:px-4"
          >
            Vehicle master
          </Link>
          <Link
            href={`/${locale}/fleet/new`}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-3 py-3 text-center text-sm font-semibold text-black sm:px-4"
          >
            Create vehicle
          </Link>
        </div>
      </div>
      <FleetControls total={total[0]?.count ?? 0} />
      <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain]">
        <table className="w-full min-w-[50rem] table-fixed text-start text-sm">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[24%]" />
            <col className="w-[18%]" />
            <col className="w-[15rem]" />
          </colgroup>
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
              >
                Vehicle
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
              >
                Registration
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((vehicle) => (
              <tr
                key={vehicle.id}
                className={`border-t border-[var(--edge)] align-middle transition-colors hover:bg-white/5 focus-within:bg-white/10 ${vehicle.status === "AVAILABLE" ? "bg-emerald-400/5" : "bg-amber-400/5"}`}
              >
                <td className="px-4 py-3 font-medium align-middle">
                  <span className="block break-words">
                    {vehicle.brand} {vehicle.model}
                  </span>
                  <p className="font-mono text-xs text-[var(--muted)]">{vehicle.number}</p>
                </td>
                <td className="break-words px-4 py-3 align-middle">{vehicle.registration}</td>
                <td className="px-4 py-3 text-center align-middle">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${vehicle.status === "AVAILABLE" ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}
                  >
                    {vehicle.status === "AVAILABLE" ? "Available" : "Inactive"}
                  </span>
                </td>
                <td className="px-2 py-2 align-middle">
                  <VehicleActions
                    id={vehicle.id}
                    name={`${vehicle.brand} ${vehicle.model}`}
                    registration={vehicle.registration}
                    active={vehicle.status === "AVAILABLE" && vehicle.isActive}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && <p className="p-8 text-[var(--muted)]">No vehicles found.</p>}
      </div>
      {(total[0]?.count ?? 0) > 15 && (
        <nav aria-label="Vehicle pages" className="mt-4 flex items-center justify-end gap-2">
          {currentPage > 1 && (
            <Link
              href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== "all" ? { filter } : {}), page: String(currentPage - 1) })}`}
              className="min-h-10 rounded-lg border border-[var(--edge)] px-3 py-2"
            >
              Previous
            </Link>
          )}
          <span className="px-2 text-sm text-[var(--muted)]">Page {currentPage}</span>
          {currentPage * 15 < (total[0]?.count ?? 0) && (
            <Link
              href={`?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter !== "all" ? { filter } : {}), page: String(currentPage + 1) })}`}
              className="min-h-10 rounded-lg border border-[var(--edge)] px-3 py-2"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
