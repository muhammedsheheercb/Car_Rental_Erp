import { and, count, desc, eq, ilike, inArray, lt, not, or, sql } from "drizzle-orm";
import Link from "next/link";
import { FleetControls } from "@/components/fleet-controls";
import { VehicleActions } from "@/components/vehicle-actions";
import { db } from "@/db/client";
import {
  branches,
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehicleRegistrations,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import {
  availableFleet,
  operationalBlocking,
  vehicleCommitmentStatus,
} from "@/features/rentals/availability";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { requirePermission } from "@/lib/auth";
export default async function FleetPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{
    q?: string;
    branch?: string;
    brand?: string;
    model?: string;
    registration?: string;
    page?: string;
    filter?: string;
  }>;
  params: Promise<{ locale: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const [{ q = "", branch, brand, model, registration, page = "1", filter = "all" }, { locale }] =
    await Promise.all([searchParams, params]);
  const currentPage = Math.max(1, Number(page) || 1);
  const today = formatOmanDateTime(new Date()).slice(0, 10);
  const filterWhere =
    filter === "available"
      ? availableFleet
      : filter === "unavailable"
        ? not(availableFleet)
        : filter === "mulkiya_expired"
          ? lt(vehicleRegistrations.mulkiyaExpiryDate, today)
          : filter === "insurance_expired"
            ? lt(vehicleInsurance.validUntil, today)
            : undefined;
  const where = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
    branch && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(branch)
      ? eq(vehicles.branchId, branch)
      : undefined,
    registration ? ilike(vehicles.registrationNumber, `%${registration}%`) : undefined,
    brand ? ilike(vehicleBrands.name, `%${brand}%`) : undefined,
    model ? ilike(vehicleModels.name, `%${model}%`) : undefined,
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
        branch: branches.name,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
        odometer: vehicles.currentOdometerKm,
        mulkiyaExpiry: vehicleRegistrations.mulkiyaExpiryDate,
        insuranceExpiry: vehicleInsurance.validUntil,
        nextServiceKm: sql<number>`${vehicleServiceSettings.lastEngineServiceKm} + ${vehicleServiceSettings.engineServiceIntervalKm}`,
        rentalStatus: vehicleCommitmentStatus,
        operationallyBlocked: operationalBlocking,
      })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .innerJoin(branches, eq(vehicles.branchId, branches.id))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .leftJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .where(where)
      .orderBy(desc(vehicles.createdAt))
      .limit(15)
      .offset((currentPage - 1) * 15),
    db
      .select({ count: count() })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicles.brandId, vehicleBrands.id))
      .innerJoin(vehicleModels, eq(vehicles.modelId, vehicleModels.id))
      .innerJoin(branches, eq(vehicles.branchId, branches.id))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .leftJoin(vehicleServiceSettings, eq(vehicleServiceSettings.vehicleId, vehicles.id))
      .where(where),
  ]);
  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-[var(--accent)]">FLEET</p>
          <h1 className="mt-2 text-3xl font-semibold">Vehicles</h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link href={`/${locale}/service` as never}>Service</Link>
            <Link href={`/${locale}/near-to-service` as never}>Near To Service</Link>
            <Link href={`/${locale}/expiry` as never}>Expiry</Link>
          </div>
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
        <table className="w-full min-w-[76rem] table-fixed text-start text-sm">
          <colgroup>
            <col className="w-[4rem]" />
            <col className="w-[12rem]" />
            <col className="w-[11rem]" />
            <col className="w-[13rem]" />
            <col className="w-[10rem]" />
            <col className="w-[8rem]" />
            <col className="w-[8rem]" />
            <col className="w-[9rem]" />
            <col className="w-[9rem]" />
            <col className="w-[10rem]" />
            <col className="w-[15rem]" />
          </colgroup>
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
              >
                SI No.
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
              >
                Branch / vehicle
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
              >
                Registration
              </th>
              <th
                scope="col"
                className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide"
              >
                Brand / model
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-end text-xs font-medium uppercase tracking-wide"
              >
                KM
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wide">
                Mulkiya
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wide">
                Insurance
              </th>
              <th scope="col" className="px-4 py-3 text-xs font-medium uppercase tracking-wide">
                Service KM
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
            {records.map((vehicle, index) => {
              const operationalStatus =
                vehicle.rentalStatus === "ACTIVE"
                  ? "ON RENT"
                  : vehicle.rentalStatus === "RESERVED"
                    ? "RESERVED"
                    : vehicle.status === "AVAILABLE" &&
                        vehicle.isActive &&
                        !vehicle.operationallyBlocked
                      ? "AVAILABLE"
                      : vehicle.operationallyBlocked
                        ? "SERVICE / TRANSFER"
                        : "INACTIVE";
              const serviceState =
                vehicle.nextServiceKm <= vehicle.odometer
                  ? "OVERDUE"
                  : vehicle.nextServiceKm - vehicle.odometer <= 500
                    ? "NEAR"
                    : "NORMAL";
              return (
                <tr
                  key={vehicle.id}
                  className={`border-t border-[var(--edge)] align-middle transition-colors hover:bg-white/5 focus-within:bg-white/10 ${operationalStatus === "ON RENT" ? "bg-red-400/10" : operationalStatus === "AVAILABLE" ? "bg-emerald-400/5" : "bg-amber-400/5"}`}
                >
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {(currentPage - 1) * 15 + index + 1}
                  </td>
                  <td className="px-4 py-3 font-medium align-middle">
                    <p>{vehicle.branch}</p>
                    <p className="font-mono text-xs text-[var(--muted)]">{vehicle.number}</p>
                  </td>
                  <td className="break-words px-4 py-3 align-middle">{vehicle.registration}</td>
                  <td className="px-4 py-3 font-medium align-middle">
                    <span className="block break-words">
                      {vehicle.brand} {vehicle.model}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center align-middle">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${operationalStatus === "ON RENT" ? "bg-red-400/20 text-red-100" : operationalStatus === "AVAILABLE" ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-100"}`}
                    >
                      {operationalStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-mono">
                    {vehicle.odometer.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">{vehicle.mulkiyaExpiry ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{vehicle.insuranceExpiry ?? "—"}</td>
                  <td
                    className={`px-4 py-3 text-xs ${serviceState === "OVERDUE" ? "text-red-200" : serviceState === "NEAR" ? "text-amber-100" : "text-[var(--muted)]"}`}
                  >
                    {vehicle.nextServiceKm
                      ? `${vehicle.nextServiceKm.toLocaleString()} · ${serviceState}`
                      : "—"}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <VehicleActions
                      id={vehicle.id}
                      name={`${vehicle.brand} ${vehicle.model}`}
                      registration={vehicle.registration}
                      active={vehicle.isActive}
                    />
                  </td>
                </tr>
              );
            })}
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
