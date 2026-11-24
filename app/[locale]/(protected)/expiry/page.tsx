import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { branches, vehicleInsurance, vehicleRegistrations, vehicles } from "@/db/schema";
import { expiryStatus } from "@/features/maintenance/calculations";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { requirePermission } from "@/lib/auth";

const PAGE_SIZE = 15;
const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function ExpiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    branch?: string;
    docType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const actor = await requirePermission("fleet", "read");
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const q = query.q?.trim() ?? "";
  const status = query.status ?? "";
  const branchFilter = query.branch && UUID_RE.test(query.branch) ? query.branch : "";
  const docType = ["all", "mulkiya", "insurance"].includes(query.docType ?? "")
    ? (query.docType as "all" | "mulkiya" | "insurance")
    : "all";
  const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : "";
  const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : "";
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [policy, rows, branchOptions] = await Promise.all([
    fleetAlertSettings(),
    db
      .select({
        v: vehicles,
        branch: branches.name,
        insurance: vehicleInsurance.validUntil,
        mulkiya: vehicleRegistrations.mulkiyaExpiryDate,
      })
      .from(vehicles)
      .innerJoin(branches, eq(branches.id, vehicles.branchId))
      .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
      .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicles.isActive, true),
          actor.role === "SUPER_ADMIN" ? undefined : inArray(vehicles.branchId, actor.branchIds),
          branchFilter ? eq(vehicles.branchId, branchFilter) : undefined,
        ),
      ),
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

  const now = new Date();
  const typesToShow =
    docType === "mulkiya"
      ? (["mulkiya"] as const)
      : docType === "insurance"
        ? (["insurance"] as const)
        : (["mulkiya", "insurance"] as const);

  const combined = rows
    .flatMap((r) =>
      typesToShow.map((type) => {
        const expiryDate = r[type];
        return {
          key: `${r.v.id}-${type}`,
          documentLabel: type === "mulkiya" ? "Mulkiya" : "Insurance",
          vehicleNumber: r.v.vehicleNumber,
          registrationNumber: r.v.registrationNumber,
          branch: r.branch,
          expiryDate,
          ...expiryStatus(expiryDate, now, policy.expirySoonDays),
        };
      }),
    )
    .filter((item) => {
      if (status && item.status !== status) return false;
      if (from && (!item.expiryDate || item.expiryDate < from)) return false;
      if (to && (!item.expiryDate || item.expiryDate > to)) return false;
      if (
        q &&
        !`${item.vehicleNumber} ${item.registrationNumber} ${item.branch} ${item.documentLabel}`
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;
      return true;
    })
    .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));

  const total = combined.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const shown = combined.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (branchFilter) p.set("branch", branchFilter);
    if (docType !== "all") p.set("docType", docType);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("page", String(nextPage));
    return `/${locale}/expiry?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--accent)]">FLEET COMPLIANCE</p>
        <h1 className="mt-2 text-3xl font-semibold">Expiry</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Today in Oman: {formatOmanDateTime(now).slice(0, 10)} · Expiring Soon threshold:{" "}
          {policy.expirySoonDays} days. Documents remain valid through their expiry date.
        </p>
      </div>

      <form className="grid gap-3 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[var(--muted)]">
          Search
          <input
            name="q"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            defaultValue={q}
            placeholder="Vehicle / Registration / Branch"
            aria-label="Search expiry"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Branch
          <select
            name="branch"
            defaultValue={branchFilter}
            aria-label="Filter by branch"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">All branches</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Document type
          <select
            name="docType"
            defaultValue={docType}
            aria-label="Document type"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="all">All documents</option>
            <option value="mulkiya">Mulkiya</option>
            <option value="insurance">Insurance</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Expiry status
          <select
            name="status"
            defaultValue={status}
            aria-label="Expiry status"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">All statuses</option>
            {["Expired", "Expiring Soon", "Valid", "Not configured"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Expiry from
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Expiry to
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="submit"
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
          >
            Search / Filter
          </button>
          {(q || status || branchFilter || docType !== "all" || from || to) && (
            <Link
              href={`/${locale}/expiry` as never}
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-[var(--muted)]">
        {total} matching document record{total === 1 ? "" : "s"}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[var(--edge)] bg-[var(--surface)]">
        <table className="w-full min-w-[48rem] text-start text-sm">
          <thead className="bg-[var(--raised)] text-[var(--muted)]">
            <tr>
              {[
                "Vehicle",
                "Registration",
                "Document",
                "Expiry Date",
                "Days Remaining",
                "Branch",
                "Status",
              ].map((h) => (
                <th className="p-3 text-start text-xs font-medium uppercase tracking-wide" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-[var(--edge)] hover:bg-white/5">
                <td className="p-3 font-medium">{r.vehicleNumber}</td>
                <td className="p-3 font-mono text-xs">{r.registrationNumber}</td>
                <td className="p-3">{r.documentLabel}</td>
                <td className="p-3">{r.expiryDate ?? "—"}</td>
                <td className="p-3 font-semibold">{r.daysRemaining ?? "—"}</td>
                <td className="p-3">{r.branch}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${
                      r.status === "Expired"
                        ? "bg-red-500/20 text-red-200"
                        : r.status === "Expiring Soon"
                          ? "bg-amber-400/20 text-amber-200"
                          : "bg-white/10 text-[var(--ink)]"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-6 text-sm text-[var(--muted)]">No matching vehicles.</p>}
      </div>

      {total > PAGE_SIZE && (
        <nav aria-label="Expiry pages" className="flex items-center justify-end gap-3 text-sm">
          {safePage > 1 && (
            <Link
              href={pageHref(safePage - 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              Previous
            </Link>
          )}
          <span className="text-[var(--muted)]">
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages && (
            <Link
              href={pageHref(safePage + 1) as never}
              className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
