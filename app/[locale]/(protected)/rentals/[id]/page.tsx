import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import { totals } from "@/features/finance/service";
import { formatOMR } from "@/features/rentals/calculations";
import { cancellationPolicy } from "@/features/rentals/late-charges";
import { can, requirePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

const date = (value: Date) =>
  value.toLocaleString("en-GB", {
    timeZone: "Asia/Muscat",
    dateStyle: "medium",
    timeStyle: "short",
  });
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const actor = await requirePermission("rentals", "read");
  const [{ id, locale }, tRentals, tCust, tCommon, tStatus, tOps, tFinance] = await Promise.all([
    params,
    getTranslations("rentals"),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("operations"),
    getTranslations("finance"),
  ]);
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
  const financial = await totals(db, id);
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
      <h1 className="text-3xl font-semibold">
        {tRentals("agreementTitle", { number: rental.agreementNumber })}
      </h1>
      <div className="flex flex-wrap gap-3">
        {can(actor, "rentals", "print", rental.branchId) && (
          <Link className="btn" href={`/${locale}/documents/agreement/${id}` as never}>
            {tRentals("printAgreementA4")}
          </Link>
        )}
        {rental.status === "ACTIVE" && canUpdate && (
          <Link className="btn" href={`/${locale}/transfers?booking=${id}` as never}>
            {tRentals("transferVehicle")}
          </Link>
        )}
        {can(actor, "finance", "read", rental.branchId) && (
          <Link className="btn" href={`/${locale}/invoices?booking=${id}` as never}>
            {tRentals("invoice")}
          </Link>
        )}
        {can(actor, "customers", "read") && can(actor, "finance", "read", rental.branchId) && (
          <Link className="btn" href={`/${locale}/ledger?customerId=${rental.customerId}` as never}>
            {tCust("customerLedger")}
          </Link>
        )}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {translateStatus(tStatus, rental.status)} · {record.branch} · {tCommon("omanTimeFull")}
      </p>
      <dl className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          [tFinance("bookingNumber"), rental.agreementNumber],
          [tOps("outDateTime"), date(rental.startsAt)],
          [tCommon("vehicle"), vehicle.vehicleNumber],
          [tOps("model"), record.model],
          [tCommon("registration"), vehicle.registrationNumber],
          [tCommon("customer"), customer.name],
          [tOps("mobile"), customer.mobile],
          [tCust("address"), customer.address],
          [tOps("expectedReturn"), date(rental.expectedReturnAt)],
          [tRentals("startingKm"), rental.pickupOdometerKm ?? vehicle.currentOdometerKm],
          [tRentals("endingKm"), rental.returnOdometerKm ?? "—"],
          [tCommon("total"), formatOMR(rental.totalBaisa)],
        ].map(([label, value]) => (
          <div key={String(label)} className="min-w-0">
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
          [tFinance("bookingNumber")]: rental.agreementNumber,
          [tOps("outDateTime")]: date(rental.startsAt),
          [tCommon("vehicle")]: vehicle.vehicleNumber,
          [tOps("model")]: record.model,
          [tCommon("registration")]: vehicle.registrationNumber,
          [tCommon("customer")]: customer.name,
          [tOps("mobile")]: customer.mobile,
          [tCust("address")]: customer.address,
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
        <h2 className="text-lg font-semibold">{tRentals("extensionHistory")}</h2>
        {!extensions.length && (
          <p className="mt-3 text-sm text-[var(--muted)]">{tRentals("noExtensions")}</p>
        )}
        {extensions.map(({ history, user }) => (
          <div key={history.id} className="mt-3 border-t border-[var(--edge)] pt-3 text-sm">
            <p>
              {date(history.previousExpectedReturnAt)} → {date(history.newExpectedReturnAt)}
            </p>
            <p>
              {history.duration} {translateStatus(tStatus, history.period)} ·{" "}
              {formatOMR(history.additionalRentBaisa)} · {user} · {date(history.approvedAt)}
            </p>
            <p className="break-words">{history.remarks}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-[var(--edge)] p-4">
        <h2 className="text-lg font-semibold">{tRentals("cancellationHistory")}</h2>
        {!cancellations.length && (
          <p className="mt-3 text-sm text-[var(--muted)]">{tRentals("noCancellations")}</p>
        )}
        {cancellations.map(({ history, user }) => (
          <div key={history.id} className="mt-3 text-sm">
            <p>
              {date(history.cancelledAt)} · {user} ·{" "}
              {translateStatus(tStatus, history.previousStatus)}
            </p>
            <p>
              {history.startingKm} → {history.endingKm} {tCommon("km")}
            </p>
            <p className="break-words">{history.remarks}</p>
            <p>{tRentals("cancelAllowedNote")}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border border-[var(--edge)] p-4">
        <h2 className="text-lg font-semibold">{tRentals("financialComponents")}</h2>
        <p className="mt-3 text-xl font-semibold">
          {tRentals("invoiceBalance")}: {formatOMR(financial.balance)}
        </p>
        <p>
          {tFinance("amountDueBack")}: {formatOMR(financial.approvedBaisa)} ·{" "}
          {tFinance("alreadyReturned")}: {formatOMR(financial.returnedBaisa)} ·{" "}
          {tFinance("remaining")}: {formatOMR(financial.remainingBaisa)}
        </p>
        {charges.map((charge) => (
          <p key={charge.id} className="mt-2 break-words text-sm">
            {translateStatus(tStatus, charge.component)} · {charge.description} ·{" "}
            {formatOMR(charge.amountBaisa)}
          </p>
        ))}
      </section>
      {(["BEFORE_RENTAL", "AFTER_RETURN"] as const).map((phase) => (
        <section
          key={phase}
          id={phase === "BEFORE_RENTAL" && rental.status === "ACTIVE" ? "damage" : undefined}
          className="rounded-xl border border-[var(--edge)] p-4"
        >
          <h2 className="text-lg font-semibold">
            {phase === "BEFORE_RENTAL"
              ? tRentals("beforeRentalEvidence")
              : tRentals("afterReturnEvidence")}
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
