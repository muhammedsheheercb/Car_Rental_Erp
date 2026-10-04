import "server-only";
import { eq } from "drizzle-orm";
import type { InvoiceBooking } from "@/components/invoice-form";
import { db } from "@/db/client";
import { rentalCharges, rentalVehicleSwaps } from "@/db/schema";
import type { bookingRows } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { calculateExcessKm, formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, type Identity } from "@/lib/auth";
import { omrInput } from "./calculations";
import { invoicePayments } from "./service";
export async function invoiceBooking(
  row: Awaited<ReturnType<typeof bookingRows>>[number],
  actor: Identity,
): Promise<InvoiceBooking> {
  const { rental: r, customer: c, vehicle: v } = row;
  const [paid, financial, charges, swaps] = await Promise.all([
    invoicePayments(db, r.id),
    totals(db, r.id),
    db.select().from(rentalCharges).where(eq(rentalCharges.rentalId, r.id)),
    db.select().from(rentalVehicleSwaps).where(eq(rentalVehicleSwaps.rentalId, r.id)),
  ]);
  const sum = (component: string) =>
    charges.filter((c) => c.component === component).reduce((n, c) => n + c.amountBaisa, 0);
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
    ledgerBalance: financial.balance,
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
