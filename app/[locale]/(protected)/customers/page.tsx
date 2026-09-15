import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { CustomerActions } from "@/components/customer-actions";
import { MasterSearch } from "@/components/master-search";
import { db } from "@/db/client";
import { customerBlacklist, customers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export default async function CustomersPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
  params: Promise<{ locale: string }>;
}) {
  await requirePermission("customers", "read");
  const [{ q = "", page = "1" }, { locale }] = await Promise.all([searchParams, params]);
  const where = q
    ? or(
        ilike(customers.name, `%${q}%`),
        ilike(customers.mobile, `%${q}%`),
        ilike(customers.customerNumber, `%${q}%`),
      )
    : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        customerNumber: customers.customerNumber,
        mobile: customers.mobile,
        isActive: customers.isActive,
        blacklistId: customerBlacklist.id,
        blacklistReason: customerBlacklist.reason,
      })
      .from(customers)
      .leftJoin(
        customerBlacklist,
        and(eq(customerBlacklist.customerId, customers.id), eq(customerBlacklist.isActive, true)),
      )
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(15)
      .offset((Math.max(1, Number(page)) - 1) * 15),
    db.select({ count: count() }).from(customers).where(where),
  ]);
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--accent)]">CUSTOMERS</p>
          <h1 className="mt-2 text-3xl font-semibold">Customers</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${locale}/customers/blacklist`}
            className="min-h-11 rounded-lg border border-[var(--edge)] px-3 py-3 text-sm"
          >
            Blacklist
          </Link>
          <Link
            href={`/${locale}/customers/new`}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-3 py-3 text-sm font-semibold text-black"
          >
            New customer
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <MasterSearch initialValue={q} placeholder="Search customer, number, or mobile" />
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{total[0]?.count ?? 0} customers</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--edge)]">
        <table className="min-w-[68rem] w-full table-fixed text-sm">
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th className="w-[35%] px-4 py-3 text-start">Customer</th>
              <th className="px-4 py-3 text-start">Mobile</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="w-[29rem] px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id} className="border-t border-[var(--edge)]">
                <td className="px-4 py-3">
                  <p className="font-medium">{customer.name}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{customer.customerNumber}</p>
                </td>
                <td className="px-4 py-3">{customer.mobile}</td>
                <td className="overflow-x-auto px-4 py-3 text-center [overscroll-behavior-inline:contain]">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs ${customer.blacklistId ? "bg-red-400/15 text-red-200" : "bg-[var(--surface)]"}`}
                  >
                    {customer.blacklistId
                      ? "Blacklisted"
                      : customer.isActive
                        ? "Active"
                        : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <CustomerActions
                    id={customer.id}
                    name={customer.name}
                    number={customer.customerNumber}
                    active={customer.isActive}
                    blacklistId={customer.blacklistId}
                    blacklistReason={customer.blacklistReason}
                    mobile={customer.mobile}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-[var(--muted)]">No customers found.</p>}
      </div>
    </>
  );
}
