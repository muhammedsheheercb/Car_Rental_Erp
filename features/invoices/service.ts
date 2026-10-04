import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  customerLedger,
  customers,
  invoiceHistory,
  invoices,
  paymentCorrections,
  payments,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  vehicles,
} from "@/db/schema";
import { MAX_BAISA, parseOMR } from "@/features/finance/calculations";
import { totals } from "@/features/finance/service";
import { can, type Identity } from "@/lib/auth";
import { invoiceCalculation } from "./calculations";

const amount = z.string().transform(parseOMR);
const schema = z.object({
  rentalId: z.uuid(),
  requestId: z.uuid(),
  invoiceId: z.uuid().optional(),
  washing: amount,
  petrol: amount,
  discount: amount,
  received: amount,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  status: z.enum(["DRAFT", "FINALIZED"]),
  remarks: z.string().trim().max(1000).default(""),
});
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function invoicePayments(tx: Tx | typeof db, rentalId: string) {
  const rows = await tx.select().from(payments).where(eq(payments.rentalId, rentalId));
  const corrections = await tx.select().from(paymentCorrections);
  const corrected = new Set(corrections.map((c) => c.originalPaymentId));
  const effective = rows.filter((p) => !corrected.has(p.id) && p.kind !== "REVERSAL");
  return {
    advance: effective.filter((p) => p.kind === "ADVANCE").reduce((n, p) => n + p.amountBaisa, 0),
    received: effective.filter((p) => p.kind === "RECEIPT").reduce((n, p) => n + p.amountBaisa, 0),
    paybacks: effective.filter((p) => p.kind === "PAYBACK").reduce((n, p) => n + p.amountBaisa, 0),
  };
}
export async function saveInvoice(raw: unknown, actor: Identity) {
  const input = schema.parse(raw);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(rentals).where(eq(rentals.id, input.rentalId)).for("update");
    if (!r || !can(actor, "finance", input.invoiceId ? "update" : "create", r.branchId))
      throw new Error("Booking not found or access denied.");
    const [old] = input.invoiceId
      ? await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update")
      : [];
    if (input.invoiceId && (!old || old.rentalId !== r.id || old.status !== "DRAFT"))
      throw new Error("Only a draft invoice can be edited.");
    const [duplicate] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.requestId, input.requestId));
    if (duplicate && !old) {
      if (duplicate.rentalId !== r.id) throw new Error("Request already used.");
      return duplicate;
    }
    if (input.status === "FINALIZED") {
      if (!can(actor, "finance", "approve", r.branchId))
        throw new Error("Invoice finalization permission is required.");
      if (r.status !== "RETURNED" && r.status !== "CANCELLED")
        throw new Error(
          "Return or cancel the rental before finalizing so final mileage and late charges are included.",
        );
      const [final] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.rentalId, r.id), eq(invoices.status, "FINALIZED")));
      if (final) throw new Error("This booking already has a finalized invoice.");
    } else if (input.received)
      throw new Error(
        "Draft invoices cannot collect money. Use Advance or Receipts, or finalize the invoice.",
      );
    const paid = await invoicePayments(tx, r.id);
    const financial = await totals(tx, r.id);
    const calc = invoiceCalculation({
      subtotal: r.totalBaisa,
      deposit: r.depositBaisa ?? 0,
      washing: input.washing,
      petrol: input.petrol,
      discount: input.discount,
      advance: paid.advance,
      previouslyReceived: paid.received,
      paybacks: paid.paybacks,
      received: input.received,
    });
    const adjustment = input.washing + input.petrol - input.discount;
    if (input.received > Math.max(0, financial.balance + adjustment))
      throw new Error("Received amount exceeds the ledger's outstanding balance.");
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, r.vehicleId));
    const [c] = await tx.select().from(customers).where(eq(customers.id, r.customerId));
    const charges = await tx.select().from(rentalCharges).where(eq(rentalCharges.rentalId, r.id));
    const swaps = await tx
      .select()
      .from(rentalVehicleSwaps)
      .where(eq(rentalVehicleSwaps.rentalId, r.id));
    const values = {
      rentalId: r.id,
      branchId: r.branchId,
      status: input.status,
      subtotalBaisa: r.totalBaisa,
      washingBaisa: input.washing,
      petrolBaisa: input.petrol,
      discountBaisa: input.discount,
      grandTotalBaisa: calc.grandTotal,
      advanceBaisa: paid.advance,
      receivedBaisa: paid.received + input.received,
      balanceBaisa: financial.balance + adjustment - input.received,
      adjustmentBaisa: input.status === "FINALIZED" ? adjustment : 0,
      snapshot: {
        booking: r,
        customer: c,
        vehicle: v,
        charges,
        transfers: swaps,
        paymentTotals: paid,
        ledgerBalance: financial.balance,
        ledgerAdjustmentsBaisa:
          financial.balance -
          (r.totalBaisa + (r.depositBaisa ?? 0) - paid.advance - paid.received + paid.paybacks),
        depositBaisa: r.depositBaisa,
      },
      remarks: input.remarks,
      createdBy: actor.id,
    };
    const [invoice] = old
      ? await tx
          .update(invoices)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(invoices.id, old.id))
          .returning()
      : await tx
          .insert(invoices)
          .values({
            ...values,
            requestId: input.requestId,
            invoiceNumber: `INV-${crypto.randomUUID().toUpperCase()}`,
          })
          .returning();
    if (input.status === "FINALIZED") {
      for (const [component, value] of [
        ["WASHING", input.washing],
        ["PETROL", input.petrol],
        ["DISCOUNT", -input.discount],
      ] as const) {
        if (!value) continue;
        await tx.insert(rentalCharges).values({
          rentalId: r.id,
          type: "ADJUSTMENT",
          component,
          amountBaisa: value,
          description: `${invoice.invoiceNumber}: ${component}`,
          createdBy: actor.id,
        });
        await tx.insert(customerLedger).values({
          rentalId: r.id,
          customerId: r.customerId,
          type: "ADJUSTMENT",
          debitBaisa: Math.max(0, value),
          creditBaisa: Math.max(0, -value),
          description: `${invoice.invoiceNumber}: ${component}`,
        });
      }
      if (Math.abs(r.totalBaisa + adjustment) > MAX_BAISA)
        throw new Error("Adjusted total is too large.");
      await tx
        .update(rentals)
        .set({ totalBaisa: calc.grandTotal - (r.depositBaisa ?? 0), updatedAt: new Date() })
        .where(eq(rentals.id, r.id));
      if (input.received) {
        const [p] = await tx
          .insert(payments)
          .values({
            rentalId: r.id,
            customerId: r.customerId,
            branchId: r.branchId,
            receiptNumber: `RCT-${crypto.randomUUID().toUpperCase()}`,
            requestId: input.requestId,
            kind: "RECEIPT",
            direction: "RECEIPT",
            method: input.method,
            amountBaisa: input.received,
            recordedBy: actor.id,
            note: invoice.invoiceNumber,
          })
          .returning();
        await tx.insert(customerLedger).values({
          rentalId: r.id,
          customerId: r.customerId,
          paymentId: p.id,
          type: "PAYMENT",
          creditBaisa: input.received,
          description: `${invoice.invoiceNumber}: ${p.receiptNumber}`,
        });
      }
    }
    await tx.insert(invoiceHistory).values({
      invoiceId: invoice.id,
      action: input.status === "FINALIZED" ? "FINALIZED" : old ? "EDITED" : "CREATED",
      snapshot: { before: old ?? null, after: invoice },
      reason: input.remarks || "Invoice saved",
      actorId: actor.id,
    });
    return invoice;
  });
}
export async function voidInvoice(raw: unknown, actor: Identity) {
  const input = z
    .object({ invoiceId: z.uuid(), reason: z.string().trim().min(1).max(1000) })
    .parse(raw);
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId));
    if (!candidate) throw new Error("Invoice not found.");
    const [r] = await tx
      .select()
      .from(rentals)
      .where(eq(rentals.id, candidate.rentalId))
      .for("update");
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, candidate.id))
      .for("update");
    if (
      !can(actor, "finance", "delete", r.branchId) ||
      (invoice.status === "FINALIZED" && !can(actor, "finance", "approve", r.branchId))
    )
      throw new Error("Invoice reversal permission is required.");
    if (invoice.status === "VOID") return;
    if (invoice.adjustmentBaisa) {
      const reverse = -invoice.adjustmentBaisa;
      await tx.insert(customerLedger).values({
        rentalId: r.id,
        customerId: r.customerId,
        type: "ADJUSTMENT",
        debitBaisa: Math.max(0, reverse),
        creditBaisa: Math.max(0, -reverse),
        description: `Reversal ${invoice.invoiceNumber}: ${input.reason}`,
      });
      await tx.insert(rentalCharges).values({
        rentalId: r.id,
        type: "ADJUSTMENT",
        component: "INVOICE_REVERSAL",
        amountBaisa: reverse,
        description: `Reversal ${invoice.invoiceNumber}`,
        createdBy: actor.id,
      });
      const total = r.totalBaisa + reverse;
      if (total < 0 || total > MAX_BAISA) throw new Error("Reversal total is invalid.");
      await tx
        .update(rentals)
        .set({ totalBaisa: total, updatedAt: new Date() })
        .where(eq(rentals.id, r.id));
    }
    await tx
      .update(invoices)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    await tx.insert(invoiceHistory).values({
      invoiceId: invoice.id,
      action: "VOID",
      snapshot: invoice,
      reason: input.reason,
      actorId: actor.id,
    });
  });
}
