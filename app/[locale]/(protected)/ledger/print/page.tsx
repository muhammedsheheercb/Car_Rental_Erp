import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatOmanDateTimeDisplay } from "@/features/ledger/calculations";
import { loadCustomerLedger } from "@/features/ledger/service";
import { formatOMR } from "@/features/rentals/calculations";
import { documentSignature } from "@/features/signatures/service";
import { can, requirePermission } from "@/lib/auth";

export default async function CustomerLedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ customerId?: string; from?: string; to?: string; type?: string }>;
}) {
  const [actor, { locale }, query] = await Promise.all([
    requirePermission("customers", "read"),
    params,
    searchParams,
  ]);

  if (
    !can(actor, "finance", "read") ||
    (!can(actor, "finance", "print") && !can(actor, "customers", "print"))
  ) {
    redirect(`/${locale}/forbidden`);
  }

  const customerId = query.customerId?.trim() ?? "";
  if (!customerId) notFound();

  const [data, staffSignature] = await Promise.all([
    loadCustomerLedger(customerId, actor, {
      from: query.from,
      to: query.to,
      type: query.type,
      page: 1,
    }),
    documentSignature(actor.id),
  ]);

  if (!data) notFound();

  const printedAt = formatOmanDateTimeDisplay(new Date());
  const periodLabel =
    data.filters.from || data.filters.to
      ? `${data.filters.from || "Beginning"} to ${data.filters.to || "Present"}`
      : "All Dates";
  const typeLabel =
    data.filters.type === "ALL" ? "All Transactions" : data.filters.type.replaceAll("_", " ");

  const backParams = new URLSearchParams();
  backParams.set("customerId", data.customer.id);
  if (data.filters.from) backParams.set("from", data.filters.from);
  if (data.filters.to) backParams.set("to", data.filters.to);
  if (data.filters.type !== "ALL") backParams.set("type", data.filters.type);

  return (
    <div className="document-view">
      <div className="document-controls print:hidden">
        <PrintButton />
        <Link
          href={`/${locale}/ledger?${backParams.toString()}` as never}
          className="rounded-lg border border-[var(--edge)] px-3 py-2 text-sm"
        >
          Back to Ledger
        </Link>
        <p className="text-sm text-[var(--muted)]">
          A4 Customer Ledger Statement · {data.ledger.filteredRows.length} transaction
          {data.ledger.filteredRows.length === 1 ? "" : "s"} · Oman time
        </p>
      </div>

      <article className="print-document" aria-label="Customer Ledger Statement print preview">
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>Customer Account &amp; Financial Ledger</p>
            <p>Sultanate of Oman · Currency: OMR</p>
          </div>
          <div className="document-heading-right">
            <h1>Customer Ledger Statement</h1>
            <p className="document-number">{data.customer.customerNumber}</p>
            <p>
              Period: {periodLabel} · {typeLabel}
            </p>
            <p>Generated: {printedAt} Oman</p>
          </div>
        </div>

        <div className="document-body">
          <section>
            <h2>Customer Profile &amp; Identity Summary</h2>
            <dl className="document-fields">
              <div>
                <dt>Customer Name</dt>
                <dd>{data.customer.name}</dd>
              </div>
              <div>
                <dt>Account Status</dt>
                <dd>
                  {data.blacklist
                    ? `Blacklisted (${data.blacklist.reason})`
                    : data.customer.isActive
                      ? "Active"
                      : "Inactive"}
                </dd>
              </div>
              <div>
                <dt>Mobile / Email</dt>
                <dd>
                  {data.customer.mobile}
                  {data.customer.email ? ` · ${data.customer.email}` : ""}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{data.customer.address}</dd>
              </div>
              <div>
                <dt>Driving Licence / Expiry</dt>
                <dd>
                  {data.customer.drivingLicenceNumber} ({data.customer.drivingLicenceExpiry})
                </dd>
              </div>
              <div>
                <dt>Civil ID / Expiry</dt>
                <dd>
                  {data.customer.civilIdNumber
                    ? `${data.customer.civilIdNumber} (${data.customer.civilIdExpiry ?? "—"})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Passport / Expiry</dt>
                <dd>
                  {data.customer.passportNumber
                    ? `${data.customer.passportNumber} (${data.customer.passportExpiry ?? "—"})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Visa / Sponsor</dt>
                <dd>
                  {[data.customer.visaNumber, data.customer.sponsorDetails]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>Account Summary — OMR</h2>
            <dl className="document-totals">
              <div>
                <dt>Total Debits (Charges)</dt>
                <dd>{formatOMR(data.financials.totalDebitsBaisa)}</dd>
              </div>
              <div>
                <dt>Total Credits (Payments)</dt>
                <dd>{formatOMR(data.financials.totalCreditsBaisa)}</dd>
              </div>
              <div>
                <dt>Advance Payments ({data.financials.advanceCount})</dt>
                <dd>{formatOMR(data.financials.advancesBaisa)}</dd>
              </div>
              <div>
                <dt>Receipts Collected ({data.financials.receiptCount})</dt>
                <dd>{formatOMR(data.financials.receiptsBaisa)}</dd>
              </div>
              <div>
                <dt>Active Invoices ({data.financials.activeInvoiceCount})</dt>
                <dd>{formatOMR(data.financials.invoicedBaisa)}</dd>
              </div>
              <div>
                <dt>
                  Fines &amp; Additional Charges (
                  {data.financials.fineCount + data.financials.extraChargeCount})
                </dt>
                <dd>{formatOMR(data.financials.finesAndChargesBaisa)}</dd>
              </div>
              <div>
                <dt>Paybacks ({data.financials.paybackCount})</dt>
                <dd>{formatOMR(data.financials.paybacksBaisa)}</dd>
              </div>
              <div>
                <dt>Total Outstanding Balance</dt>
                <dd>{formatOMR(data.financials.outstandingBalanceBaisa)}</dd>
              </div>
            </dl>
          </section>

          {!!data.bookings.length && (
            <section>
              <h2>Vehicles &amp; Bookings Summary ({data.bookings.length})</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Agreement</th>
                    <th>Vehicle / Reg</th>
                    <th>Out / Return (Oman)</th>
                    <th>Status</th>
                    <th className="document-money">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.agreementNumber}</td>
                      <td>
                        {b.brandName} {b.modelName} ({b.registrationNumber})
                      </td>
                      <td>
                        {formatOmanDateTimeDisplay(b.startsAt)} —{" "}
                        {formatOmanDateTimeDisplay(b.actualReturnAt ?? b.expectedReturnAt)}
                      </td>
                      <td>{b.status}</td>
                      <td className="document-money">{formatOMR(b.totalBaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h2>
              Chronological Transaction Ledger ({data.ledger.filteredRows.length} entries ·{" "}
              {periodLabel})
            </h2>
            <table className="document-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="document-money">Debit</th>
                  <th className="document-money">Credit</th>
                  <th className="document-money">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.filters.from && (
                  <tr>
                    <td>Before {data.filters.from}</td>
                    <td>Opening</td>
                    <td>—</td>
                    <td>Opening balance brought forward</td>
                    <td className="document-money">—</td>
                    <td className="document-money">—</td>
                    <td className="document-money">{formatOMR(data.ledger.openingBalanceBaisa)}</td>
                  </tr>
                )}
                {data.ledger.filteredRows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatOmanDateTimeDisplay(entry.createdAt)}</td>
                    <td>{entry.displayLabel}</td>
                    <td>
                      {[entry.agreementNumber, entry.receiptNumber].filter(Boolean).join(" / ") ||
                        "—"}
                    </td>
                    <td>{entry.description}</td>
                    <td className="document-money">
                      {entry.debitBaisa > 0 ? formatOMR(entry.debitBaisa) : "—"}
                    </td>
                    <td className="document-money">
                      {entry.creditBaisa > 0 ? formatOMR(entry.creditBaisa) : "—"}
                    </td>
                    <td className="document-money">{formatOMR(entry.runningBalanceBaisa)}</td>
                  </tr>
                ))}
                {!data.ledger.filteredRows.length && (
                  <tr>
                    <td colSpan={7}>No ledger transactions in the selected period.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="document-signatures" aria-label="Signature positions">
          <div className="document-signature">
            <div className="document-signature-space" />
            <p className="document-signature-label">Customer Acknowledgement</p>
            <p>{data.customer.name}</p>
          </div>
          <div className="document-signature">
            <div className="document-signature-space">
              {staffSignature?.src && (
                <>
                  {/* biome-ignore lint/performance/noImgElement: private signature embedded after print permission check. */}
                  <img src={staffSignature.src} alt={`${actor.displayName} signature`} />
                </>
              )}
            </div>
            <p className="document-signature-label">Authorized Staff Signature</p>
            <p>{actor.displayName}</p>
          </div>
        </section>

        <footer className="document-footer">
          <span>
            Customer: {data.customer.name} ({data.customer.customerNumber})
          </span>
          <span>
            Printed by: {actor.displayName} · {printedAt} Oman
          </span>
        </footer>
      </article>
    </div>
  );
}
