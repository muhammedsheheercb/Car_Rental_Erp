import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { formatOmanDateTimeDisplay } from "@/features/ledger/calculations";
import { REPORT_PRINT_MAX_ROWS, type ReportSummaryCard } from "@/features/reports/definitions";
import { loadReport } from "@/features/reports/service";
import { documentSignature } from "@/features/signatures/service";
import { can, requireIdentity } from "@/lib/auth";
import {
  translateReportColumn,
  translateReportSummary,
  translateSafe,
  translateStatus,
} from "@/lib/i18n-helpers";

export default async function ReportsPrintPage({
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
  if (!can(actor, "reports", "read") || !can(actor, "reports", "print")) {
    redirect(`/${locale}/forbidden`);
  }

  const [data, staffSignature] = await Promise.all([
    loadReport(
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
      },
      "print",
    ),
    documentSignature(actor.id),
  ]);

  const slug = data.definition.slug;
  const reportTitle = translateSafe(tReports, `catalog.${slug}.title`, data.definition.title);
  const statusLabel = data.definition.supportsStatus
    ? translateSafe(tReports, `catalog.${slug}.statusLabel`, data.definition.statusLabel)
    : tCommon("status");

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

  const translateStatusFilterValue = (value: string) => {
    if (value === "ALL") return tCommon("all");
    if (slug === "daily-activity") {
      return translateSafe(tActivity, `categories.${value}`, value);
    }
    return translateStatus(tStatus, value);
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

  const printedAt = formatOmanDateTimeDisplay(new Date());
  const selectedBranch = data.branches.find((b) => b.id === data.filters.branchId);
  const periodLabel =
    data.filters.from || data.filters.to
      ? tReports("periodRange", {
          from: data.filters.from || tCommon("beginning"),
          to: data.filters.to || tCommon("present"),
        })
      : tCommon("allDates");

  const backParams = new URLSearchParams();
  backParams.set("report", data.filters.report);
  if (data.filters.q) backParams.set("q", data.filters.q);
  if (data.filters.branchId) backParams.set("branchId", data.filters.branchId);
  if (data.filters.status !== "ALL") backParams.set("status", data.filters.status);
  if (data.filters.paymentMode !== "ALL") backParams.set("paymentMode", data.filters.paymentMode);
  if (data.filters.from) backParams.set("from", data.filters.from);
  if (data.filters.to) backParams.set("to", data.filters.to);

  return (
    <div className="document-view">
      <div className="document-controls print:hidden">
        <PrintButton />
        <Link
          href={`/${locale}/reports?${backParams.toString()}` as never}
          className="rounded-lg border border-[var(--edge)] px-3 py-2 text-sm"
        >
          {tReports("backToReports")}
        </Link>
        <p className="text-sm text-[var(--muted)]">
          {tReports("printBarSummary", { title: reportTitle, count: data.rows.length })}
          {data.truncated
            ? tReports("printBarCapped", { limit: REPORT_PRINT_MAX_ROWS, total: data.totalRows })
            : ""}
        </p>
      </div>

      <article className="print-document" aria-label={reportTitle}>
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>{tReports("officialReportSubtitle")}</p>
            <p>{tReports("omanCurrency")}</p>
          </div>
          <div className="document-heading-right">
            <h1>{reportTitle}</h1>
            <p className="document-number">
              {tReports("reportNumber", { number: data.definition.number })}
            </p>
            <p>
              {tReports("period")}: {periodLabel} ({tCommon("omanTime")})
            </p>
            <p>
              {tReports("generated")}: {printedAt} {tCommon("omanTime")}
            </p>
          </div>
        </div>

        <div className="document-body">
          <section>
            <h2>{tReports("appliedFilters")}</h2>
            <dl className="document-fields">
              <div>
                <dt>{tCommon("branch")}</dt>
                <dd>
                  {selectedBranch
                    ? `${selectedBranch.name} (${selectedBranch.code})`
                    : tCommon("allPermittedBranches")}
                </dd>
              </div>
              <div>
                <dt>{statusLabel}</dt>
                <dd>{translateStatusFilterValue(data.filters.status)}</dd>
              </div>
              <div>
                <dt>{tCommon("paymentMode")}</dt>
                <dd>
                  {data.definition.supportsPaymentMode
                    ? data.filters.paymentMode === "ALL"
                      ? tCommon("allModes")
                      : translateStatus(tStatus, data.filters.paymentMode)
                    : tReports("notApplicable")}
                </dd>
              </div>
              <div>
                <dt>{tReports("searchKeyword")}</dt>
                <dd>{data.filters.q || tCommon("none")}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>{tReports("summaryTotals")}</h2>
            <dl className="document-totals">
              {data.summary.map((card) => (
                <div key={card.label}>
                  <dt>{translateReportSummary(tReports, card.label)}</dt>
                  <dd>{translateSummaryValue(card)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2>
              {data.truncated
                ? tReports("tableHeadingTruncated", {
                    title: reportTitle,
                    count: data.rows.length,
                    total: data.totalRows,
                  })
                : tReports("tableHeading", { title: reportTitle, count: data.rows.length })}
            </h2>
            {data.truncated && (
              <p className="document-remarks">
                {tReports("truncatedNotice", {
                  limit: REPORT_PRINT_MAX_ROWS.toLocaleString("en-US"),
                  total: data.totalRows.toLocaleString("en-US"),
                })}
              </p>
            )}
            <table className="document-table" style={{ fontSize: "7.5pt" }}>
              <thead>
                <tr>
                  {data.columns.map((col) => (
                    <th
                      key={col.key}
                      className={col.align === "end" ? "document-money" : undefined}
                    >
                      {translateReportColumn(tReports, col.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    {data.columns.map((col) => {
                      const cell = row.cells[col.key] ?? { text: "—" };
                      return (
                        <td
                          key={col.key}
                          className={col.align === "end" ? "document-money" : undefined}
                        >
                          <div>
                            {translateCellValue(col.key, cell.text, Boolean(cell.badgeTone))}
                          </div>
                          {cell.subtext && (
                            <div style={{ fontSize: "6.5pt", color: "#506176" }}>
                              {cell.subtext}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr>
                    <td colSpan={Math.max(1, data.columns.length)}>
                      {tReports("noMatchingGeneric")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="document-signatures" aria-label={tReports("preparedByStaff")}>
          <div className="document-signature">
            <div className="document-signature-space" />
            <p className="document-signature-label">{tReports("reviewedBy")}</p>
            <p>{tReports("managementSupervisor")}</p>
          </div>
          <div className="document-signature">
            <div className="document-signature-space">
              {staffSignature?.src && (
                <>
                  {/* biome-ignore lint/performance/noImgElement: private signature embedded after reports:print check. */}
                  <img src={staffSignature.src} alt={actor.displayName} />
                </>
              )}
            </div>
            <p className="document-signature-label">{tReports("preparedByStaff")}</p>
            <p>{actor.displayName}</p>
          </div>
        </section>

        <footer className="document-footer">
          <span>
            {reportTitle} · {periodLabel}
          </span>
          <span>
            {tReports("preparedByStaff")}: {actor.displayName} · {printedAt} {tCommon("omanTime")}
          </span>
        </footer>
      </article>
    </div>
  );
}
