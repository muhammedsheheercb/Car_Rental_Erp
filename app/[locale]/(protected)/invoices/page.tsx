import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { InvoiceForm } from "@/components/invoice-form";
import { db } from "@/db/client";
import { customers, invoices, rentals, vehicles } from "@/db/schema";
import { bookingRows } from "@/features/finance/queries";
import { omrInput } from "@/features/invoices/calculations";
import { invoiceBooking } from "@/features/invoices/queries";
import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePermission } from "@/lib/auth";
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
  const actor = await requirePermission("finance", "read");
  const { locale } = await params;
  const query = await searchParams;
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
    .limit(20)
    .offset((page - 1) * 20);
  const [count] = await db
    .select({ n: sql<number>`count(*)::integer` })
    .from(invoices)
    .innerJoin(rentals, eq(rentals.id, invoices.rentalId))
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .where(where);
  const allBookings = query.new || query.booking ? await bookingRows(actor) : [];
  const options = await Promise.all(
    allBookings
      .filter((r) => can(actor, "finance", "create", r.rental.branchId))
      .map((r) => invoiceBooking(r, actor)),
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
        <h1 className="text-3xl font-semibold">Invoices</h1>
        {can(actor, "finance", "create") && (
          <Link className="btn" href={`/${locale}/invoices?new=1` as never}>
            Add Invoice
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
          aria-label="Search invoices"
          placeholder="Invoice / Booking / Customer / Registration"
          defaultValue={query.q}
        />
        <select
          name="status"
          aria-label="Invoice status"
          className="input"
          defaultValue={query.status ?? ""}
        >
          <option value="">All statuses</option>
          <option>DRAFT</option>
          <option>FINALIZED</option>
          <option>VOID</option>
        </select>
        <label>
          From (Oman)
          <input className="input" type="date" name="from" defaultValue={query.from} />
        </label>
        <label>
          To (Oman)
          <input className="input" type="date" name="to" defaultValue={query.to} />
        </label>
        <button type="submit" className="btn">
          Search / Filter
        </button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Invoice",
                "Booking",
                "Customer",
                "Registration",
                "Date (Oman)",
                "Status",
                "Grand Total (OMR)",
                "Balance at issue (OMR)",
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
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
                <td className="p-3">{i.status}</td>
                <td className="p-3">{omrInput(i.grandTotalBaisa)}</td>
                <td className="p-3">{omrInput(i.balanceBaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No invoices found.</p>}
      <div className="flex gap-4">
        {page > 1 && <Link href={href(page - 1) as never}>Previous</Link>}
        <span>
          Page {page} · {count.n} invoices
        </span>
        {page * 20 < count.n && <Link href={href(page + 1) as never}>Next</Link>}
      </div>
    </div>
  );
}
