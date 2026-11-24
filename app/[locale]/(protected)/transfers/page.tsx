import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TransferForm } from "@/components/transfer-form";
import { db } from "@/db/client";
import {
  invoices,
  rentalCharges,
  rentalVehicleSwaps,
  vehicleBrands,
  vehiclePricing,
} from "@/db/schema";
import { bookingRows } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { omrInput } from "@/features/invoices/calculations";
import { invoicePayments } from "@/features/invoices/service";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { transferCandidates } from "@/features/transfers/service";
import { can, requirePermission } from "@/lib/auth";
import { translateFieldLabel, translateStatus } from "@/lib/i18n-helpers";
export default async function TransfersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ booking?: string; q?: string }>;
}) {
  const [actor, { locale }, query, tTransfers, tCommon, tStatus, tRentals, tFields] =
    await Promise.all([
      requirePermission("rentals", "read"),
      params,
      searchParams,
      getTranslations("transfers"),
      getTranslations("common"),
      getTranslations("status"),
      getTranslations("rentals"),
      getTranslations("fieldLabels"),
    ]);
  const rows = await bookingRows(actor);
  const selected = rows.find((row) => row.rental.id === query.booking);
  const filtered = rows.filter(
    (row) =>
      row.rental.status === "ACTIVE" &&
      `${row.rental.agreementNumber} ${row.customer.name} ${row.vehicle.registrationNumber}`
        .toLowerCase()
        .includes((query.q ?? "").toLowerCase()),
  );
  if (!selected)
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">{tTransfers("title")}</h1>
        <form className="flex gap-2">
          <input
            name="q"
            aria-label={tTransfers("searchPlaceholder")}
            className="input"
            defaultValue={query.q}
            placeholder={tTransfers("searchPlaceholder")}
          />
          <button type="submit" className="btn">
            {tCommon("search")}
          </button>
        </form>
        <div className="grid gap-3">
          {filtered.map((row) => (
            <Link
              key={row.rental.id}
              className="rounded-xl border border-[var(--edge)] p-4"
              href={`/${locale}/transfers?booking=${row.rental.id}` as never}
            >
              {row.rental.agreementNumber} · {row.customer.name} · {row.vehicle.registrationNumber}
            </Link>
          ))}
          {!filtered.length && <p>{tTransfers("noActiveRentals")}</p>}
        </div>
      </div>
    );
  const { rental: r, customer: c, vehicle: v } = selected;
  const [options, financial, paid, history, charges, brand, pricing, invoiceRows] =
    await Promise.all([
      transferCandidates(r, actor),
      totals(db, r.id),
      invoicePayments(db, r.id),
      db
        .select()
        .from(rentalVehicleSwaps)
        .where(eq(rentalVehicleSwaps.rentalId, r.id))
        .orderBy(asc(rentalVehicleSwaps.transferredAt)),
      db.select().from(rentalCharges).where(eq(rentalCharges.rentalId, r.id)),
      db.select().from(vehicleBrands).where(eq(vehicleBrands.id, v.brandId)),
      db.select().from(vehiclePricing).where(eq(vehiclePricing.vehicleId, v.id)),
      db.select().from(invoices).where(eq(invoices.rentalId, r.id)),
    ]);
  const original = history[0]?.snapshot.booking as typeof r | undefined;
  const sum = (component: string) =>
    charges.filter((ch) => ch.component === component).reduce((n, ch) => n + ch.amountBaisa, 0);
  const now = new Date();
  const remainingDays = Math.max(
    0,
    Math.ceil((r.expectedReturnAt.getTime() - now.getTime()) / 86400000),
  );
  const fields: Record<string, string | number | null> = {
    "Bill / Booking Number": r.agreementNumber,
    "Customer Name": c.name,
    Phone: c.mobile,
    Address: c.address,
    "Civil Number": c.civilIdNumber,
    "Civil Expiry": c.civilIdExpiry,
    "Passport Number": c.passportNumber,
    "Passport Expiry": c.passportExpiry,
    "Licence Number": c.drivingLicenceNumber,
    "Licence Expiry": c.drivingLicenceExpiry,
    "Visa Number": c.visaNumber,
    "Visa Expiry": c.visaExpiry,
    Vehicle: v.vehicleNumber,
    Brand: brand[0]?.name ?? null,
    "Registration Number": v.registrationNumber,
    "Booking Date / Time (Oman)": formatOmanDateTime(r.startsAt),
    "Rental Type": translateStatus(tStatus, r.pricingPeriod),
    "Hire Duration": r.rentDuration,
    "Number of Days": Math.ceil((r.expectedReturnAt.getTime() - r.startsAt.getTime()) / 86400000),
    "Remaining Days": remainingDays,
    "Rent Amount (OMR)": omrInput(r.dailyRateBaisa),
    "Minimum Charge (OMR)": omrInput(
      pricing.find((p) => p.period === r.pricingPeriod)?.minimumRentBaisa ?? 0,
    ),
    "Original KM Maximum": original?.includedKm ?? r.includedKm,
    "Original Free KM": original?.freeKm ?? r.freeKm,
    "Excess KM Charge / KM (OMR)": omrInput(r.excessKmChargeBaisa),
    "Starting KM": r.pickupOdometerKm,
    "Current KM Maximum": r.includedKm,
    "Current Free KM": r.freeKm,
    "Open KM": r.openKm ? tCommon("yes") : tCommon("no"),
    "Extra KM Charge (OMR)": omrInput(sum("EXCESS_KM")),
    "Damage (OMR)": omrInput(sum("DAMAGE")),
    "Washing (OMR)": omrInput(sum("WASHING")),
    "Petrol (OMR)": omrInput(sum("PETROL")),
    "Fine (OMR)": omrInput(sum("FINE") + sum("OVERDUE_FINE")),
    "Grand Total (OMR)": omrInput(r.totalBaisa),
    "Advance (OMR)": omrInput(paid.advance),
    "Paid By Customer (OMR)": omrInput(paid.received),
    "Balance / Transfer Balance (OMR)": omrInput(financial.balance),
    "Remaining Payback (OMR)": omrInput(financial.remainingBaisa),
    Branch: selected.branch,
    User: actor.displayName,
    "Expected Return (Oman)": formatOmanDateTime(r.expectedReturnAt),
  };
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">
        {tTransfers("title")} · {r.agreementNumber}
      </h1>
      <p>{tTransfers("preserveNote")}</p>
      <dl className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(fields).map(([k, value]) => (
          <div key={k}>
            <dt className="text-sm text-[var(--muted)]">{translateFieldLabel(tFields, k)}</dt>
            <dd>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {r.status === "ACTIVE" && can(actor, "rentals", "update", r.branchId) && (
        <TransferForm
          rental={{
            id: r.id,
            startingKm: r.pickupOdometerKm ?? v.currentOdometerKm,
            maximumKm: r.includedKm,
            freeKm: r.freeKm,
            rate: r.excessKmChargeBaisa,
            openKm: r.openKm,
            balance: financial.balance,
          }}
          transferredAt={formatOmanDateTime(now)}
          options={options.map((o) => ({
            id: o.vehicle.id,
            name: `${o.vehicle.vehicleNumber} · ${o.brand} · ${o.vehicle.registrationNumber}`,
            startingKm: o.vehicle.currentOdometerKm,
            details: {
              Vehicle: o.vehicle.vehicleNumber,
              Brand: o.brand,
              "Registration Number": o.vehicle.registrationNumber,
              "Engine Service Next KM": o.service
                ? o.service.lastEngineServiceKm + o.service.engineServiceIntervalKm
                : null,
              "Gear Oil Next KM": o.service
                ? o.service.lastGearOilChangeKm + o.service.gearOilIntervalKm
                : null,
              "Remaining Days": remainingDays,
              "Rental Type": translateStatus(tStatus, r.pricingPeriod),
              "Configured Rent (OMR)": omrInput(o.pricing.listRentBaisa),
              "Contract Rent (OMR)": omrInput(r.dailyRateBaisa),
              "Configured KM Maximum": o.pricing.includedKm,
              "Configured Excess KM Charge (OMR)": omrInput(o.pricing.excessKmChargeBaisa),
              "Starting KM": o.vehicle.currentOdometerKm,
              "Expected Return (Oman)": formatOmanDateTime(r.expectedReturnAt),
            },
          }))}
        />
      )}
      <Link className="btn inline-block" href={`/${locale}/invoices?booking=${r.id}` as never}>
        {tRentals("invoice")}
      </Link>
      {invoiceRows.map((i) => (
        <p key={i.id}>
          <Link href={`/${locale}/invoices/${i.id}` as never}>
            {i.invoiceNumber} · {translateStatus(tStatus, i.status)}
          </Link>
        </p>
      ))}
      <h2 className="text-xl font-semibold">{tTransfers("transferHistory")}</h2>
      {history.map((h) => {
        const snap = h.snapshot as {
          previousVehicle?: { registrationNumber: string };
          newVehicle?: { registrationNumber: string };
          user?: string;
        };
        return (
          <div key={h.id} className="rounded-xl border border-[var(--edge)] p-4">
            <p>
              {formatOmanDateTime(h.transferredAt)} {tCommon("omanTime")} ·{" "}
              {snap.previousVehicle?.registrationNumber} → {snap.newVehicle?.registrationNumber}
            </p>
            <p>
              {tTransfers("historyKmLine", {
                start: h.startingKm,
                end: h.endingKm,
                next: h.newStartingKm,
                max: h.remainingMaximumKm,
                free: h.remainingFreeKm,
              })}
            </p>
            <p>
              {tTransfers("historyChargesLine", {
                charges: omrInput(h.chargesBaisa),
                received: omrInput(h.receivedBaisa),
                balance: omrInput(h.balanceBaisa),
              })}{" "}
              · {snap.user}
            </p>
            <p>{h.remarks}</p>
          </div>
        );
      })}
      {!history.length && <p>{tTransfers("noTransfers")}</p>}
    </div>
  );
}
