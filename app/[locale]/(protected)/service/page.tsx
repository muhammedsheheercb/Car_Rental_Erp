import { and, desc, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { ServiceForm, ServiceStatusForm } from "@/components/service-form";
import { db } from "@/db/client";
import {
  branches,
  customers,
  rentals,
  serviceHistory,
  userBranches,
  users,
  vehicleBrands,
  vehicleServices,
  vehicles,
} from "@/db/schema";
import { omrInput } from "@/features/invoices/calculations";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePermission } from "@/lib/auth";
export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const { locale } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const [fleet, staff, bookings, records] = await Promise.all([
    db
      .select({ v: vehicles, brand: vehicleBrands.name, branch: branches.name })
      .from(vehicles)
      .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
        ),
      ),
    db
      .select({ id: users.id, name: users.displayName, branchId: userBranches.branchId })
      .from(users)
      .leftJoin(userBranches, eq(userBranches.userId, users.id))
      .where(
        and(
          eq(users.isActive, true),
          actor.role === "SUPER_ADMIN"
            ? undefined
            : or(eq(users.id, actor.id), inArray(userBranches.branchId, actor.branchIds)),
        ),
      ),
    db
      .select({ r: rentals, customer: customers.name })
      .from(rentals)
      .innerJoin(customers, eq(customers.id, rentals.customerId))
      .where(
        and(
          inArray(rentals.status, ["ACTIVE", "RETURNED"]),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds),
        ),
      ),
    db
      .select({ s: vehicleServices, v: vehicles, branch: branches.name, staff: users.displayName })
      .from(vehicleServices)
      .innerJoin(vehicles, eq(vehicles.id, vehicleServices.vehicleId))
      .innerJoin(branches, eq(branches.id, vehicleServices.branchId))
      .leftJoin(users, eq(users.id, vehicleServices.staffId))
      .where(
        actor.role === "SUPER_ADMIN"
          ? undefined
          : inArray(vehicleServices.branchId, actor.branchIds),
      )
      .orderBy(desc(vehicleServices.createdAt)),
  ]);
  const filtered = records.filter(({ s, v }) =>
    `${v.vehicleNumber} ${v.registrationNumber} ${s.type} ${s.status} ${String(s.snapshot.customer ?? "")}`
      .toLowerCase()
      .includes((query.q ?? "").toLowerCase()),
  );
  const shown = filtered.slice((page - 1) * 20, page * 20);
  const history = shown.length
    ? await db
        .select()
        .from(serviceHistory)
        .where(
          inArray(
            serviceHistory.serviceId,
            shown.map((r) => r.s.id),
          ),
        )
        .orderBy(desc(serviceHistory.createdAt))
    : [];
  const now = formatOmanDateTime(new Date());
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Service</h1>
      <div className="flex flex-wrap gap-4">
        <Link href={`/${locale}/near-to-service` as never}>Near To Service</Link>
        <Link href={`/${locale}/expiry` as never}>Expiry</Link>
      </div>
      {can(actor, "fleet", "create") && (
        <ServiceForm
          actorId={actor.id}
          now={now}
          vehicles={fleet
            .filter(({ v }) => can(actor, "fleet", "create", v.branchId))
            .map(({ v, brand, branch }) => ({
              id: v.id,
              name: v.vehicleNumber,
              registration: v.registrationNumber,
              brand,
              branch,
              km: v.currentOdometerKm,
              staff: [
                ...new Map(
                  staff
                    .filter((s) => s.id === actor.id || s.branchId === v.branchId)
                    .map((s) => [s.id, { id: s.id, name: s.name }]),
                ).values(),
              ],
              bookings: bookings
                .filter(({ r }) => r.vehicleId === v.id)
                .map(({ r, customer }) => ({
                  id: r.id,
                  name: `${r.agreementNumber} · ${customer}`,
                  customer,
                  out: formatOmanDateTime(r.startsAt),
                })),
            }))}
        />
      )}
      <form className="flex gap-3">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Vehicle / Registration / Customer / Service"
          aria-label="Search service"
          className="input"
        />
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      <section className="grid gap-4">
        {shown.map(({ s, v, branch, staff }) => (
          <article key={s.id} className="rounded-xl border border-[var(--edge)] p-4">
            <h2 className="text-lg font-semibold">
              {v.vehicleNumber} · {v.registrationNumber} · {s.type.replaceAll("_", " ")}
            </h2>
            <p>
              {s.serviceBy} · {s.status} · {branch} · Staff: {staff ?? "—"}
            </p>
            <p>
              Out (Oman): {s.outAt ? formatOmanDateTime(s.outAt) : "—"} · Completed:{" "}
              {s.completedAt ? formatOmanDateTime(s.completedAt) : "—"}
            </p>
            <p>
              KM: {s.kmReading ?? "—"} → {s.serviceOdometerKm ?? "—"} · Due: {s.dueDate ?? "—"} /{" "}
              {s.dueOdometerKm ?? "—"} KM
            </p>
            <p>
              Customer: {String(s.snapshot.customer ?? "—")} · Booking:{" "}
              {String(s.snapshot.booking ?? "—")}
            </p>
            <p>
              Expense: OMR {omrInput(s.costBaisa)} · {s.paymentMode ?? "—"}
            </p>
            <p>{s.note}</p>
            {!["COMPLETED", "CANCELLED"].includes(s.status) &&
              can(actor, "fleet", "update", s.branchId ?? v.branchId) && (
                <ServiceStatusForm
                  serviceId={s.id}
                  currentKm={v.currentOdometerKm}
                  status={s.status}
                  now={now}
                />
              )}
            <details className="mt-3">
              <summary>Service History</summary>
              {history
                .filter((h) => h.serviceId === s.id)
                .map((h) => (
                  <p key={h.id}>
                    {formatOmanDateTime(h.createdAt)} Oman · {h.action} ·{" "}
                    {String(h.snapshot.remarks ?? "")}
                  </p>
                ))}
            </details>
          </article>
        ))}
        {!shown.length && <p>No service records found.</p>}
      </section>
      <div className="flex gap-4">
        {page > 1 && (
          <Link
            href={
              `/${locale}/service?page=${page - 1}&q=${encodeURIComponent(query.q ?? "")}` as never
            }
          >
            Previous
          </Link>
        )}
        <span>
          Page {page} · {filtered.length} records
        </span>
        {page * 20 < filtered.length && (
          <Link
            href={
              `/${locale}/service?page=${page + 1}&q=${encodeURIComponent(query.q ?? "")}` as never
            }
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
