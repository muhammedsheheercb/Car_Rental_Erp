import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FinanceForm } from "@/components/finance-form";
import { db } from "@/db/client";
import { branches, customers, financeFines, payments, rentals, users, vehicles } from "@/db/schema";
import { bookingOption, bookingRows, financeModules } from "@/features/finance/queries";
import { totals } from "@/features/finance/service";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePermission } from "@/lib/auth";
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
  const actor = await requirePermission("finance", "read");
  const query = await searchParams;
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
  const conditions = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(table.branchId, actor.branchIds),
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
  const list = await db
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
    .limit(21)
    .offset((page - 1) * 20);
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
    `/${locale}/finance/${module}?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}), page: String(n) })}`;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{config.title}</h1>
      <nav className="flex flex-wrap gap-4 print:hidden">
        {Object.entries(financeModules).map(([key, c]) => (
          <Link key={key} href={`/${locale}/finance/${key}`}>
            {c.title}
          </Link>
        ))}
      </nav>
      {fine && (
        <p>
          {config.kind === "LEGAL"
            ? "Legal fine records do not change rental totals or invoice balances."
            : "Select the vehicle's booking from rental history. Its customer is filled automatically; fine dates must match that booking."}
        </p>
      )}
      {module === "payback" && (
        <section className="space-y-3">
          <h2 className="text-xl">Payback balances</h2>
          {payableRows
            .filter((p) => p.summary.approvedBaisa || p.summary.balance < 0)
            .map(({ row, summary: s }) => (
              <article key={row.rental.id} className="rounded-xl border border-[var(--edge)] p-4">
                <p>
                  {row.rental.agreementNumber} · {row.customer.name}
                </p>
                <p>
                  Amount due back: {formatOMR(s.approvedBaisa)} · Already returned:{" "}
                  {formatOMR(s.returnedBaisa)}
                </p>
                <p className="text-xl font-semibold text-[var(--accent)]">
                  Remaining: {formatOMR(s.remainingBaisa)}
                </p>
                <p>
                  Available to pay: {formatOMR(s.payableBaisa)} · Invoice balance:{" "}
                  {formatOMR(s.balance)}
                </p>
              </article>
            ))}
        </section>
      )}
      <details className="print:hidden">
        <summary className="cursor-pointer text-lg">
          {fine
            ? `Add ${config.title}`
            : `New ${config.title === "Receipts" ? "Receipt" : config.title} Payment`}
        </summary>
        {options.length ? (
          <FinanceForm
            operation={fine ? "fine" : "payment"}
            kind={config.kind}
            bookings={options}
            previous={previous.map((p) => ({
              id: p.id,
              vehicleId: p.vehicleId,
              text: `${formatOmanDateTime(p.dateFrom)} · ${formatOMR(p.amountBaisa)} · ${p.details}`,
            }))}
          />
        ) : (
          <p>No permitted bookings available.</p>
        )}
      </details>
      {module === "payback" && can(actor, "finance", "approve") && (
        <details>
          <summary>Approve refund entitlement / adjustment</summary>
          <p>
            Approval may post a credit adjustment. Enter the additional approved refund, with a
            reason.
          </p>
          <FinanceForm
            operation="refund"
            bookings={rows
              .filter((r) => can(actor, "finance", "approve", r.rental.branchId))
              .map(bookingOption)}
          />
        </details>
      )}
      <form className="flex flex-wrap items-end gap-3 print:hidden">
        <label>
          Search
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Booking / customer / registration / receipt"
          />
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={query.to} />
        </label>
        <button type="submit" className="rounded-lg border p-3">
          Search
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Booking Number",
                "Customer",
                "Vehicle",
                "Registration",
                "Amount",
                "Date (Oman)",
                "Payment Mode",
                "User",
                "Branch",
                "Record",
              ].map((h) => (
                <th key={h} className="p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 20).map((p) => (
              <tr key={p.id} className="border-t border-[var(--edge)]">
                {[
                  p.booking,
                  p.customer,
                  p.vehicle,
                  p.registration,
                  formatOMR(p.amount),
                  formatOmanDateTime(p.date),
                  p.method,
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
                  <Link href={`/${locale}/finance/${module}/${p.id}`}>View · {p.kind}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-4">No records found.</p>}
      </div>
      <nav className="flex gap-4 print:hidden">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {list.length > 20 && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </div>
  );
}
