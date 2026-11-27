import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { InvoiceBooking } from "@/components/invoice-form";
import { db } from "@/db/client";
import {
  customerLedger,
  paymentCorrections,
  payments,
  rentalCharges,
  rentalVehicleSwaps,
} from "@/db/schema";
import type { bookingRows } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { calculateExcessKm, formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, type Identity } from "@/lib/auth";
import { omrInput } from "./calculations";
import { invoicePayments } from "./service";

function buildInvoiceBooking(
  row: Awaited<ReturnType<typeof bookingRows>>[number],
  actor: Identity,
  paid: { advance: number; received: number; paybacks: number },
  ledgerBalance: number,
  charges: (typeof rentalCharges.$inferSelect)[],
  swaps: (typeof rentalVehicleSwaps.$inferSelect)[],
): InvoiceBooking {
  const { rental: r, customer: c, vehicle: v } = row;
  const sum = (component: string) =>
    charges.filter((ch) => ch.component === component).reduce((n, ch) => n + ch.amountBaisa, 0);
  const totalKm =
    swaps.reduce((n, s) => n + s.endingKm - s.startingKm, 0) +
    (r.returnOdometerKm === null ? 0 : r.returnOdometerKm - (r.pickupOdometerKm ?? 0));
  const extraKm =
    swaps.reduce(
      (n, s) => n + Number((s.snapshot.mileage as { extraKm?: number })?.extraKm ?? 0),
      0,
    ) +
    (r.returnOdometerKm === null
      ? 0
      : calculateExcessKm({
          maximumKm: r.includedKm,
          freeKm: r.freeKm,
          startingKm: r.pickupOdometerKm ?? 0,
          returnKm: r.returnOdometerKm,
          openKm: r.openKm,
        }));
  return {
    id: r.id,
    name: `${r.agreementNumber} · ${c.name} · ${v.registrationNumber}`,
    subtotal: r.totalBaisa,
    deposit: r.depositBaisa,
    advance: paid.advance,
    received: paid.received,
    paybacks: paid.paybacks,
    ledgerBalance,
    transferBalance: swaps.at(-1)?.balanceBaisa ?? 0,
    canFinalize:
      can(actor, "finance", "approve", r.branchId) && ["RETURNED", "CANCELLED"].includes(r.status),
    snapshot: {
      "Registration Number": v.registrationNumber,
      "Booking Number": r.agreementNumber,
      "Booking Date / Time (Oman)": formatOmanDateTime(r.startsAt),
      Customer: c.name,
      Mobile: c.mobile,
      Branch: row.branch,
      Status: r.status,
      "Rate (OMR)": omrInput(r.dailyRateBaisa),
      "Rental Type": r.pricingPeriod,
      "Starting KM": r.pickupOdometerKm,
      "Ending KM": r.returnOdometerKm,
      Days: Math.ceil(
        ((r.actualReturnAt ?? r.expectedReturnAt).getTime() - r.startsAt.getTime()) / 86400000,
      ),
      "Total KM (all vehicles)": totalKm,
      "Extra KM": extraKm,
      "Extra KM Charge (OMR)": omrInput(sum("EXCESS_KM")),
      "Excess KM Charge / KM (OMR)": omrInput(r.excessKmChargeBaisa),
      "Late Fee (OMR)": omrInput(sum("LATE_FEE")),
      "Fine (OMR)": omrInput(sum("FINE") + sum("OVERDUE_FINE")),
      "Washing Charges Already Posted (OMR)": omrInput(sum("WASHING")),
      "Petrol Charges Already Posted (OMR)": omrInput(sum("PETROL")),
      "Security Deposit (OMR)": omrInput(r.depositBaisa),
    },
  };
}

export async function invoiceBooking(
  row: Awaited<ReturnType<typeof bookingRows>>[number],
  actor: Identity,
): Promise<InvoiceBooking> {
  const { rental: r } = row;
  const [paid, financial, charges, swaps] = await Promise.all([
    invoicePayments(db, r.id),
    totals(db, r.id),
    db.select().from(rentalCharges).where(eq(rentalCharges.rentalId, r.id)),
    db.select().from(rentalVehicleSwaps).where(eq(rentalVehicleSwaps.rentalId, r.id)),
  ]);
  return buildInvoiceBooking(row, actor, paid, financial.balance, charges, swaps);
}

/** Constant-query batched loader for invoice creation comboboxes (eliminates 1+7N queries). */
export async function invoiceBookingsBatch(
  rows: Awaited<ReturnType<typeof bookingRows>>,
  actor: Identity,
): Promise<InvoiceBooking[]> {
  if (!rows.length) return [];
  const rentalIds = rows.map((r) => r.rental.id);
  const [ledgerRows, paymentRows, chargeRows, swapRows] = await Promise.all([
    db
      .select({
        rentalId: customerLedger.rentalId,
        balance: sql<number>`coalesce(sum(${customerLedger.debitBaisa}::bigint - ${customerLedger.creditBaisa}::bigint),0)::bigint`,
      })
      .from(customerLedger)
      .where(inArray(customerLedger.rentalId, rentalIds))
      .groupBy(customerLedger.rentalId),
    db.select().from(payments).where(inArray(payments.rentalId, rentalIds)),
    db.select().from(rentalCharges).where(inArray(rentalCharges.rentalId, rentalIds)),
    db.select().from(rentalVehicleSwaps).where(inArray(rentalVehicleSwaps.rentalId, rentalIds)),
  ]);
  const paymentIds = paymentRows.map((p) => p.id);
  const correctionRows = paymentIds.length
    ? await db
        .select({ originalPaymentId: paymentCorrections.originalPaymentId })
        .from(paymentCorrections)
        .where(inArray(paymentCorrections.originalPaymentId, paymentIds))
    : [];
  const correctedIds = new Set(correctionRows.map((c) => c.originalPaymentId));

  const balanceByRental = new Map(ledgerRows.map((l) => [l.rentalId ?? "", Number(l.balance)]));
  const paidByRental = new Map<string, { advance: number; received: number; paybacks: number }>();
  for (const p of paymentRows) {
    const rid = p.rentalId ?? "";
    if (!rid || correctedIds.has(p.id)) continue;
    const agg = paidByRental.get(rid) ?? { advance: 0, received: 0, paybacks: 0 };
    if (p.kind === "ADVANCE") agg.advance += p.amountBaisa;
    else if (p.kind === "RECEIPT") agg.received += p.amountBaisa;
    else if (p.kind === "PAYBACK") agg.paybacks += p.amountBaisa;
    paidByRental.set(rid, agg);
  }
  const chargesByRental = new Map<string, (typeof rentalCharges.$inferSelect)[]>();
  for (const ch of chargeRows) {
    const list = chargesByRental.get(ch.rentalId) ?? [];
    list.push(ch);
    chargesByRental.set(ch.rentalId, list);
  }
  const swapsByRental = new Map<string, (typeof rentalVehicleSwaps.$inferSelect)[]>();
  for (const sw of swapRows) {
    const list = swapsByRental.get(sw.rentalId) ?? [];
    list.push(sw);
    swapsByRental.set(sw.rentalId, list);
  }

  return rows.map((row) =>
    buildInvoiceBooking(
      row,
      actor,
      paidByRental.get(row.rental.id) ?? { advance: 0, received: 0, paybacks: 0 },
      balanceByRental.get(row.rental.id) ?? 0,
      chargesByRental.get(row.rental.id) ?? [],
      swapsByRental.get(row.rental.id) ?? [],
    ),
  );
}
