import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReportsControls } from "@/components/reports-controls";
import type { ReportBadgeTone, ReportSummaryCard } from "@/features/reports/definitions";
import { loadReport } from "@/features/reports/service";
import { can, requireIdentity } from "@/lib/auth";
import {
  translateReportColumn,
  translateReportSummary,
  translateSafe,
  translateStatus,
} from "@/lib/i18n-helpers";

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
  const [actor, { locale }, query, tReports, tCommon, tStatus, tActivity] = await Promise.all([
    requireIdentity(),
    params,
    searchParams,
    getTranslations("reports"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("activity"),
  ]);
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
  const slug = data.definition.slug;
  const reportTitle = translateSafe(tReports, `catalog.${slug}.title`, data.definition.title);
  const reportDescription = translateSafe(
    tReports,
    `catalog.${slug}.description`,
    data.definition.description,
  );

  const translateSummaryValue = (card: ReportSummaryCard) => {
    if (card.label !== "Visibility Scope") return card.value;
    if (card.value === "Super Admin") return tStatus("SUPER_ADMIN");
    if (card.value === "All Branches") return tCommon("allBranches");
    if (card.value === "Permitted Branches" || card.value === "Permitted Scope") {
      return tActivity("scopeBranchTitle");
    }
    if (card.value === "Own Activity") return tActivity("scopeSelfTitle");
    return card.value;
  };

  const translateSummaryDetail = (detail: string) => {
    const voidMatch = detail.match(/^(\d+) void excluded from OMR totals$/);
    if (voidMatch) return tReports("summaryDetails.voidExcludedDetail", { count: voidMatch[1] });
    const retCancelMatch = detail.match(/^(\d+) returned · (\d+) cancelled$/);
    if (retCancelMatch) {
      return tReports("summaryDetails.returnedCancelledDetail", {
        returned: retCancelMatch[1],
        cancelled: retCancelMatch[2],
      });
    }
    const bookingsMatch = detail.match(/^(\d+) non-cancelled bookings$/);
    if (bookingsMatch) {
      return tReports("summaryDetails.nonCancelledBookingsDetail", { count: bookingsMatch[1] });
    }
    const paybackMatch = detail.match(/^Paybacks\/reversals: (.+)$/);
    if (paybackMatch) {
      return tReports("summaryDetails.paybacksReversalsDetail", { amount: paybackMatch[1] });
    }
    const modeMatch = detail.match(/^Mode: (.+)$/);
    if (modeMatch) {
      return tReports("summaryDetails.modeDetail", {
        mode: translateStatus(tStatus, modeMatch[1]),
      });
    }
    return translateSafe(tReports, `summaryDetails.${detail.replaceAll(".", "")}`, detail);
  };

  const translateCellValue = (colKey: string, text: string, isBadge: boolean) => {
    if (!text || text === "—") return text;
    if (
      isBadge ||
      colKey === "status" ||
      colKey === "mode" ||
      colKey === "paidBy" ||
      colKey === "type" ||
      colKey === "direction" ||
      colKey === "serviceType"
    ) {
      return translateStatus(tStatus, text);
    }
    return text;
  };

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
          <p className="text-sm text-[var(--accent)]">
            {tReports("eyebrow", { number: data.definition.number })}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{reportTitle}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{reportDescription}</p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          {canExport && (
            <a
              href={exportHref}
              download
              className="min-h-11 content-center rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-4 text-sm font-medium text-[var(--ink)] hover:border-[var(--accent)]"
            >
              {tCommon("exportCsv")}
            </a>
          )}
          {canPrint && (
            <Link
              href={printHref as never}
              className="min-h-11 content-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
            >
              {tReports("printReport")}
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
        aria-label={tReports("summaryTotals")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {data.summary.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4"
          >
            <p className="text-xs text-[var(--muted)]">
              {translateReportSummary(tReports, card.label)}
            </p>
            <p
              className={`mt-1 font-mono text-xl font-semibold tabular-nums ${summaryValueClass(card.tone)}`}
            >
              {translateSummaryValue(card)}
            </p>
            {card.detail && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                {translateSummaryDetail(card.detail)}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Report Table */}
      <section className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{reportTitle}</h2>
            <p className="text-xs text-[var(--muted)]">
              {data.totalRows
                ? tReports("matchingCount", {
                    start: rangeStart,
                    end: rangeEnd,
                    total: data.totalRows,
                  })
                : tReports("zeroMatching")}{" "}
              · {tReports("allTimestampsOman")}
            </p>
          </div>
          <span className="text-xs text-[var(--muted)]">
            {tCommon("pageOf", { page: data.page, total: data.totalPages })} (
            {tCommon("perPage", { count: data.pageSize })})
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--edge)]">
          <table className="min-w-[60rem] w-full text-sm">
            <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                {data.columns.map((col) => (
                  <th key={col.key} className={`px-3 py-3 ${alignClass(col.align)}`}>
                    {translateReportColumn(tReports, col.label)}
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
                    const displayText = translateCellValue(
                      col.key,
                      cell.text,
                      Boolean(cell.badgeTone),
                    );
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
                            {displayText}
                          </span>
                        ) : cell.href ? (
                          <Link
                            href={cell.href as never}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {displayText}
                          </Link>
                        ) : (
                          <span>{displayText}</span>
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
              {tReports("noMatching", { title: reportTitle })}
            </p>
          )}
        </div>

        {data.totalPages > 1 && (
          <nav
            aria-label={reportTitle}
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span className="text-xs text-[var(--muted)]">
              {tCommon("showingRange", {
                start: rangeStart,
                end: rangeEnd,
                total: data.totalRows,
              })}
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={pageHref(data.page - 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  {tCommon("previous")}
                </Link>
              )}
              <span className="px-2 text-[var(--muted)]">
                {tCommon("pageOf", { page: data.page, total: data.totalPages })}
              </span>
              {data.page < data.totalPages && (
                <Link
                  href={pageHref(data.page + 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  {tCommon("next")}
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
