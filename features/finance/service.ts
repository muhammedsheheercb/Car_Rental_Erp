import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  customerLedger,
  customers,
  financeFines,
  invoices,
  legalFineHistory,
  paymentCorrections,
  payments,
  refundApprovals,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  vehicles,
} from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { assertPaymentAllowed, calculatePayback, refundApprovalCredit } from "./calculations";
import { correctionSchema, financePaymentSchema, fineSchema, refundSchema } from "./validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lock(tx: Tx, id: string, actor: Identity, action: string) {
  const [r] = await tx.select().from(rentals).where(eq(rentals.id, id)).for("update");
  if (!r || !can(actor, "finance", action, r.branchId))
    throw new Error("Booking not found or access denied.");
  return r;
}
export async function totals(tx: Tx | typeof db, id: string) {
  const [sum] = await tx
    .select({
      balance: sql<number>`coalesce(sum(${customerLedger.debitBaisa}::bigint - ${customerLedger.creditBaisa}::bigint),0)::bigint`,
    })
    .from(customerLedger)
    .where(eq(customerLedger.rentalId, id));
  const approvals = await tx.select().from(refundApprovals).where(eq(refundApprovals.rentalId, id));
  const rows = await tx.select().from(payments).where(eq(payments.rentalId, id));
  const returned = rows.reduce((n, p) => n + (p.kind === "PAYBACK" ? p.amountBaisa : 0), 0);
  return {
    balance: Number(sum.balance),
    ...calculatePayback(
      approvals.reduce((n, a) => n + a.amountBaisa, 0),
      returned,
      Number(sum.balance),
    ),
  };
}
async function post(
  tx: Tx,
  r: typeof rentals.$inferSelect,
  actor: Identity,
  input: {
    kind: "ADVANCE" | "RECEIPT" | "PAYBACK" | "REVERSAL";
    amount: number;
    method: "CASH" | "CARD" | "BANK_TRANSFER";
    requestId?: string;
    reference?: string;
    remarks?: string;
  },
  direction: "RECEIPT" | "PAYBACK",
) {
  const [p] = await tx
    .insert(payments)
    .values({
      rentalId: r.id,
      customerId: r.customerId,
      branchId: r.branchId,
      receiptNumber: `RCT-${crypto.randomUUID().toUpperCase()}`,
      kind: input.kind,
      requestId: input.requestId,
      amountBaisa: input.amount,
      method: input.method,
      reference: input.reference,
      note: input.remarks,
      direction,
      recordedBy: actor.id,
    })
    .returning();
  await tx.insert(customerLedger).values({
    rentalId: r.id,
    customerId: r.customerId,
    paymentId: p.id,
    type: direction === "RECEIPT" ? "PAYMENT" : "PAYBACK",
    debitBaisa: direction === "PAYBACK" ? input.amount : 0,
    creditBaisa: direction === "RECEIPT" ? input.amount : 0,
    description: `${input.kind} ${p.receiptNumber}`,
  });
  return p;
}
export async function recordPayment(raw: unknown, actor: Identity) {
  const input = financePaymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const r = await lock(tx, input.rentalId, actor, "create");
    const [existing] = await tx
      .select()
      .from(payments)
      .where(eq(payments.requestId, input.requestId));
    if (existing) {
      if (existing.rentalId !== r.id) throw new Error("Request already used.");
      return existing;
    }
    const summary = await totals(tx, r.id);
    if (input.kind === "ADVANCE" && !["RESERVED", "ACTIVE"].includes(r.status))
      throw new Error("Advances require a booked or rented vehicle.");
    assertPaymentAllowed(
      input.amount,
      input.kind === "PAYBACK" ? summary.payableBaisa : Math.max(0, summary.balance),
    );
    return post(tx, r, actor, input, input.kind === "PAYBACK" ? "PAYBACK" : "RECEIPT");
  });
}
export async function approveRefund(raw: unknown, actor: Identity) {
  const input = refundSchema.parse(raw);
  return db.transaction(async (tx) => {
    const r = await lock(tx, input.rentalId, actor, "approve");
    const [existing] = await tx
      .select()
      .from(refundApprovals)
      .where(eq(refundApprovals.requestId, input.requestId));
    if (existing) return;
    const s = await totals(tx, r.id);
    const credit = refundApprovalCredit(s.balance, s.remainingBaisa, input.amount);
    if (credit > 2147483647) throw new Error("Refund adjustment is too large.");
    await tx.insert(refundApprovals).values({
      rentalId: r.id,
      requestId: input.requestId,
      amountBaisa: input.amount,
      balanceCreditBaisa: credit,
      remarks: input.remarks,
      approvedBy: actor.id,
    });
    if (credit)
      await tx.insert(customerLedger).values({
        rentalId: r.id,
        customerId: r.customerId,
        type: "ADJUSTMENT",
        creditBaisa: credit,
        description: `Approved refund: ${input.remarks}`,
      });
  });
}
export async function correctPayment(raw: unknown, actor: Identity) {
  const input = correctionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, input.paymentId));
    if (!p?.rentalId) throw new Error("Receipt not found.");
    const r = await lock(tx, p.rentalId, actor, "update");
    if (!["RECEIPT", "ADVANCE"].includes(p.kind))
      throw new Error("Only receipts and advances can be corrected here.");
    const [done] = await tx
      .select()
      .from(paymentCorrections)
      .where(eq(paymentCorrections.originalPaymentId, p.id));
    if (done) throw new Error("This receipt has already been corrected.");
    const s = await totals(tx, r.id);
    if (s.returnedBaisa > 0 || s.approvedBaisa > 0)
      throw new Error(
        "Receipts with approved refunds require accountant review before correction.",
      );
    if (input.amount) assertPaymentAllowed(input.amount, Math.max(0, s.balance + p.amountBaisa));
    const reversal = await post(
      tx,
      r,
      actor,
      { ...input, amount: p.amountBaisa, kind: "REVERSAL" },
      "PAYBACK",
    );
    const replacement = input.amount
      ? await post(tx, r, actor, { ...input, kind: p.kind as "RECEIPT" | "ADVANCE" }, "RECEIPT")
      : null;
    await tx.insert(paymentCorrections).values({
      originalPaymentId: p.id,
      reversalPaymentId: reversal.id,
      replacementPaymentId: replacement?.id,
      reason: input.remarks,
      correctedBy: actor.id,
    });
  });
}
export async function recordFine(raw: unknown, actor: Identity) {
  const input = fineSchema.parse(raw);
  return db.transaction(async (tx) => {
    const r = await lock(tx, input.rentalId, actor, "create");
    const [existing] = await tx
      .select()
      .from(financeFines)
      .where(eq(financeFines.requestId, input.requestId));
    if (existing) return existing;
    const segments = await tx
      .select()
      .from(rentalVehicleSwaps)
      .where(eq(rentalVehicleSwaps.rentalId, r.id));
    const historical = segments.find(
      (segment) =>
        input.dateFrom >= segment.segmentStartedAt &&
        input.dateTo <= segment.transferredAt &&
        input.dateFrom < segment.transferredAt,
    );
    if (
      input.kind === "NORMAL" &&
      !historical &&
      (r.status === "RESERVED" ||
        r.status === "CANCELLED" ||
        input.dateFrom < (r.segmentStartedAt ?? r.startsAt) ||
        input.dateTo >
          (r.actualReturnAt ?? (r.status === "ACTIVE" ? new Date() : r.expectedReturnAt)))
    )
      throw new Error(
        "Fine dates must fall within one vehicle's occupied rental period. Split fines that span a vehicle transfer.",
      );
    if (input.kind === "NORMAL") {
      const [finalized] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.rentalId, r.id), eq(invoices.status, "FINALIZED")));
      if (finalized) throw new Error("Reverse the finalized invoice before adding a rental fine.");
    }
    const fineVehicleId = historical?.previousVehicleId ?? r.vehicleId;
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, fineVehicleId));
    const [c] = await tx.select().from(customers).where(eq(customers.id, r.customerId));
    const snapshot = {
      bookingNumber: r.agreementNumber,
      outDateTime: r.startsAt.toISOString(),
      registration: v.registrationNumber,
      customer: c.name,
      address: c.address,
      mobile: c.mobile,
      startingKm: historical?.startingKm ?? r.pickupOdometerKm,
      user: actor.displayName,
      returnDate: r.actualReturnAt?.toISOString() ?? r.expectedReturnAt.toISOString(),
      endingKm: historical?.endingKm ?? r.returnOdometerKm,
    };
    const [fine] = await tx
      .insert(financeFines)
      .values({
        requestId: input.requestId,
        rentalId: r.id,
        vehicleId: fineVehicleId,
        customerId: r.customerId,
        branchId: r.branchId,
        kind: input.kind,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        amountBaisa: input.amount,
        details: input.details,
        remarks: input.remarks,
        bookingSnapshot: snapshot,
        createdBy: actor.id,
      })
      .returning();
    if (input.kind === "LEGAL")
      await tx.insert(legalFineHistory).values({
        fineId: fine.id,
        action: "CREATED",
        snapshot: fine,
        reason: "Legal fine created",
        actorId: actor.id,
      });
    else {
      if (r.totalBaisa + input.amount > 2147483647) throw new Error("Rental total is too large.");
      await tx.insert(rentalCharges).values({
        rentalId: r.id,
        type: "FINE",
        component: "FINE",
        amountBaisa: input.amount,
        description: input.details,
        createdBy: actor.id,
      });
      await tx.insert(customerLedger).values({
        rentalId: r.id,
        customerId: r.customerId,
        type: "FINE",
        debitBaisa: input.amount,
        description: input.details,
      });
      await tx
        .update(rentals)
        .set({ totalBaisa: r.totalBaisa + input.amount, updatedAt: new Date() })
        .where(eq(rentals.id, r.id));
    }
    return fine;
  });
}
export async function changeLegalFine(raw: Record<string, unknown>, actor: Identity) {
  const id = String(raw.fineId);
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(financeFines).where(eq(financeFines.id, id)).for("update");
    const deleting = raw.operation === "delete";
    if (
      f?.kind !== "LEGAL" ||
      f.isDeleted ||
      !can(actor, "finance", deleting ? "delete" : "update", f.branchId)
    )
      throw new Error("Legal fine not found or access denied.");
    const reason = String(raw.reason ?? "").trim();
    if (!reason || reason.length > 1000)
      throw new Error("A correction/deletion reason is required.");
    const input = deleting
      ? null
      : fineSchema.parse({ ...raw, kind: "LEGAL", rentalId: f.rentalId, requestId: f.requestId });
    const [updated] = await tx
      .update(financeFines)
      .set(
        input
          ? {
              dateFrom: input.dateFrom,
              dateTo: input.dateTo,
              amountBaisa: input.amount,
              details: input.details,
              remarks: input.remarks,
              updatedAt: new Date(),
            }
          : { isDeleted: true, updatedAt: new Date() },
      )
      .where(eq(financeFines.id, id))
      .returning();
    await tx.insert(legalFineHistory).values({
      fineId: id,
      action: deleting ? "DELETED" : "EDITED",
      snapshot: { before: f, after: updated },
      reason,
      actorId: actor.id,
    });
  });
}
