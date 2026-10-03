import { and, asc, eq, gte, ilike, inArray, lt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { OperationsBoard, type OperationsRow } from "@/components/operations-board";
import { OperationsLinks, operationViews } from "@/components/operations-links";
import { db } from "@/db/client";
import {
  branches,
  customers,
  rentals,
  users,
  vehicleBrands,
  vehicleModels,
  vehicles,
} from "@/db/schema";
import { availableFleet } from "@/features/rentals/availability";
import { omanDayBounds } from "@/features/rentals/operations-time";
import { requirePermission } from "@/lib/auth";
export default async function OperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; view: string }>;
  searchParams: Promise<{
    registration?: string;
    branch?: string;
    user?: string;
    brand?: string;
    model?: string;
  }>;
}) {
  const { locale, view } = await params;
  if (!Object.hasOwn(operationViews, view)) notFound();
  const title = operationViews[view as keyof typeof operationViews];
  const actor = await requirePermission(view === "available" ? "fleet" : "rentals", "read");
  const filters = await searchParams;
  const now = new Date();
  const { start, end } = omanDayBounds(now);
  const shared = [
    filters.registration
      ? ilike(vehicles.registrationNumber, `%${filters.registration}%`)
      : undefined,
    filters.branch ? ilike(branches.name, `%${filters.branch}%`) : undefined,
    filters.brand ? ilike(vehicleBrands.name, `%${filters.brand}%`) : undefined,
    filters.model ? ilike(vehicleModels.name, `%${filters.model}%`) : undefined,
  ];
  let rows: OperationsRow[];
  if (view === "available") {
    rows = await db
      .select({
        id: vehicles.id,
        vehicle: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        branch: branches.name,
        brand: vehicleBrands.name,
        model: vehicleModels.name,
      })
      .from(vehicles)
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
      .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .where(
        and(
          availableFleet,
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
          ...shared,
        ),
      )
      .orderBy(asc(vehicles.vehicleNumber));
  } else {
    const records = await db
      .select({
        id: rentals.id,
        vehicle: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        customer: customers.name,
        mobile: customers.mobile,
        startsAt: rentals.startsAt,
        expectedReturnAt: rentals.expectedReturnAt,
        branch: branches.name,
        user: users.displayName,
        status: rentals.status,
      })
      .from(rentals)
      .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
      .innerJoin(customers, eq(customers.id, rentals.customerId))
      .innerJoin(branches, eq(branches.id, rentals.branchId))
      .innerJoin(users, eq(users.id, rentals.createdBy))
      .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
      .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .where(
        and(
          actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds),
          ...shared,
          filters.user ? ilike(users.displayName, `%${filters.user}%`) : undefined,
          eq(rentals.status, view === "today-reserve" ? "RESERVED" : "ACTIVE"),
          view === "today-reserve"
            ? and(gte(rentals.startsAt, start), lt(rentals.startsAt, end))
            : undefined,
          view === "today-arrival"
            ? and(gte(rentals.expectedReturnAt, start), lt(rentals.expectedReturnAt, end))
            : undefined,
        ),
      )
      .orderBy(asc(view === "today-reserve" ? rentals.startsAt : rentals.expectedReturnAt));
    rows = records.map((record) => ({
      ...record,
      startsAt: record.startsAt.toISOString(),
      expectedReturnAt: record.expectedReturnAt.toISOString(),
    }));
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <OperationsLinks locale={locale} />
      <p className="text-sm text-[var(--muted)]">
        Times use Oman time (Asia/Muscat). Availability refreshes every minute.
      </p>
      <OperationsBoard view={view} rows={rows} initialNow={now.toISOString()} />
    </div>
  );
}
