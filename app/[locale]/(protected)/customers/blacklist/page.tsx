import { desc, eq } from "drizzle-orm";
import { BlacklistPicker } from "@/components/blacklist-picker";
import { UnblacklistButton } from "@/components/unblacklist-button";
import { db } from "@/db/client";
import { customerBlacklist, customers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
export default async function BlacklistPage() {
  await requirePermission("customers", "read");
  const rows = await db
    .select({
      id: customerBlacklist.id,
      reason: customerBlacklist.reason,
      active: customerBlacklist.isActive,
      startsAt: customerBlacklist.startsAt,
      endsAt: customerBlacklist.endsAt,
      name: customers.name,
      number: customers.customerNumber,
    })
    .from(customerBlacklist)
    .innerJoin(customers, eq(customers.id, customerBlacklist.customerId))
    .where(eq(customerBlacklist.isActive, true))
    .orderBy(desc(customerBlacklist.createdAt));
  return (
    <div>
      <p className="text-sm text-[var(--accent)]">CUSTOMERS</p>
      <h1 className="mt-2 text-3xl font-semibold">Blacklist register</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Blacklist entries are retained for audit history; deactivation never deletes a record.
      </p>
      <BlacklistPicker />
      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--edge)]">
        <table className="min-w-[42rem] w-full text-sm">
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 text-start">Customer</th>
              <th className="px-4 py-3 text-start">Reason</th>
              <th className="px-4 py-3 text-start">Dates</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--edge)]">
                <td className="px-4 py-3">
                  {row.name}
                  <p className="font-mono text-xs text-[var(--muted)]">{row.number}</p>
                </td>
                <td className="break-words px-4 py-3">{row.reason}</td>
                <td className="px-4 py-3">
                  {row.startsAt ?? "—"} – {row.endsAt ?? "—"}
                </td>
                <td className="px-4 py-3 text-center">{row.active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-3 text-center">
                  {row.active && <UnblacklistButton id={row.id} name={row.name} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
