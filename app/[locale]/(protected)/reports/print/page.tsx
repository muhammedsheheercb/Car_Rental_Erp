import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatOmanDateTimeDisplay } from "@/features/ledger/calculations";
import { formatPaymentModeLabel, REPORT_PRINT_MAX_ROWS } from "@/features/reports/definitions";
import { loadReport } from "@/features/reports/service";
import { documentSignature } from "@/features/signatures/service";
import { can, requireIdentity } from "@/lib/auth";

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
  const [actor, { locale }, query] = await Promise.all([requireIdentity(), params, searchParams]);
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

  const printedAt = formatOmanDateTimeDisplay(new Date());
  const selectedBranch = data.branches.find((b) => b.id === data.filters.branchId);
  const periodLabel =
    data.filters.from || data.filters.to
      ? `${data.filters.from || "Beginning"} to ${data.filters.to || "Present"}`
      : "All Dates";

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
          Back to Reports
        </Link>
        <p className="text-sm text-[var(--muted)]">
          A4 Print View · {data.definition.title} · {data.rows.length} row
          {data.rows.length === 1 ? "" : "s"}
          {data.truncated ? ` (capped at ${REPORT_PRINT_MAX_ROWS} of ${data.totalRows})` : ""}
        </p>
      </div>

      <article className="print-document" aria-label={`${data.definition.title} A4 print preview`}>
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>Oman Car Rental ERP · Official Report</p>
            <p>Sultanate of Oman · Currency: OMR</p>
          </div>
          <div className="document-heading-right">
            <h1>{data.definition.title}</h1>
            <p className="document-number">Report #{data.definition.number} of 12</p>
            <p>Period: {periodLabel} (Oman)</p>
            <p>Generated: {printedAt} Oman</p>
          </div>
        </div>

        <div className="document-body">
          <section>
            <h2>Applied Filters &amp; Scope</h2>
            <dl className="document-fields">
              <div>
                <dt>Branch</dt>
                <dd>
                  {selectedBranch
                    ? `${selectedBranch.name} (${selectedBranch.code})`
                    : "All Permitted Branches"}
                </dd>
              </div>
              <div>
                <dt>{data.definition.supportsStatus ? data.definition.statusLabel : "Status"}</dt>
                <dd>{data.filters.status === "ALL" ? "All" : data.filters.status}</dd>
              </div>
              <div>
                <dt>Payment Mode</dt>
                <dd>
                  {data.definition.supportsPaymentMode
                    ? data.filters.paymentMode === "ALL"
                      ? "All Modes"
                      : formatPaymentModeLabel(data.filters.paymentMode)
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt>Search Keyword</dt>
                <dd>{data.filters.q || "None"}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>Summary Totals</h2>
            <dl className="document-totals">
              {data.summary.map((card) => (
                <div key={card.label}>
                  <dt>{card.label}</dt>
                  <dd>{card.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2>
              {data.definition.title} ({data.rows.length}
              {data.truncated ? ` of ${data.totalRows}` : ""} records)
            </h2>
            {data.truncated && (
              <p className="document-remarks">
                Showing first {REPORT_PRINT_MAX_ROWS.toLocaleString("en-US")} of{" "}
                {data.totalRows.toLocaleString("en-US")} records. Narrow the date/branch filters or
                use CSV export to include every record.
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
                      {col.label}
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
                          <div>{cell.text}</div>
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
                      No records match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="document-signatures" aria-label="Authorization signatures">
          <div className="document-signature">
            <div className="document-signature-space" />
            <p className="document-signature-label">Reviewed / Approved By</p>
            <p>Management / Branch Supervisor</p>
          </div>
          <div className="document-signature">
            <div className="document-signature-space">
              {staffSignature?.src && (
                <>
                  {/* biome-ignore lint/performance/noImgElement: private signature embedded after reports:print check. */}
                  <img src={staffSignature.src} alt={`${actor.displayName} signature`} />
                </>
              )}
            </div>
            <p className="document-signature-label">Prepared By (Authorized Staff)</p>
            <p>{actor.displayName}</p>
          </div>
        </section>

        <footer className="document-footer">
          <span>
            {data.definition.title} · {periodLabel}
          </span>
          <span>
            Printed by: {actor.displayName} · {printedAt} Oman
          </span>
        </footer>
      </article>
    </div>
  );
}
