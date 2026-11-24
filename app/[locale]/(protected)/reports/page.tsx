import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportsControls } from "@/components/reports-controls";
import type { ReportBadgeTone, ReportSummaryCard } from "@/features/reports/definitions";
import { loadReport } from "@/features/reports/service";
import { can, requireIdentity } from "@/lib/auth";

function badgeClass(tone: ReportBadgeTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
    case "sky":
      return "border-sky-500/30 bg-sky-500/15 text-sky-200";
    case "amber":
      return "border-amber-500/30 bg-amber-500/15 text-amber-200";
    case "red":
      return "border-red-500/30 bg-red-500/15 text-red-200";
    case "violet":
      return "border-violet-500/30 bg-violet-500/15 text-violet-200";
    default:
      return "border-[var(--edge)] bg-white/10 text-[var(--ink)]";
  }
}

function summaryValueClass(tone: ReportSummaryCard["tone"]): string {
  switch (tone) {
    case "accent":
      return "text-[var(--accent)]";
    case "emerald":
      return "text-emerald-300";
    case "amber":
      return "text-amber-300";
    case "red":
      return "text-red-300";
    default:
      return "text-[var(--ink)]";
  }
}

function alignClass(align?: "start" | "center" | "end"): string {
  if (align === "end") return "text-end";
  if (align === "center") return "text-center";
  return "text-start";
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    report?: string;
    q?: string;
    branchId?: string;
    status?: string;
    paymentMode?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const [actor, { locale }, query] = await Promise.all([requireIdentity(), params, searchParams]);
  if (!can(actor, "reports", "read")) redirect(`/${locale}/forbidden`);

  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const data = await loadReport(
    actor,
    locale,
    {
      report: query.report,
      q: query.q,
      branchId: query.branchId,
      status: query.status,
      paymentMode: query.paymentMode,
      from: query.from,
      to: query.to,
      page: requestedPage,
    },
    "page",
  );

  const canPrint = can(actor, "reports", "print");
  const canExport = can(actor, "reports", "export");

  const buildQueryParams = (overrides: { page?: number; includeLocale?: boolean } = {}) => {
    const p = new URLSearchParams();
    p.set("report", data.filters.report);
    if (overrides.includeLocale) p.set("locale", locale);
    if (data.filters.q) p.set("q", data.filters.q);
    if (data.filters.branchId) p.set("branchId", data.filters.branchId);
    if (data.filters.status !== "ALL") p.set("status", data.filters.status);
    if (data.filters.paymentMode !== "ALL") p.set("paymentMode", data.filters.paymentMode);
    if (data.filters.from) p.set("from", data.filters.from);
    if (data.filters.to) p.set("to", data.filters.to);
    if (overrides.page && overrides.page > 1) p.set("page", String(overrides.page));
    return p.toString();
  };

  const pageHref = (page: number) => `/${locale}/reports?${buildQueryParams({ page })}`;
  const printHref = `/${locale}/reports/print?${buildQueryParams()}`;
  const exportHref = `/api/reports/export?${buildQueryParams({ includeLocale: true })}`;

  const rangeStart = data.totalRows ? (data.page - 1) * data.pageSize + 1 : 0;
  const rangeEnd = Math.min(data.totalRows, data.page * data.pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">REPORTS / #{data.definition.number} OF 12</p>
          <h1 className="mt-2 text-3xl font-semibold">{data.definition.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{data.definition.description}</p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          {canExport && (
            <a
              href={exportHref}
              download
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-4 text-sm font-medium text-[var(--ink)] hover:border-[var(--accent)]"
            >
              Export CSV
            </a>
          )}
          {canPrint && (
            <Link
              href={printHref as never}
              className="min-h-11 content-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
            >
              Print A4 Report
            </Link>
          )}
        </div>
      </div>

      <ReportsControls
        definition={data.definition}
        branches={data.branches}
        initialFilters={data.filters}
      />

      {/* Summary Totals */}
      <section
        aria-label="Report summary totals"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {data.summary.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
          >
            <p className="text-xs text-[var(--muted)]">{card.label}</p>
            <p
              className={`mt-1 font-mono text-xl font-semibold tabular-nums ${summaryValueClass(card.tone)}`}
            >
              {card.value}
            </p>
            {card.detail && <p className="mt-1 text-xs text-[var(--muted)]">{card.detail}</p>}
          </div>
        ))}
      </section>

      {/* Report Table */}
      <section className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{data.definition.title}</h2>
            <p className="text-xs text-[var(--muted)]">
              {data.totalRows
                ? `Showing ${rangeStart}–${rangeEnd} of ${data.totalRows} matching record${data.totalRows === 1 ? "" : "s"}`
                : "0 matching records"}{" "}
              · All timestamps in Oman time (Asia/Muscat)
            </p>
          </div>
          <span className="text-xs text-[var(--muted)]">
            Page {data.page} of {data.totalPages} ({data.pageSize} per page)
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--edge)]">
          <table className="min-w-[60rem] w-full text-sm">
            <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                {data.columns.map((col) => (
                  <th key={col.key} className={`px-3 py-3 ${alignClass(col.align)}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[var(--edge)] align-top transition-colors hover:bg-white/5"
                >
                  {data.columns.map((col) => {
                    const cell = row.cells[col.key] ?? { text: "—" };
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${alignClass(col.align)} ${
                          col.mono ? "font-mono text-xs tabular-nums" : ""
                        }`}
                      >
                        {cell.badgeTone ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium ${badgeClass(cell.badgeTone)}`}
                          >
                            {cell.text}
                          </span>
                        ) : cell.href ? (
                          <Link
                            href={cell.href as never}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {cell.text}
                          </Link>
                        ) : (
                          <span>{cell.text}</span>
                        )}
                        {cell.subtext && (
                          <p className="mt-0.5 font-sans text-[11px] text-[var(--muted)]">
                            {cell.subtext}
                          </p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rows.length && (
            <p className="p-8 text-sm text-[var(--muted)]">
              No records match the selected filters for {data.definition.title}.
            </p>
          )}
        </div>

        {data.totalPages > 1 && (
          <nav
            aria-label="Report pages"
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span className="text-xs text-[var(--muted)]">
              Showing {rangeStart}–{rangeEnd} of {data.totalRows}
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={pageHref(data.page - 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  Previous
                </Link>
              )}
              <span className="px-2 text-[var(--muted)]">
                Page {data.page} of {data.totalPages}
              </span>
              {data.page < data.totalPages && (
                <Link
                  href={pageHref(data.page + 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  Next
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
