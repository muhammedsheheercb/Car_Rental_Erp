import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { formatOmanDateTimeDisplay } from "@/features/ledger/calculations";
import { loadCustomerLedger } from "@/features/ledger/service";
import { formatOMR } from "@/features/rentals/calculations";
import { documentSignature } from "@/features/signatures/service";
import { can, requirePagePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

export default async function CustomerLedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ customerId?: string; from?: string; to?: string; type?: string }>;
}) {
  const { locale } = await params;
  const [actor, query, tLedger, tCust, tCommon, tStatus, tReports] = await Promise.all([
    requirePagePermission(locale, "customers", "read"),
    searchParams,
    getTranslations("ledger"),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("reports"),
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
      ? `${data.filters.from || tCommon("beginning")} — ${data.filters.to || tCommon("present")}`
      : tCommon("allDates");
  const typeLabel =
    data.filters.type === "ALL"
      ? tLedger("allTransactionTypes")
      : translateStatus(tStatus, data.filters.type);

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
          {tLedger("backToLedger")}
        </Link>
        <p className="text-sm text-[var(--muted)]">
          {tLedger("statementTitle")} ·{" "}
          {tCommon("recordsCount", { count: data.ledger.filteredRows.length })} ·{" "}
          {tCommon("omanTime")}
        </p>
      </div>

      <article className="print-document" aria-label={tLedger("statementTitle")}>
        <div className="document-heading">
          <div>
            <div className="document-brand">
              MUSCAT <span>CARS</span>
            </div>
            <p>{tLedger("title")}</p>
            <p>{tReports("omanCurrency")}</p>
          </div>
          <div className="document-heading-right">
            <h1>{tLedger("statementTitle")}</h1>
            <p className="document-number">{data.customer.customerNumber}</p>
            <p>
              {tReports("period")}: {periodLabel} · {typeLabel}
            </p>
            <p>
              {tReports("generated")}: {printedAt} ({tCommon("omanTime")})
            </p>
          </div>
        </div>

        <div className="document-body">
          <section>
            <h2>{tCommon("customer")}</h2>
            <dl className="document-fields">
              <div>
                <dt>{tCommon("customer")}</dt>
                <dd>{data.customer.name}</dd>
              </div>
              <div>
                <dt>{tCommon("status")}</dt>
                <dd>
                  {data.blacklist
                    ? `${tStatus("BLACKLISTED")} (${data.blacklist.reason})`
                    : data.customer.isActive
                      ? tStatus("ACTIVE")
                      : tStatus("INACTIVE")}
                </dd>
              </div>
              <div>
                <dt>
                  {tCust("mobileCol")} / {tCust("email")}
                </dt>
                <dd>
                  {data.customer.mobile}
                  {data.customer.email ? ` · ${data.customer.email}` : ""}
                </dd>
              </div>
              <div>
                <dt>{tCust("address")}</dt>
                <dd>{data.customer.address}</dd>
              </div>
              <div>
                <dt>{tCust("drivingLicence")}</dt>
                <dd>
                  {data.customer.drivingLicenceNumber} ({data.customer.drivingLicenceExpiry})
                </dd>
              </div>
              <div>
                <dt>{tCust("civilId")}</dt>
                <dd>
                  {data.customer.civilIdNumber
                    ? `${data.customer.civilIdNumber} (${data.customer.civilIdExpiry ?? "—"})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{tCust("passport")}</dt>
                <dd>
                  {data.customer.passportNumber
                    ? `${data.customer.passportNumber} (${data.customer.passportExpiry ?? "—"})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>
                  {tCust("visa")} / {tCust("sponsor")}
                </dt>
                <dd>
                  {[data.customer.visaNumber, data.customer.sponsorDetails]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>{tReports("summaryTotals")}</h2>
            <dl className="document-totals">
              <div>
                <dt>{tLedger("totalDebits")}</dt>
                <dd>{formatOMR(data.financials.totalDebitsBaisa)}</dd>
              </div>
              <div>
                <dt>{tLedger("totalCredits")}</dt>
                <dd>{formatOMR(data.financials.totalCreditsBaisa)}</dd>
              </div>
              <div>
                <dt>
                  {tLedger("advancePayments")} ({data.financials.advanceCount})
                </dt>
                <dd>{formatOMR(data.financials.advancesBaisa)}</dd>
              </div>
              <div>
                <dt>
                  {tLedger("receiptsCollected")} ({data.financials.receiptCount})
                </dt>
                <dd>{formatOMR(data.financials.receiptsBaisa)}</dd>
              </div>
              <div>
                <dt>
                  {tLedger("activeInvoices")} ({data.financials.activeInvoiceCount})
                </dt>
                <dd>{formatOMR(data.financials.invoicedBaisa)}</dd>
              </div>
              <div>
                <dt>
                  {tLedger("finesNormalLegal")} (
                  {data.financials.fineCount + data.financials.extraChargeCount})
                </dt>
                <dd>{formatOMR(data.financials.finesAndChargesBaisa)}</dd>
              </div>
              <div>
                <dt>
                  {tLedger("paybackTransactions")} ({data.financials.paybackCount})
                </dt>
                <dd>{formatOMR(data.financials.paybacksBaisa)}</dd>
              </div>
              <div>
                <dt>{tLedger("outstandingBalance")}</dt>
                <dd>{formatOMR(data.financials.outstandingBalanceBaisa)}</dd>
              </div>
            </dl>
          </section>

          {!!data.bookings.length && (
            <section>
              <h2>{tLedger("bookingHistory", { count: data.bookings.length })}</h2>
              <table className="document-table">
                <thead>
                  <tr>
                    <th>{tReports("columns.Agreement")}</th>
                    <th>{tCommon("vehicle")}</th>
                    <th>{tReports("columns.Period (Oman)")}</th>
                    <th>{tCommon("status")}</th>
                    <th className="document-money">{tCommon("total")}</th>
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
                      <td>{translateStatus(tStatus, b.status)}</td>
                      <td className="document-money">{formatOMR(b.totalBaisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h2>
              {tLedger("chronologicalTitle")} ({data.ledger.filteredRows.length} · {periodLabel})
            </h2>
            <table className="document-table">
              <thead>
                <tr>
                  <th>{tCommon("dateTimeOman")}</th>
                  <th>{tLedger("transactionType")}</th>
                  <th>{tCommon("reference")}</th>
                  <th>{tCommon("description")}</th>
                  <th className="document-money">{tLedger("debitCol")}</th>
                  <th className="document-money">{tLedger("creditCol")}</th>
                  <th className="document-money">{tLedger("runningBalanceCol")}</th>
                </tr>
              </thead>
              <tbody>
                {data.filters.from && (
                  <tr>
                    <td>{tLedger("openingBefore", { date: data.filters.from })}</td>
                    <td>{tLedger("openingBalance")}</td>
                    <td>—</td>
                    <td>{tLedger("openingBroughtForward")}</td>
                    <td className="document-money">—</td>
                    <td className="document-money">—</td>
                    <td className="document-money">{formatOMR(data.ledger.openingBalanceBaisa)}</td>
                  </tr>
                )}
                {data.ledger.filteredRows.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatOmanDateTimeDisplay(entry.createdAt)}</td>
                    <td>{translateStatus(tStatus, entry.displayType)}</td>
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
                    <td colSpan={7}>{tLedger("noTransactions")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="document-signatures" aria-label={tLedger("authorizedStaffSignature")}>
          <div className="document-signature">
            <div className="document-signature-space" />
            <p className="document-signature-label">{tLedger("customerAcknowledgement")}</p>
            <p>{data.customer.name}</p>
          </div>
          <div className="document-signature">
            <div className="document-signature-space">
              {staffSignature?.src && (
                <>
                  {/* biome-ignore lint/performance/noImgElement: private signature embedded after print permission check. */}
                  <img src={staffSignature.src} alt={`${actor.displayName}`} />
                </>
              )}
            </div>
            <p className="document-signature-label">{tLedger("authorizedStaffSignature")}</p>
            <p>{actor.displayName}</p>
          </div>
        </section>

        <footer className="document-footer">
          <span>
            {tCommon("customer")}: {data.customer.name} ({data.customer.customerNumber})
          </span>
          <span>
            {tLedger("printedBy")}: {actor.displayName} · {printedAt} ({tCommon("omanTime")})
          </span>
        </footer>
      </article>
    </div>
  );
}
