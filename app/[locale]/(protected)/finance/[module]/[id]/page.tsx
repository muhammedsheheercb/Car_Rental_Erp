import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FinanceForm } from "@/components/finance-form";

import { db } from "@/db/client";
import { financeFines, legalFineHistory, paymentCorrections, payments, users } from "@/db/schema";
import { bookingOption, bookingRows, financeModules } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePagePermission } from "@/lib/auth";
import { translateFieldLabel, translateSafe, translateStatus } from "@/lib/i18n-helpers";
export default async function RecordPage({
  params,
}: {
  params: Promise<{ locale: string; module: string; id: string }>;
}) {
  const { locale, module, id } = await params;
  const config = financeModules[module];
  if (!config || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [actor, tFinance, tCommon, tStatus, tRentals, tFields] = await Promise.all([
    requirePagePermission(locale, "finance", "read"),
    getTranslations("finance"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("rentals"),
    getTranslations("fieldLabels"),
  ]);
  const moduleTitle = translateSafe(tFinance, `modules.${module}`, config.title);
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
        ← {moduleTitle}
      </Link>
      <h1 className="text-2xl font-semibold">{tFinance("recordTitle", { title: moduleTitle })}</h1>
      {can(actor, "finance", "print", record.branchId) && (config.kind === "LEGAL" || !fine) && (
        <Link
          className="btn inline-block print:hidden"
          href={`/${locale}/documents/${fine ? "legal-fine" : "receipt"}/${id}` as never}
        >
          {tCommon("printA4")}
        </Link>
      )}
      <section className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 sm:grid-cols-2">
        {Object.entries(details).map(([key, value]) => (
          <p key={key}>
            {translateFieldLabel(tFields, key)}: {value ?? "—"}
          </p>
        ))}
        <p>
          {tCommon("amount")}: {formatOMR(record.amountBaisa)}
        </p>
        <p>
          {tFinance("recordedBy")}: {recorder?.name}
        </p>
        {"receiptNumber" in record && (
          <>
            <p>
              {tFinance("receiptNumber")}: {record.receiptNumber}
            </p>
            <p>
              {tCommon("dateTimeOman")}: {formatOmanDateTime(record.receivedAt)}
            </p>
            <p>
              {tCommon("paymentMode")}: {translateStatus(tStatus, record.method)}
            </p>
            <p>
              {tFinance("type")}: {translateStatus(tStatus, record.kind)}
            </p>
            <p>
              {tCommon("reference")}: {record.reference ?? "—"}
            </p>
            <p>
              {tCommon("remarks")}: {record.note ?? "—"}
            </p>
          </>
        )}
        {"details" in record && (
          <>
            <p>
              {tFinance("dateFrom")}: {formatOmanDateTime(record.dateFrom)}
            </p>
            <p>
              {tFinance("dateTo")}: {formatOmanDateTime(record.dateTo)}
            </p>
            <p>
              {tFinance("details")}: {record.details}
            </p>
            <p>
              {tCommon("remarks")}: {record.remarks}
            </p>
            <p>
              {tCommon("status")}:{" "}
              {record.isDeleted ? tStatus("DELETED_HISTORY") : tStatus("CURRENT")}
            </p>
          </>
        )}
      </section>
      {config.kind !== "LEGAL" && (
        <p className="text-xl">
          {tRentals("invoiceBalance")}: {formatOMR(s.balance)}
        </p>
      )}
      {correction && (
        <p>
          {tFinance("correctedNotice", { reason: correction.reason })}{" "}
          <Link href={`/${locale}/finance/receipts/${correction.reversalPaymentId}`}>
            {tFinance("viewReversal")}
          </Link>
          {correction.replacementPaymentId && (
            <Link href={`/${locale}/finance/receipts/${correction.replacementPaymentId}`}>
              {" "}
              · {tFinance("viewReplacement")}
            </Link>
          )}
        </p>
      )}
      {!fine &&
        !correction &&
        ["RECEIPT", "ADVANCE"].includes(record.kind) &&
        can(actor, "finance", "update", record.branchId) && (
          <details className="print:hidden">
            <summary>{tFinance("correctReceipt")}</summary>
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
              <summary>{tFinance("editLegalFine")}</summary>
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
              <summary>{tFinance("deleteLegalFine")}</summary>
              <FinanceForm operation="delete" record={{ id, amount: "0" }} />
            </details>
          )}
        </>
      )}
      {!!history.length && (
        <section>
          <h2 className="text-lg">{tFinance("legalFineHistory")}</h2>
          {history.map((h) => (
            <details key={h.id} className="mt-3">
              <summary>
                {translateStatus(tStatus, h.action)} · {formatOmanDateTime(h.createdAt)} ·{" "}
                {h.reason}
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
