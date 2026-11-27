import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InvoiceForm } from "@/components/invoice-form";
import { db } from "@/db/client";
import { customers, invoices, rentals, vehicles } from "@/db/schema";
import { bookingRows } from "@/features/finance/queries";
import { omrInput } from "@/features/invoices/calculations";
import { invoiceBookingsBatch } from "@/features/invoices/queries";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePagePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";
export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    booking?: string;
    new?: string;
  }>;
}) {
  const { locale } = await params;
  const [actor, query, tInvoices, tCommon, tStatus] = await Promise.all([
    requirePagePermission(locale, "finance", "read"),
    searchParams,
    getTranslations("invoices"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const page = Math.min(100000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const date = (v?: string) => {
    try {
      return v ? parseOmanDateTime(`${v}T00:00`) : undefined;
    } catch {
      return undefined;
    }
  };
  const from = date(query.from);
  const to = date(query.to);
  const where = and(
    actor.role === "SUPER_ADMIN" ? undefined : inArray(invoices.branchId, actor.branchIds),
    query.q
      ? or(
          ilike(invoices.invoiceNumber, `%${query.q}%`),
          ilike(rentals.agreementNumber, `%${query.q}%`),
          ilike(customers.name, `%${query.q}%`),
          ilike(vehicles.registrationNumber, `%${query.q}%`),
        )
      : undefined,
    ["DRAFT", "FINALIZED", "VOID"].includes(query.status ?? "")
      ? eq(invoices.status, query.status as "DRAFT" | "FINALIZED" | "VOID")
      : undefined,
    from ? gte(invoices.createdAt, from) : undefined,
    to ? lt(invoices.createdAt, new Date(to.getTime() + 86400000)) : undefined,
  );
  const base = () =>
    db
      .select({
        invoice: invoices,
        booking: rentals.agreementNumber,
        customer: customers.name,
        registration: vehicles.registrationNumber,
      })
      .from(invoices)
      .innerJoin(rentals, eq(rentals.id, invoices.rentalId))
      .innerJoin(customers, eq(customers.id, rentals.customerId))
      .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId));
  const rows = await base()
    .where(where)
    .orderBy(desc(invoices.createdAt))
    .limit(15)
    .offset((page - 1) * 15);
  const [count] = await db
    .select({ n: sql<number>`count(*)::integer` })
    .from(invoices)
    .innerJoin(rentals, eq(rentals.id, invoices.rentalId))
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .where(where);
  const uuidRe = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const bookingIdFilter =
    !query.new && query.booking && uuidRe.test(query.booking) ? query.booking : undefined;
  const allBookings =
    query.new || query.booking
      ? await bookingRows(actor, bookingIdFilter ? { rentalId: bookingIdFilter } : undefined)
      : [];
  const options = await invoiceBookingsBatch(
    allBookings.filter((r) => can(actor, "finance", "create", r.rental.branchId)),
    actor,
  );
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const k of ["q", "status", "from", "to"] as const) if (query[k]) p.set(k, query[k]);
    p.set("page", String(n));
    return `/${locale}/invoices?${p}`;
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{tInvoices("title")}</h1>
        {can(actor, "finance", "create") && (
          <Link className="btn" href={`/${locale}/invoices?new=1` as never}>
            {tInvoices("addInvoice")}
          </Link>
        )}
      </div>
      {(query.new || query.booking) && (
        <InvoiceForm bookings={options} initialBooking={query.booking} />
      )}
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          className="input"
          name="q"
          aria-label={tCommon("search")}
          placeholder={tInvoices("searchPlaceholder")}
          defaultValue={query.q}
        />
        <select
          name="status"
          aria-label={tCommon("status")}
          className="input"
          defaultValue={query.status ?? ""}
        >
          <option value="">{tCommon("allStatuses")}</option>
          <option value="DRAFT">{tStatus("DRAFT")}</option>
          <option value="FINALIZED">{tStatus("FINALIZED")}</option>
          <option value="VOID">{tStatus("VOID")}</option>
        </select>
        <label>
          {tCommon("fromDate")}
          <input className="input" type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          {tCommon("toDate")}
          <input className="input" type="date" name="to" defaultValue={query.to} />
        </label>
        <button type="submit" className="btn">
          {tCommon("searchFilter")}
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            <tr>
              {[
                { id: "invoice", label: tInvoices("invoiceCol") },
                { id: "booking", label: tInvoices("bookingCol") },
                { id: "customer", label: tCommon("customer") },
                { id: "registration", label: tCommon("registration") },
                { id: "date", label: tCommon("dateTimeOman") },
                { id: "status", label: tCommon("status") },
                { id: "total", label: tInvoices("grandTotalCol") },
                { id: "balance", label: tInvoices("balanceAtIssueCol") },
              ].map((h) => (
                <th className="p-3 text-start" key={h.id}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ invoice: i, booking, customer, registration }) => (
              <tr key={i.id} className="border-t border-[var(--edge)]">
                <td className="p-3">
                  <Link className="underline" href={`/${locale}/invoices/${i.id}` as never}>
                    {i.invoiceNumber}
                  </Link>
                </td>
                <td className="p-3">{booking}</td>
                <td className="p-3">{customer}</td>
                <td className="p-3">{registration}</td>
                <td className="p-3">{formatOmanDateTime(i.createdAt).replace("T", " ")}</td>
                <td className="p-3">{translateStatus(tStatus, i.status)}</td>
                <td className="p-3">{omrInput(i.grandTotalBaisa)}</td>
                <td className="p-3">{omrInput(i.balanceBaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>{tInvoices("noInvoices")}</p>}
      <div className="flex items-center justify-end gap-3 text-sm">
        {page > 1 && (
          <Link
            href={href(page - 1) as never}
            className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
          >
            {tCommon("previous")}
          </Link>
        )}
        <span className="text-[var(--muted)]">
          {tCommon("pageOf", { page, total: Math.max(1, Math.ceil(count.n / 15)) })} ·{" "}
          {tInvoices("invoicesCount", { count: count.n })}
        </span>
        {page * 15 < count.n && (
          <Link
            href={href(page + 1) as never}
            className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
          >
            {tCommon("next")}
          </Link>
        )}
      </div>
    </div>
  );
}
