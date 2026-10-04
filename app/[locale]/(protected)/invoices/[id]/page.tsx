import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm, VoidInvoiceForm } from "@/components/invoice-form";
import { db } from "@/db/client";
import { invoiceHistory, invoices } from "@/db/schema";
import { bookingRows } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { omrInput } from "@/features/invoices/calculations";
import { invoiceBooking } from "@/features/invoices/queries";
import { calculateExcessKm, formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePermission } from "@/lib/auth";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const actor = await requirePermission("finance", "read");
  const { id, locale } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const [i] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, id),
        actor.role === "SUPER_ADMIN" ? undefined : inArray(invoices.branchId, actor.branchIds),
      ),
    );
  if (!i) notFound();
  const [history, financial, rows] = await Promise.all([
    db
      .select()
      .from(invoiceHistory)
      .where(eq(invoiceHistory.invoiceId, id))
      .orderBy(asc(invoiceHistory.createdAt)),
    totals(db, i.rentalId),
    bookingRows(actor),
  ]);
  const row = rows.find((r) => r.rental.id === i.rentalId);
  if (!row) notFound();
  const options = i.status === "DRAFT" ? [await invoiceBooking(row, actor)] : [];
  const snapshot = i.snapshot as {
    booking?: {
      agreementNumber: string;
      startsAt: string;
      pickupOdometerKm: number;
      returnOdometerKm: number;
      dailyRateBaisa: number;
      pricingPeriod: string;
      expectedReturnAt: string;
      actualReturnAt: string;
      includedKm: number;
      freeKm: number;
      excessKmChargeBaisa: number;
      openKm: boolean;
    };
    customer?: { name: string; mobile: string; address: string };
    vehicle?: { registrationNumber: string };
    transfers?: {
      id: string;
      startingKm: number;
      endingKm: number;
      newStartingKm: number;
      transferredAt: string;
      balanceBaisa: number;
      snapshot: {
        previousVehicle?: { registrationNumber: string };
        newVehicle?: { registrationNumber: string };
        mileage?: { extraKm: number };
      };
    }[];
    charges?: { id: string; component: string; description: string; amountBaisa: number }[];
    depositBaisa?: number;
    ledgerAdjustmentsBaisa?: number;
    paymentTotals?: { paybacks: number };
  };
  const c = snapshot.customer;
  const r = snapshot.booking;
  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="break-all text-2xl font-semibold">Invoice {i.invoiceNumber}</h1>
        {can(actor, "finance", "print", i.branchId) && (
          <Link className="btn" href={`/${locale}/documents/invoice/${id}` as never}>
            Print Invoice A4
          </Link>
        )}
      </div>
      <p>
        {i.status} · Issued {formatOmanDateTime(i.createdAt)} Oman
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {Object.entries({
          "Booking Number": r?.agreementNumber,
          "Booking Date / Time": r?.startsAt ? formatOmanDateTime(new Date(r.startsAt)) : null,
          "Registration Number": snapshot.vehicle?.registrationNumber,
          Customer: c?.name,
          Mobile: c?.mobile,
          Address: c?.address,
          "Rate (OMR)": r ? omrInput(r.dailyRateBaisa) : null,
          "Rental Type": r?.pricingPeriod,
          "Starting KM": r?.pickupOdometerKm,
          "Ending KM": r?.returnOdometerKm,
          Days: r
            ? Math.ceil(
                (new Date(r.actualReturnAt ?? r.expectedReturnAt).getTime() -
                  new Date(r.startsAt).getTime()) /
                  86400000,
              )
            : null,
          "Extra KM":
            (snapshot.transfers ?? []).reduce((n, t) => n + (t.snapshot.mileage?.extraKm ?? 0), 0) +
            (r?.returnOdometerKm == null
              ? 0
              : calculateExcessKm({
                  startingKm: r.pickupOdometerKm ?? 0,
                  returnKm: r.returnOdometerKm,
                  maximumKm: r.includedKm,
                  freeKm: r.freeKm,
                  openKm: r.openKm,
                })),
          "Excess KM Charge / KM (OMR)": r ? omrInput(r.excessKmChargeBaisa) : null,
          "Expected Return": r?.expectedReturnAt
            ? formatOmanDateTime(new Date(r.expectedReturnAt))
            : null,
        }).map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-[var(--muted)]">{k}</dt>
            <dd>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="p-2">Component</th>
              <th className="p-2">Description</th>
              <th className="p-2">OMR</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.charges?.map((ch) => (
              <tr key={ch.id}>
                <td className="p-2">{ch.component}</td>
                <td className="p-2">{ch.description}</td>
                <td className="p-2">{omrInput(ch.amountBaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2">
        {Object.entries({
          Subtotal: i.subtotalBaisa,
          "Additional Washing": i.washingBaisa,
          "Additional Petrol": i.petrolBaisa,
          Discount: i.discountBaisa,
          "Total Amount": i.grandTotalBaisa - (snapshot.depositBaisa ?? 0),
          "Grand Total": i.grandTotalBaisa,
          "Transfer Vehicle Balance (already included)":
            snapshot.transfers?.at(-1)?.balanceBaisa ?? 0,
          "Advance Received": i.advanceBaisa,
          "Received Amount": i.receivedBaisa,
          "Balance at issue": i.balanceBaisa,
          "Current Ledger Balance (includes held deposit)": financial.balance,
          "Security Deposit": snapshot.depositBaisa ?? 0,
          "Ledger Adjustments / Refund Credits": snapshot.ledgerAdjustmentsBaisa ?? 0,
          "Paybacks at issue": snapshot.paymentTotals?.paybacks ?? 0,
        }).map(([k, v]) => (
          <div key={k}>
            {k}: <strong>OMR {omrInput(v)}</strong>
          </div>
        ))}
      </dl>
      {!!snapshot.transfers?.length && (
        <section>
          <h2 className="text-xl font-semibold">Vehicle Transfer History</h2>
          {snapshot.transfers.map((t) => (
            <p key={t.id} className="mt-2">
              {formatOmanDateTime(new Date(t.transferredAt))} Oman ·{" "}
              {t.snapshot.previousVehicle?.registrationNumber} ({t.startingKm}–{t.endingKm} KM) →{" "}
              {t.snapshot.newVehicle?.registrationNumber} (starting {t.newStartingKm} KM)
            </p>
          ))}
        </section>
      )}
      <p>{i.remarks}</p>
      {i.status === "DRAFT" && can(actor, "finance", "update", i.branchId) && (
        <InvoiceForm
          bookings={options}
          initialBooking={i.rentalId}
          record={{
            id: i.id,
            washing: omrInput(i.washingBaisa),
            petrol: omrInput(i.petrolBaisa),
            discount: omrInput(i.discountBaisa),
            remarks: i.remarks ?? "",
          }}
        />
      )}
      {i.status !== "VOID" &&
        can(actor, "finance", "delete", i.branchId) &&
        (i.status !== "FINALIZED" || can(actor, "finance", "approve", i.branchId)) && (
          <VoidInvoiceForm invoiceId={i.id} />
        )}
      <section className="print:hidden">
        <h2 className="text-xl font-semibold">Invoice History</h2>
        {history.map((h) => (
          <p key={h.id} className="mt-3">
            {formatOmanDateTime(h.createdAt)} Oman · {h.action} · {h.reason}
          </p>
        ))}
      </section>
    </article>
  );
}
