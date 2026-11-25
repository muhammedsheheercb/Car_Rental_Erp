import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FinanceForm } from "@/components/finance-form";
import { db } from "@/db/client";
import { branches, customers, financeFines, payments, rentals, users, vehicles } from "@/db/schema";
import { bookingOption, bookingRows, financeModules } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePagePermission } from "@/lib/auth";
import { translateSafe, translateStatus } from "@/lib/i18n-helpers";

const PAGE_SIZE = 15;
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; module: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, module } = await params;
  const config = financeModules[module];
  if (!config) notFound();
  const [actor, query, tFinance, tCommon, tStatus, tRentals] = await Promise.all([
    requirePagePermission(locale, "finance", "read"),
    searchParams,
    getTranslations("finance"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("rentals"),
  ]);
  const moduleTitle = translateSafe(tFinance, `modules.${module}`, config.title);
  const page = Math.min(100000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const fine = ["NORMAL", "LEGAL"].includes(config.kind);
  const rows = await bookingRows(actor);
  const table = fine ? financeFines : payments;
  const dateColumn = fine ? financeFines.dateFrom : payments.receivedAt;
  const parseFilter = (value: string | undefined) => {
    try {
      return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? parseOmanDateTime(`${value}T00:00`)
        : undefined;
    } catch {
      return undefined;
    }
  };
  const from = parseFilter(query.from),
    to = parseFilter(query.to);
  const branchFilter = query.branch && UUID_RE.test(query.branch) ? query.branch : undefined;
  const methodFilter =
    !fine && METHODS.includes((query.method ?? "") as (typeof METHODS)[number])
      ? (query.method as (typeof METHODS)[number])
      : undefined;
  const conditions = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(table.branchId, actor.branchIds),
    branchFilter ? eq(table.branchId, branchFilter) : undefined,
    methodFilter ? eq(payments.method, methodFilter) : undefined,
    fine
      ? and(
          eq(financeFines.kind, config.kind as "NORMAL" | "LEGAL"),
          eq(financeFines.isDeleted, false),
        )
      : module === "receipts"
        ? inArray(payments.kind, ["RECEIPT", "ADVANCE", "REVERSAL"])
        : eq(payments.kind, config.kind as "ADVANCE" | "RECEIPT" | "PAYBACK"),
    query.q
      ? or(
          ilike(rentals.agreementNumber, `%${query.q}%`),
          ilike(customers.name, `%${query.q}%`),
          ilike(vehicles.registrationNumber, `%${query.q}%`),
          fine
            ? ilike(financeFines.details, `%${query.q}%`)
            : ilike(payments.receiptNumber, `%${query.q}%`),
        )
      : undefined,
    from ? gte(dateColumn, from) : undefined,
    to ? lt(dateColumn, new Date(to.getTime() + 86400000)) : undefined,
  );
  const [list, branchOptions] = await Promise.all([
    db
      .select({
        id: table.id,
        amount: table.amountBaisa,
        date: dateColumn,
        booking: rentals.agreementNumber,
        customer: customers.name,
        vehicle: vehicles.vehicleNumber,
        registration: vehicles.registrationNumber,
        branch: branches.name,
        user: users.displayName,
        method: fine ? sql<string>`'—'` : payments.method,
        kind: table.kind,
      })
      .from(table)
      .innerJoin(rentals, eq(table.rentalId, rentals.id))
      .innerJoin(customers, eq(table.customerId, customers.id))
      .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .innerJoin(branches, eq(table.branchId, branches.id))
      .innerJoin(users, eq(fine ? financeFines.createdBy : payments.recordedBy, users.id))
      .where(conditions)
      .orderBy(desc(dateColumn))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(branches.id, actor.branchIds),
        ),
      )
      .orderBy(asc(branches.name)),
  ]);
  const previous =
    config.kind === "LEGAL"
      ? await db
          .select()
          .from(financeFines)
          .where(
            and(
              eq(financeFines.kind, "LEGAL"),
              eq(financeFines.isDeleted, false),
              actor.role === "SUPER_ADMIN"
                ? undefined
                : inArray(financeFines.branchId, actor.branchIds),
            ),
          )
      : [];
  const payableRows =
    module === "payback"
      ? await Promise.all(
          rows.map(async (row) => ({ row, summary: await totals(db, row.rental.id) })),
        )
      : [];
  const options = rows
    .filter(
      (row) =>
        can(actor, "finance", "create", row.rental.branchId) &&
        (module !== "advance" || ["RESERVED", "ACTIVE"].includes(row.rental.status)),
    )
    .map(bookingOption);
  const href = (n: number) =>
    `/${locale}/finance/${module}?${new URLSearchParams({
      ...(query.q ? { q: query.q } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(branchFilter ? { branch: branchFilter } : {}),
      ...(methodFilter ? { method: methodFilter } : {}),
      page: String(n),
    })}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{moduleTitle}</h1>
      <nav className="flex flex-wrap gap-4 print:hidden">
        {Object.entries(financeModules).map(([key, c]) => (
          <Link key={key} href={`/${locale}/finance/${key}`}>
            {translateSafe(tFinance, `modules.${key}`, c.title)}
          </Link>
        ))}
      </nav>
      {fine && (
        <p>
          {config.kind === "LEGAL" ? tFinance("legalFineNotice") : tFinance("normalFineNotice")}
        </p>
      )}
      {module === "payback" && (
        <section className="space-y-3">
          <h2 className="text-xl">{tFinance("paybackBalances")}</h2>
          {payableRows
            .filter((p) => p.summary.approvedBaisa || p.summary.balance < 0)
            .map(({ row, summary: s }) => (
              <article key={row.rental.id} className="rounded-xl border border-[var(--edge)] p-4">
                <p>
                  {row.rental.agreementNumber} · {row.customer.name}
                </p>
                <p>
                  {tFinance("amountDueBack")}: {formatOMR(s.approvedBaisa)} ·{" "}
                  {tFinance("alreadyReturned")}: {formatOMR(s.returnedBaisa)}
                </p>
                <p className="text-xl font-semibold text-[var(--accent)]">
                  {tFinance("remaining")}: {formatOMR(s.remainingBaisa)}
                </p>
                <p>
                  {tFinance("availableToPay")}: {formatOMR(s.payableBaisa)} ·{" "}
                  {tRentals("invoiceBalance")}: {formatOMR(s.balance)}
                </p>
              </article>
            ))}
        </section>
      )}
      <details className="print:hidden">
        <summary className="cursor-pointer text-lg">
          {fine
            ? tFinance("addFine", { title: moduleTitle })
            : tFinance("newPayment", { title: moduleTitle })}
        </summary>
        {options.length ? (
          <FinanceForm
            operation={fine ? "fine" : "payment"}
            kind={config.kind}
            bookings={options}
            previous={previous.map((p) => ({
              id: p.id,
              vehicleId: p.vehicleId,
              date: formatOmanDateTime(p.dateFrom).replace("T", " "),
              amount: formatOMR(p.amountBaisa),
              details: p.details,
            }))}
          />
        ) : (
          <p>{tFinance("noPermittedBookings")}</p>
        )}
      </details>
      {module === "payback" && can(actor, "finance", "approve") && (
        <details>
          <summary>{tFinance("approveRefundSummary")}</summary>
          <p>{tFinance("approveRefundNote")}</p>
          <FinanceForm
            operation="refund"
            bookings={rows
              .filter((r) => can(actor, "finance", "approve", r.rental.branchId))
              .map(bookingOption)}
          />
        </details>
      )}
      <form className="grid gap-3 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
        <label className="text-xs text-[var(--muted)]">
          {tCommon("search")}
          <input
            name="q"
            defaultValue={query.q}
            placeholder={tFinance("searchPlaceholder")}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          {tCommon("branch")}
          <select
            name="branch"
            defaultValue={branchFilter ?? ""}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">{tCommon("allBranches")}</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.code}
              </option>
            ))}
          </select>
        </label>
        {!fine && (
          <label className="text-xs text-[var(--muted)]">
            {tCommon("paymentMode")}
            <select
              name="method"
              defaultValue={methodFilter ?? ""}
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            >
              <option value="">{tCommon("allModes")}</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {translateStatus(tStatus, m)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-[var(--muted)]">
          {tFinance("fromLabel")}
          <input
            type="date"
            name="from"
            defaultValue={query.from}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          {tFinance("toLabel")}
          <input
            type="date"
            name="to"
            defaultValue={query.to}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
          >
            {tCommon("search")}
          </button>
          {(query.q || query.from || query.to || branchFilter || methodFilter) && (
            <Link
              href={`/${locale}/finance/${module}` as never}
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
            >
              {tCommon("clear")}
            </Link>
          )}
        </div>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr>
              {[
                { id: "booking", label: tFinance("bookingNumber") },
                { id: "customer", label: tCommon("customer") },
                { id: "vehicle", label: tCommon("vehicle") },
                { id: "registration", label: tCommon("registration") },
                { id: "amount", label: tCommon("amount") },
                { id: "date", label: tCommon("dateTimeOman") },
                { id: "method", label: tCommon("paymentMode") },
                { id: "user", label: tCommon("user") },
                { id: "branch", label: tCommon("branch") },
                { id: "record", label: tFinance("recordCol") },
              ].map((h) => (
                <th key={h.id} className="p-3 text-start">
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, PAGE_SIZE).map((p) => (
              <tr key={p.id} className="border-t border-[var(--edge)]">
                {[
                  p.booking,
                  p.customer,
                  p.vehicle,
                  p.registration,
                  formatOMR(p.amount),
                  formatOmanDateTime(p.date),
                  p.method === "—" ? "—" : translateStatus(tStatus, p.method),
                  p.user,
                  p.branch,
                ].map((v, i) => (
                  <td
                    key={
                      [
                        "booking",
                        "customer",
                        "vehicle",
                        "registration",
                        "amount",
                        "date",
                        "method",
                        "user",
                        "branch",
                      ][i]
                    }
                    className="p-3"
                  >
                    {v}
                  </td>
                ))}
                <td className="p-3">
                  <Link href={`/${locale}/finance/${module}/${p.id}`}>
                    {tCommon("view")} · {translateStatus(tStatus, p.kind)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-4">{tCommon("noRecords")}</p>}
      </div>
      <nav className="flex items-center justify-end gap-3 text-sm print:hidden">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
          >
            {tCommon("previous")}
          </Link>
        )}
        <span className="text-[var(--muted)]">{tCommon("pageNumber", { page })}</span>
        {list.length > PAGE_SIZE && (
          <Link
            href={href(page + 1)}
            className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
          >
            {tCommon("next")}
          </Link>
        )}
      </nav>
    </div>
  );
}
