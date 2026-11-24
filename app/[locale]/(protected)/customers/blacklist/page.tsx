import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlacklistControls } from "@/components/blacklist-controls";
import { BlacklistPicker } from "@/components/blacklist-picker";
import { BlacklistRowActions } from "@/components/blacklist-row-actions";
import { db } from "@/db/client";
import { customerBlacklist, customers, users } from "@/db/schema";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { can, requirePermission } from "@/lib/auth";

const PAGE_SIZE = 15;

export default async function BlacklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const actor = await requirePermission("customers", "read");
  const [{ locale }, query, tBl, tCust, tCommon, tStatus] = await Promise.all([
    params,
    searchParams,
    getTranslations("customers.blacklistPage"),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const q = query.q?.trim() ?? "";
  const status = ["all", "active", "removed"].includes(query.status ?? "")
    ? (query.status as "all" | "active" | "removed")
    : "all";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const searchWhere = q
    ? or(
        ilike(customers.name, `%${q}%`),
        ilike(customers.customerNumber, `%${q}%`),
        ilike(customers.mobile, `%${q}%`),
        ilike(customerBlacklist.reason, `%${q}%`),
        ilike(customerBlacklist.description, `%${q}%`),
      )
    : undefined;

  const statusWhere =
    status === "active"
      ? eq(customerBlacklist.isActive, true)
      : status === "removed"
        ? eq(customerBlacklist.isActive, false)
        : undefined;

  const where = and(searchWhere, statusWhere);

  const [rows, totalRows, activeCountRows, removedCountRows] = await Promise.all([
    db
      .select({
        id: customerBlacklist.id,
        customerId: customerBlacklist.customerId,
        reason: customerBlacklist.reason,
        description: customerBlacklist.description,
        isActive: customerBlacklist.isActive,
        startsAt: customerBlacklist.startsAt,
        endsAt: customerBlacklist.endsAt,
        createdAt: customerBlacklist.createdAt,
        deactivatedAt: customerBlacklist.deactivatedAt,
        customerName: customers.name,
        customerNumber: customers.customerNumber,
        customerMobile: customers.mobile,
        recordedBy: users.displayName,
      })
      .from(customerBlacklist)
      .innerJoin(customers, eq(customers.id, customerBlacklist.customerId))
      .leftJoin(users, eq(users.id, customerBlacklist.actorId))
      .where(where)
      .orderBy(desc(customerBlacklist.isActive), desc(customerBlacklist.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: count() })
      .from(customerBlacklist)
      .innerJoin(customers, eq(customers.id, customerBlacklist.customerId))
      .where(where),
    db
      .select({ count: count() })
      .from(customerBlacklist)
      .where(eq(customerBlacklist.isActive, true)),
    db
      .select({ count: count() })
      .from(customerBlacklist)
      .where(eq(customerBlacklist.isActive, false)),
  ]);

  const total = totalRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canUpdate = can(actor, "customers", "update");

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    p.set("page", String(nextPage));
    return `/${locale}/customers/blacklist?${p.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">{tCust("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{tBl("title")}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{tBl("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/customers` as never}
            className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm"
          >
            {tBl("allCustomers")}
          </Link>
          {canUpdate && <BlacklistPicker />}
        </div>
      </div>

      <BlacklistControls
        total={total}
        activeCount={activeCountRows[0]?.count ?? 0}
        removedCount={removedCountRows[0]?.count ?? 0}
      />

      <div className="mt-4 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain]">
        <table className="min-w-[64rem] w-full table-fixed text-start text-sm">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[27%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide">
                {tCommon("customer")}
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide">
                {tBl("reasonDescCol")}
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide">
                {tBl("effectivePeriodCol")}
              </th>
              <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide">
                {tBl("recordedCol")}
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide">
                {tCommon("status")}
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide">
                {tCommon("actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[var(--edge)] align-middle hover:bg-white/5"
              >
                <td className="px-4 py-3">
                  <p className="break-words font-medium">{row.customerName}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{row.customerNumber}</p>
                  <p className="text-xs text-[var(--muted)]">{row.customerMobile}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="break-words font-medium">{row.reason}</p>
                  <p className="mt-1 line-clamp-2 break-words text-xs text-[var(--muted)]">
                    {row.description}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.startsAt || row.endsAt
                    ? `${row.startsAt ?? "—"} – ${row.endsAt ?? "—"}`
                    : tBl("indefinite")}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  <p className="text-[var(--ink)]">
                    {formatOmanDateTime(row.createdAt).replace("T", " ")}
                  </p>
                  <p>{row.recordedBy ?? tCommon("system")}</p>
                  {row.deactivatedAt && (
                    <p className="mt-1">
                      {tBl("removedLabel")}:{" "}
                      {formatOmanDateTime(row.deactivatedAt).replace("T", " ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.isActive ? "bg-red-400/20 text-red-200" : "bg-white/10 text-[var(--muted)]"}`}
                  >
                    {row.isActive ? tStatus("ACTIVE") : tStatus("REMOVED")}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <BlacklistRowActions
                    entry={{
                      id: row.id,
                      customerId: row.customerId,
                      customerName: row.customerName,
                      customerNumber: row.customerNumber,
                      reason: row.reason,
                      description: row.description,
                      startsAt: row.startsAt,
                      endsAt: row.endsAt,
                      isActive: row.isActive,
                    }}
                    canUpdate={canUpdate}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-8 text-sm text-[var(--muted)]">{tBl("noRecords")}</p>}
      </div>

      {total > PAGE_SIZE && (
        <nav aria-label={tBl("title")} className="mt-4 flex items-center justify-end gap-3 text-sm">
          {page > 1 && (
            <Link
              href={pageHref(page - 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              {tCommon("previous")}
            </Link>
          )}
          <span className="text-[var(--muted)]">
            {tCommon("pageOf", { page, total: totalPages })}
          </span>
          {page < totalPages && (
            <Link
              href={pageHref(page + 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              {tCommon("next")}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
