import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FinanceForm } from "@/components/finance-form";

import { db } from "@/db/client";
import { financeFines, legalFineHistory, paymentCorrections, payments, users } from "@/db/schema";
import { bookingOption, bookingRows, financeModules } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePermission } from "@/lib/auth";
export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string; module: string; id: string }>;
}) {
  const { locale, module, id } = await params;
  const config = financeModules[module];
  if (!config || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await requirePermission("finance", "read");
  const fine = ["LEGAL", "NORMAL"].includes(config.kind);
  const [record] = fine
    ? await db
        .select()
        .from(financeFines)
        .where(
          and(
            eq(financeFines.id, id),
            eq(financeFines.kind, config.kind as "LEGAL" | "NORMAL"),
            actor.role === "SUPER_ADMIN"
              ? undefined
              : inArray(financeFines.branchId, actor.branchIds),
          ),
        )
    : await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, id),
            module === "receipts"
              ? inArray(payments.kind, ["RECEIPT", "ADVANCE", "REVERSAL"])
              : eq(payments.kind, config.kind as "ADVANCE" | "RECEIPT" | "PAYBACK"),
            actor.role === "SUPER_ADMIN" ? undefined : inArray(payments.branchId, actor.branchIds),
          ),
        );
  if (!record?.rentalId) notFound();
  const rows = await bookingRows(actor);
  const row = rows.find((r) => r.rental.id === record.rentalId);
  if (!row) notFound();
  const s = await totals(db, row.rental.id);
  const legal = fine && "bookingSnapshot" in record;
  const details = legal ? record.bookingSnapshot : bookingOption(row).snapshot;
  const [recorder] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, "recordedBy" in record ? record.recordedBy : record.createdBy));
  const history = legal
    ? await db
        .select()
        .from(legalFineHistory)
        .where(eq(legalFineHistory.fineId, id))
        .orderBy(desc(legalFineHistory.createdAt))
    : [];
  const [correction] = !fine
    ? await db.select().from(paymentCorrections).where(eq(paymentCorrections.originalPaymentId, id))
    : [];
  return (
    <div className="space-y-5">
      <Link className="print:hidden" href={`/${locale}/finance/${module}`}>
        ← {config.title}
      </Link>
      <h1 className="text-2xl font-semibold">{config.title} record</h1>
      {can(actor, "finance", "print", record.branchId) && (config.kind === "LEGAL" || !fine) && (
        <Link
          className="btn inline-block print:hidden"
          href={`/${locale}/documents/${fine ? "legal-fine" : "receipt"}/${id}` as never}
        >
          Print A4
        </Link>
      )}
      <section className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2">
        {Object.entries(details).map(([key, value]) => (
          <p key={key}>
            {key}: {value ?? "—"}
          </p>
        ))}
        <p>Amount: {formatOMR(record.amountBaisa)}</p>
        <p>Recorded by: {recorder?.name}</p>
        {"receiptNumber" in record && (
          <>
            <p>Receipt: {record.receiptNumber}</p>
            <p>Date (Oman): {formatOmanDateTime(record.receivedAt)}</p>
            <p>Payment Mode: {record.method}</p>
            <p>Type: {record.kind}</p>
            <p>Reference: {record.reference ?? "—"}</p>
            <p>Remarks: {record.note ?? "—"}</p>
          </>
        )}
        {"details" in record && (
          <>
            <p>Date From: {formatOmanDateTime(record.dateFrom)}</p>
            <p>Date To: {formatOmanDateTime(record.dateTo)}</p>
            <p>Details: {record.details}</p>
            <p>Remarks: {record.remarks}</p>
            <p>Status: {record.isDeleted ? "Deleted (history retained)" : "Current"}</p>
          </>
        )}
      </section>
      {config.kind !== "LEGAL" && (
        <p className="text-xl">Invoice balance: {formatOMR(s.balance)}</p>
      )}
      {correction && (
        <p>
          Corrected: {correction.reason}. Original record retained.{" "}
          <Link href={`/${locale}/finance/receipts/${correction.reversalPaymentId}`}>
            View reversal
          </Link>
          {correction.replacementPaymentId && (
            <Link href={`/${locale}/finance/receipts/${correction.replacementPaymentId}`}>
              {" "}
              · View replacement
            </Link>
          )}
        </p>
      )}
      {!fine &&
        !correction &&
        ["RECEIPT", "ADVANCE"].includes(record.kind) &&
        can(actor, "finance", "update", record.branchId) && (
          <details className="print:hidden">
            <summary>Correct receipt</summary>
            <FinanceForm
              operation="correction"
              record={{
                id,
                amount: (record.amountBaisa / 1000).toFixed(3),
                method: "method" in record ? record.method : undefined,
              }}
            />
          </details>
        )}
      {legal && record.kind === "LEGAL" && !record.isDeleted && (
        <>
          {can(actor, "finance", "update", record.branchId) && (
            <details className="print:hidden">
              <summary>Edit legal fine</summary>
              <FinanceForm
                operation="edit"
                kind="LEGAL"
                record={{
                  id,
                  amount: (record.amountBaisa / 1000).toFixed(3),
                  details: record.details,
                  remarks: record.remarks ?? "",
                  from: formatOmanDateTime(record.dateFrom),
                  to: formatOmanDateTime(record.dateTo),
                }}
              />
            </details>
          )}
          {can(actor, "finance", "delete", record.branchId) && (
            <details className="print:hidden">
              <summary>Delete legal fine</summary>
              <FinanceForm operation="delete" record={{ id, amount: "0" }} />
            </details>
          )}
        </>
      )}
      {!!history.length && (
        <section>
          <h2 className="text-lg">Legal fine history</h2>
          {history.map((h) => (
            <details key={h.id} className="mt-3">
              <summary>
                {h.action} · {formatOmanDateTime(h.createdAt)} · {h.reason}
              </summary>
              <pre className="overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(h.snapshot, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
