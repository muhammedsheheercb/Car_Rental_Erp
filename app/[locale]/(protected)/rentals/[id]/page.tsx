import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { RentalLatePreview } from "@/components/rental-late-preview";
import { RentalLifecycleForms } from "@/components/rental-lifecycle-forms";
import { db } from "@/db/client";
import {
  branches,
  customers,
  rentalCancellations,
  rentalCharges,
  rentalExtensions,
  rentals,
  users,
  vehicleDamageEvidence,
  vehicleModels,
  vehicles,
} from "@/db/schema";
import { formatOMR } from "@/features/rentals/calculations";
import { cancellationPolicy } from "@/features/rentals/late-charges";
import { can, requirePermission } from "@/lib/auth";

const date = (value: Date) =>
  value.toLocaleString("en-GB", {
    timeZone: "Asia/Muscat",
    dateStyle: "medium",
    timeStyle: "short",
  });
export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("rentals", "read");
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [record] = await db
    .select({
      rental: rentals,
      vehicle: vehicles,
      customer: customers,
      model: vehicleModels.name,
      branch: branches.name,
    })
    .from(rentals)
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .innerJoin(branches, eq(branches.id, rentals.branchId))
    .where(
      and(
        eq(rentals.id, id),
        actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds),
      ),
    )
    .limit(1);
  if (!record) notFound();
  const [extensions, cancellations, evidence, charges] = await Promise.all([
    db
      .select({ history: rentalExtensions, user: users.displayName })
      .from(rentalExtensions)
      .innerJoin(users, eq(users.id, rentalExtensions.approvedBy))
      .where(eq(rentalExtensions.rentalId, id))
      .orderBy(asc(rentalExtensions.approvedAt)),
    db
      .select({ history: rentalCancellations, user: users.displayName })
      .from(rentalCancellations)
      .innerJoin(users, eq(users.id, rentalCancellations.cancelledBy))
      .where(eq(rentalCancellations.rentalId, id)),
    db
      .select({ image: vehicleDamageEvidence, user: users.displayName })
      .from(vehicleDamageEvidence)
      .innerJoin(users, eq(users.id, vehicleDamageEvidence.recordedBy))
      .where(eq(vehicleDamageEvidence.rentalId, id))
      .orderBy(asc(vehicleDamageEvidence.recordedAt)),
    db
      .select()
      .from(rentalCharges)
      .where(eq(rentalCharges.rentalId, id))
      .orderBy(asc(rentalCharges.createdAt)),
  ]);
  const { rental, customer, vehicle } = record;
  const now = new Date();
  const canUpdate = can(actor, "rentals", "update", rental.branchId);
  const canApprove = can(actor, "rentals", "approve", rental.branchId);
  const canCancel = cancellationPolicy({
    createdAt: rental.createdAt,
    now,
    windowMinutes: rental.cancellationWindowMinutes,
    authorizedAdmin: (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") && canApprove,
  }).allowed;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Agreement {rental.agreementNumber}</h1>
      <p className="text-sm text-[var(--muted)]">
        {rental.status} · {record.branch} · All dates and times are Oman time.
      </p>
      <dl className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries({
          "Booking Number": rental.agreementNumber,
          "Out Date/Time": date(rental.startsAt),
          "Vehicle Name": vehicle.vehicleNumber,
          Model: record.model,
          "Registration Number": vehicle.registrationNumber,
          "Customer Name": customer.name,
          Mobile: customer.mobile,
          Address: customer.address,
          "Expected Return": date(rental.expectedReturnAt),
          "Starting KM": rental.pickupOdometerKm ?? vehicle.currentOdometerKm,
          "Ending KM": rental.returnOdometerKm ?? "—",
          "Recorded total": formatOMR(rental.totalBaisa),
        }).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {rental.status === "ACTIVE" && (
        <RentalLatePreview
          expectedReturnAt={rental.expectedReturnAt.toISOString()}
          initialNow={now.toISOString()}
          policy={{
            hourlyRateBaisa: rental.lateFeeBaisa,
            additionalDayRentBaisa: rental.additionalDayRentBaisa,
            overdueFinePerDayBaisa: rental.overdueFineBaisa,
            graceMinutes: rental.lateGraceMinutes,
            hourlyWindowHours: rental.lateWindowHours,
          }}
        />
      )}
      <RentalLifecycleForms
        cancellationDetails={{
          "Booking Number": rental.agreementNumber,
          "Out Date": rental.startsAt.toLocaleDateString("en-GB", { timeZone: "Asia/Muscat" }),
          "Out Time": rental.startsAt.toLocaleTimeString("en-GB", {
            timeZone: "Asia/Muscat",
            hour: "2-digit",
            minute: "2-digit",
          }),
          "Vehicle Name": vehicle.vehicleNumber,
          Model: record.model,
          "Registration Number": vehicle.registrationNumber,
          "Customer Name": customer.name,
          Mobile: customer.mobile,
          Address: customer.address,
        }}
        id={id}
        status={rental.status}
        period={rental.pricingPeriod}
        rate={rental.dailyRateBaisa}
        expectedReturnAt={rental.expectedReturnAt.toISOString()}
        startingKm={rental.pickupOdometerKm ?? vehicle.currentOdometerKm}
        canUpdate={canUpdate}
        canApprove={canApprove}
        canCancel={canCancel}
        initialNow={now.toISOString()}
      />
      <section className="rounded-xl border border-[var(--edge)] p-4">
        <h2 className="text-lg font-semibold">Extension history</h2>
        {!extensions.length && (
          <p className="mt-3 text-sm text-[var(--muted)]">No approved extensions.</p>
        )}
        {extensions.map(({ history, user }) => (
          <div key={history.id} className="mt-3 border-t border-[var(--edge)] pt-3 text-sm">
            <p>
              {date(history.previousExpectedReturnAt)} → {date(history.newExpectedReturnAt)}
            </p>
            <p>
              {history.duration} {history.period.toLowerCase()} periods ·{" "}
              {formatOMR(history.additionalRentBaisa)} · {user} · Approved{" "}
              {date(history.approvedAt)}
            </p>
            <p className="break-words">{history.remarks}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-[var(--edge)] p-4">
        <h2 className="text-lg font-semibold">Cancellation history</h2>
        {!cancellations.length && (
          <p className="mt-3 text-sm text-[var(--muted)]">No cancellations.</p>
        )}
        {cancellations.map(({ history, user }) => (
          <div key={history.id} className="mt-3 text-sm">
            <p>
              {date(history.cancelledAt)} · {user} ·{" "}
              {history.overridden ? "Admin override" : "Within cancellation window"} · Previous
              status {history.previousStatus}
            </p>
            <p>
              {history.startingKm} → {history.endingKm} KM
            </p>
            <p className="break-words">{history.remarks}</p>
            <p>
              Financial records are retained. Refunds and adjustments require separate transactions.
            </p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-[var(--edge)] p-4">
        <h2 className="text-lg font-semibold">Financial components</h2>
        {charges.map((charge) => (
          <p key={charge.id} className="mt-2 break-words text-sm">
            {charge.component.replaceAll("_", " ")} · {charge.description} ·{" "}
            {formatOMR(charge.amountBaisa)}
          </p>
        ))}
      </section>
      {(["BEFORE_RENTAL", "AFTER_RETURN"] as const).map((phase) => (
        <section key={phase} className="rounded-xl border border-[var(--edge)] p-4">
          <h2 className="text-lg font-semibold">
            {phase === "BEFORE_RENTAL" ? "Before-rental" : "After-return"} scratch / damage evidence
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {evidence
              .filter(({ image }) => image.phase === phase)
              .map(({ image, user }) => (
                <article key={image.id} className="min-w-0">
                  <a href={`/api/damage-evidence/${image.id}`} target="_blank" rel="noreferrer">
                    {/* biome-ignore lint/performance/noImgElement: protected damage photos require authenticated requests. */}
                    <img
                      src={`/api/damage-evidence/${image.id}`}
                      alt={`${image.location}: ${image.description}`}
                      className="h-40 w-full rounded-lg object-contain"
                    />
                  </a>
                  <p className="mt-2 font-medium">{image.location}</p>
                  <p className="break-words text-sm">{image.description}</p>
                  <p className="break-words text-sm">{image.remarks}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {date(image.recordedAt)} · {user}
                  </p>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
