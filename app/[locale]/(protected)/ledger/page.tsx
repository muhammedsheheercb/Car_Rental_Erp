import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LedgerCustomerPicker, LedgerTransactionFilters } from "@/components/ledger-controls";
import {
  formatOmanDateTimeDisplay,
  isDateExpiredInOman,
  type LedgerFilterType,
} from "@/features/ledger/calculations";
import { loadCustomerLedger, searchLedgerCustomers } from "@/features/ledger/service";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePagePermission } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";

function typeBadgeClass(type: Exclude<LedgerFilterType, "ALL">): string {
  switch (type) {
    case "ADVANCE":
    case "RECEIPT":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
    case "FINE":
    case "LEGAL_FINE":
    case "DAMAGE":
      return "bg-red-500/15 text-red-200 border-red-500/30";
    case "PAYBACK":
    case "REVERSAL":
      return "bg-amber-500/15 text-amber-200 border-amber-500/30";
    case "RENT_CHARGE":
    case "DEPOSIT":
      return "bg-sky-500/15 text-sky-200 border-sky-500/30";
    default:
      return "bg-white/10 text-[var(--ink)] border-[var(--edge)]";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500/15 text-emerald-200";
    case "RESERVED":
      return "bg-amber-500/15 text-amber-200";
    case "RETURNED":
    case "FINALIZED":
      return "bg-sky-500/15 text-sky-200";
    case "CANCELLED":
    case "VOID":
      return "bg-red-500/15 text-red-200";
    default:
      return "bg-white/10 text-[var(--muted)]";
  }
}

export default async function CustomerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    customerId?: string;
    q?: string;
    from?: string;
    to?: string;
    type?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  const [actor, query, tLedger, tCust, tCommon, tStatus, tNav, tReports] = await Promise.all([
    requirePagePermission(locale, "customers", "read"),
    searchParams,
    getTranslations("ledger"),
    getTranslations("customers"),
    getTranslations("common"),
    getTranslations("status"),
    getTranslations("nav"),
    getTranslations("reports"),
  ]);
  if (!can(actor, "finance", "read")) redirect(`/${locale}/forbidden`);
  const q = query.q?.trim() ?? "";
  const selectedId = query.customerId?.trim() ?? "";
  const currentPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const [matchingCustomers, data] = await Promise.all([
    searchLedgerCustomers(q, 50),
    selectedId
      ? loadCustomerLedger(selectedId, actor, {
          from: query.from,
          to: query.to,
          type: query.type,
          page: currentPage,
        })
      : Promise.resolve(null),
  ]);

  // Ensure the currently selected customer appears in the dropdown even if search text narrows the list
  const pickerCustomers =
    data && !matchingCustomers.some((c) => c.id === data.customer.id)
      ? [
          {
            id: data.customer.id,
            customerNumber: data.customer.customerNumber,
            name: data.customer.name,
            mobile: data.customer.mobile,
            drivingLicenceNumber: data.customer.drivingLicenceNumber,
            isActive: data.customer.isActive,
            blacklistId: data.blacklist?.id ?? null,
            blacklistReason: data.blacklist?.reason ?? null,
          },
          ...matchingCustomers,
        ]
      : matchingCustomers;

  const canPrintLedger = can(actor, "finance", "print") || can(actor, "customers", "print");
  const canReadRentals = can(actor, "rentals", "read");
  const canPrintRentals = can(actor, "rentals", "print");
  const canPrintFinance = can(actor, "finance", "print");

  const ledgerHref = (overrides: {
    customerId?: string;
    page?: number;
    from?: string;
    to?: string;
    type?: string;
  }) => {
    const p = new URLSearchParams();
    const nextCustomer = overrides.customerId ?? selectedId;
    if (nextCustomer) p.set("customerId", nextCustomer);
    if (q) p.set("q", q);
    const nextFrom = overrides.from ?? data?.filters.from ?? "";
    const nextTo = overrides.to ?? data?.filters.to ?? "";
    const nextType = overrides.type ?? data?.filters.type ?? "ALL";
    if (nextFrom) p.set("from", nextFrom);
    if (nextTo) p.set("to", nextTo);
    if (nextType && nextType !== "ALL") p.set("type", nextType);
    if (overrides.page && overrides.page > 1) p.set("page", String(overrides.page));
    return `/${locale}/ledger${p.size ? `?${p.toString()}` : ""}`;
  };

  const printHref = () => {
    if (!data) return `/${locale}/ledger`;
    const p = new URLSearchParams();
    p.set("customerId", data.customer.id);
    if (data.filters.from) p.set("from", data.filters.from);
    if (data.filters.to) p.set("to", data.filters.to);
    if (data.filters.type !== "ALL") p.set("type", data.filters.type);
    return `/${locale}/ledger/print?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">{tLedger("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{tLedger("title")}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{tLedger("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link
            href={`/${locale}/customers` as never}
            className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm"
          >
            {tNav("customers")}
          </Link>
          {data && canPrintLedger && (
            <Link
              href={printHref() as never}
              className="min-h-11 content-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
            >
              {tLedger("printStatement")}
            </Link>
          )}
        </div>
      </div>

      <LedgerCustomerPicker
        customers={pickerCustomers}
        selectedCustomerId={data?.customer.id ?? ""}
        initialQuery={q}
      />

      {selectedId && !data && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-200">
          {tLedger("notFound")}
        </div>
      )}

      {!data ? (
        <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--edge)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">{tLedger("selectCustomerHeading")}</h2>
              <p className="text-xs text-[var(--muted)]">
                {tLedger("selectCustomerHint", { count: matchingCustomers.length })}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[44rem] w-full text-sm">
              <thead className="bg-[var(--raised)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 text-start">{tCommon("customer")}</th>
                  <th className="px-4 py-3 text-start">{tCust("mobileCol")}</th>
                  <th className="px-4 py-3 text-start">{tCust("drivingLicence")}</th>
                  <th className="px-4 py-3 text-center">{tCommon("status")}</th>
                  <th className="px-4 py-3 text-end">{tCommon("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {matchingCustomers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--edge)] transition-colors hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="font-mono text-xs text-[var(--muted)]">{c.customerNumber}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{c.mobile}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.drivingLicenceNumber}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs ${
                          c.blacklistId
                            ? "bg-red-500/15 text-red-200"
                            : c.isActive
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "bg-white/10 text-[var(--muted)]"
                        }`}
                      >
                        {c.blacklistId
                          ? tStatus("BLACKLISTED")
                          : c.isActive
                            ? tStatus("ACTIVE")
                            : tStatus("INACTIVE")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link
                        href={ledgerHref({ customerId: c.id, page: 1 }) as never}
                        className="inline-flex min-h-10 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-black"
                      >
                        {tLedger("openLedger")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!matchingCustomers.length && (
              <p className="p-8 text-sm text-[var(--muted)]">{tCust("noCustomers")}</p>
            )}
          </div>
        </section>
      ) : (
        <>
          {data.blacklist && (
            <div
              role="alert"
              className="rounded-2xl border border-red-400/40 bg-red-500/15 p-4 text-sm text-red-100"
            >
              <p className="font-semibold">
                {tLedger("blacklistAlert", { reason: data.blacklist.reason })}
              </p>
              <p className="mt-1 text-xs text-red-200">{data.blacklist.description}</p>
              {(data.blacklist.startsAt || data.blacklist.endsAt) && (
                <p className="mt-1 font-mono text-xs text-red-200">
                  {tReports("period")}: {data.blacklist.startsAt ?? "—"} —{" "}
                  {data.blacklist.endsAt ?? tCust("blacklistPage.indefinite")}
                </p>
              )}
            </div>
          )}

          {/* Customer Profile & Identity Summary */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-3 border-b border-[var(--edge)] pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold">{data.customer.name}</h2>
                  <span className="rounded-md border border-[var(--edge)] bg-black/25 px-2 py-0.5 font-mono text-xs text-[var(--accent)]">
                    {data.customer.customerNumber}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      data.blacklist
                        ? "bg-red-500/20 text-red-200"
                        : data.customer.isActive
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-white/10 text-[var(--muted)]"
                    }`}
                  >
                    {data.blacklist
                      ? tStatus("BLACKLISTED")
                      : data.customer.isActive
                        ? tStatus("ACTIVE")
                        : tStatus("INACTIVE")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {data.customer.mobile}
                  {data.customer.email ? ` · ${data.customer.email}` : ""}
                  {` · ${data.customer.address}`}
                </p>
                {data.customer.sponsorDetails && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {tCust("sponsor")}: {data.customer.sponsorDetails}
                  </p>
                )}
              </div>

              <div className="shrink-0 rounded-xl border border-[var(--edge)] bg-black/25 px-4 py-3 sm:text-end">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {tLedger("outstandingBalance")}
                </p>
                <p
                  className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                    data.financials.balanceStatus === "DUE"
                      ? "text-amber-300"
                      : data.financials.balanceStatus === "CREDIT"
                        ? "text-sky-300"
                        : "text-emerald-300"
                  }`}
                >
                  {formatOMR(data.financials.outstandingBalanceBaisa)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {data.financials.balanceStatus === "DUE"
                    ? tLedger("dueHint")
                    : data.financials.balanceStatus === "CREDIT"
                      ? tLedger("creditHint")
                      : tLedger("settledHint")}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  [
                    tCust("drivingLicence"),
                    data.customer.drivingLicenceNumber,
                    data.customer.drivingLicenceExpiry,
                  ],
                  [tCust("civilId"), data.customer.civilIdNumber, data.customer.civilIdExpiry],
                  [tCust("passport"), data.customer.passportNumber, data.customer.passportExpiry],
                  [tCust("visa"), data.customer.visaNumber, data.customer.visaExpiry],
                ] as const
              ).map(([label, number, expiry]) => {
                const expired = isDateExpiredInOman(expiry);
                return (
                  <div
                    key={label}
                    className="rounded-xl border border-[var(--edge)] bg-black/20 p-3"
                  >
                    <dt className="text-xs text-[var(--muted)]">{label}</dt>
                    <dd className="mt-1 font-mono text-sm font-medium">{number || "—"}</dd>
                    <dd
                      className={`mt-1 text-xs ${expired ? "font-medium text-red-300" : "text-[var(--muted)]"}`}
                    >
                      {expiry
                        ? `${expiry}${expired ? ` ${tLedger("expiredTag")}` : ""}`
                        : tLedger("noExpiry")}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {data.customer.remarks && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                {tCommon("remarks")}: {data.customer.remarks}
              </p>
            )}
          </section>

          {/* Financial KPI Overview */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("totalDebits")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.totalDebitsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.bookings.length} · {data.rentedVehicles.length}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("totalCredits")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-300">
                {formatOMR(data.financials.totalCreditsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.ledger.totalEntries })}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("advancePayments")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.advancesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.financials.advanceCount })}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("receiptsCollected")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.receiptsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.financials.receiptCount })}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("activeInvoices")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.invoicedBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.activeInvoiceCount} / {data.invoices.length}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("finesNormalLegal")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-200">
                {formatOMR(data.financials.finesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.financials.fineCount })}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("additionalCharges")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.extraChargesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.financials.extraChargeCount })}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">{tLedger("paybackTransactions")}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-200">
                {formatOMR(data.financials.paybacksBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.financials.paybackCount })}
              </p>
            </div>
          </section>

          {/* Complete Chronological Transaction Ledger (15 per page) */}
          <section className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{tLedger("chronologicalTitle")}</h2>
                <p className="text-xs text-[var(--muted)]">{tLedger("chronologicalSubtitle")}</p>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {tCommon("recordsCount", { count: data.ledger.totalFiltered })} ·{" "}
                {tCommon("pageOf", { page: data.ledger.page, total: data.ledger.totalPages })}
              </p>
            </div>

            <LedgerTransactionFilters
              customerId={data.customer.id}
              initialFrom={data.filters.from}
              initialTo={data.filters.to}
              initialType={data.filters.type}
              searchQuery={q}
            />

            <div className="grid gap-2 rounded-xl border border-[var(--edge)] bg-black/20 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-[var(--muted)]">
                  {data.filters.from
                    ? tLedger("openingBefore", { date: data.filters.from })
                    : tLedger("openingBalance")}
                </span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatOMR(data.ledger.openingBalanceBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">{tLedger("filteredDebits")}</span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatOMR(data.ledger.periodDebitBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">{tLedger("filteredCredits")}</span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-300">
                  {formatOMR(data.ledger.periodCreditBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">
                  {data.filters.from || data.filters.to
                    ? tLedger("periodClosingBalance")
                    : tLedger("closingBalance")}
                </span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--accent)]">
                  {formatOMR(data.ledger.periodClosingBalanceBaisa)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--edge)]">
              <table className="min-w-[60rem] w-full text-sm">
                <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 text-start">{tCommon("dateTimeOman")}</th>
                    <th className="px-3 py-3 text-start">{tLedger("transactionType")}</th>
                    <th className="px-3 py-3 text-start">{tLedger("referenceCol")}</th>
                    <th className="px-3 py-3 text-start">{tCommon("description")}</th>
                    <th className="px-3 py-3 text-end">{tLedger("debitCol")}</th>
                    <th className="px-3 py-3 text-end">{tLedger("creditCol")}</th>
                    <th className="px-3 py-3 text-end">{tLedger("runningBalanceCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filters.from && data.ledger.page === 1 && (
                    <tr className="border-t border-[var(--edge)] bg-white/5 text-xs">
                      <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                        {tLedger("openingBefore", { date: data.filters.from })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-[var(--edge)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          {tLedger("openingBalance")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">—</td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">
                        {tLedger("openingBroughtForward")}
                      </td>
                      <td className="px-3 py-2.5 text-end font-mono text-[var(--muted)]">—</td>
                      <td className="px-3 py-2.5 text-end font-mono text-[var(--muted)]">—</td>
                      <td className="px-3 py-2.5 text-end font-mono font-semibold tabular-nums">
                        {formatOMR(data.ledger.openingBalanceBaisa)}
                      </td>
                    </tr>
                  )}
                  {data.ledger.pageRows.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-[var(--edge)] align-top hover:bg-white/5"
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">
                        {formatOmanDateTimeDisplay(entry.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${typeBadgeClass(entry.displayType)}`}
                        >
                          {translateStatus(tStatus, entry.displayType)}
                        </span>
                        {entry.paymentMethod && (
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            {translateStatus(tStatus, entry.paymentMethod)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {entry.agreementNumber ? (
                          canReadRentals && entry.rentalId ? (
                            <Link
                              href={`/${locale}/rentals/${entry.rentalId}` as never}
                              className="block text-[var(--accent)] hover:underline"
                            >
                              {entry.agreementNumber}
                            </Link>
                          ) : (
                            <span className="block">{entry.agreementNumber}</span>
                          )
                        ) : null}
                        {entry.receiptNumber ? (
                          canPrintFinance && entry.paymentId ? (
                            <Link
                              href={`/${locale}/documents/receipt/${entry.paymentId}` as never}
                              className="block text-[var(--muted)] hover:text-white hover:underline"
                            >
                              {entry.receiptNumber}
                            </Link>
                          ) : (
                            <span className="block text-[var(--muted)]">{entry.receiptNumber}</span>
                          )
                        ) : null}
                        {!entry.agreementNumber && !entry.receiptNumber && (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                        {entry.branchName && (
                          <span className="block font-sans text-[11px] text-[var(--muted)]">
                            {entry.branchName}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm">{entry.description}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-end font-mono tabular-nums">
                        {entry.debitBaisa > 0 ? (
                          formatOMR(entry.debitBaisa)
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-end font-mono tabular-nums text-emerald-300">
                        {entry.creditBaisa > 0 ? (
                          formatOMR(entry.creditBaisa)
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-end font-mono font-semibold tabular-nums ${
                          entry.runningBalanceBaisa > 0
                            ? "text-amber-200"
                            : entry.runningBalanceBaisa < 0
                              ? "text-sky-200"
                              : "text-emerald-200"
                        }`}
                      >
                        {formatOMR(entry.runningBalanceBaisa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.ledger.pageRows.length && (
                <p className="p-8 text-sm text-[var(--muted)]">{tLedger("noTransactions")}</p>
              )}
            </div>

            {data.ledger.totalPages > 1 && (
              <nav
                aria-label={tLedger("chronologicalTitle")}
                className="flex items-center justify-end gap-3 text-sm print:hidden"
              >
                {data.ledger.page > 1 && (
                  <Link
                    href={ledgerHref({ page: data.ledger.page - 1 }) as never}
                    className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
                  >
                    {tCommon("previous")}
                  </Link>
                )}
                <span className="text-[var(--muted)]">
                  {tCommon("pageOf", { page: data.ledger.page, total: data.ledger.totalPages })}
                </span>
                {data.ledger.page < data.ledger.totalPages && (
                  <Link
                    href={ledgerHref({ page: data.ledger.page + 1 }) as never}
                    className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
                  >
                    {tCommon("next")}
                  </Link>
                )}
              </nav>
            )}
          </section>

          {/* Active & Historical Vehicles Rented */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">
              {tLedger("vehiclesRented", { count: data.rentedVehicles.length })}
            </h2>
            {data.rentedVehicles.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.rentedVehicles.map((v) => (
                  <div
                    key={v.vehicleId}
                    className="rounded-xl border border-[var(--edge)] bg-black/20 p-4 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {v.brandName} {v.modelName} ({v.year})
                        </p>
                        <p className="font-mono text-xs text-[var(--muted)]">
                          {v.vehicleNumber} · {v.registrationNumber}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(v.usageStatus)}`}
                      >
                        {v.usageStatus === "ACTIVE"
                          ? tStatus("ON_RENT")
                          : v.usageStatus === "RESERVED"
                            ? tStatus("RESERVED")
                            : tStatus("HISTORICAL")}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {tCommon("branch")}: {v.branchName} · {v.color} · {v.rentalCount}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                      {formatOmanDateTimeDisplay(v.lastUsedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">{tLedger("noVehiclesRented")}</p>
            )}
          </section>

          {/* Booking History */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">
              {tLedger("bookingHistory", { count: data.bookings.length })}
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--edge)]">
              <table className="min-w-[54rem] w-full text-sm">
                <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 text-start">{tReports("columns.Agreement")}</th>
                    <th className="px-3 py-3 text-start">{tCommon("vehicle")}</th>
                    <th className="px-3 py-3 text-start">{tCommon("branch")}</th>
                    <th className="px-3 py-3 text-start">{tReports("columns.Period (Oman)")}</th>
                    <th className="px-3 py-3 text-center">{tCommon("status")}</th>
                    <th className="px-3 py-3 text-end">{tCommon("total")}</th>
                    <th className="px-3 py-3 text-end print:hidden">{tCommon("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id} className="border-t border-[var(--edge)]">
                      <td className="px-3 py-3 font-mono text-xs font-medium">
                        {canReadRentals ? (
                          <Link
                            href={`/${locale}/rentals/${b.id}` as never}
                            className="text-[var(--accent)] hover:underline"
                          >
                            {b.agreementNumber}
                          </Link>
                        ) : (
                          b.agreementNumber
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">
                          {b.brandName} {b.modelName}
                        </p>
                        <p className="font-mono text-xs text-[var(--muted)]">
                          {b.vehicleNumber} · {b.registrationNumber}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs">{b.branchName}</td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">
                        <div>{formatOmanDateTimeDisplay(b.startsAt)}</div>
                        <div>
                          {formatOmanDateTimeDisplay(b.actualReturnAt ?? b.expectedReturnAt)}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(b.status)}`}
                        >
                          {translateStatus(tStatus, b.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-end font-mono font-medium tabular-nums">
                        {formatOMR(b.totalBaisa)}
                      </td>
                      <td className="px-3 py-3 text-end text-xs print:hidden">
                        <div className="flex justify-end gap-2">
                          {canReadRentals && (
                            <Link
                              href={`/${locale}/rentals/${b.id}` as never}
                              className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                            >
                              {tCommon("view")}
                            </Link>
                          )}
                          {canPrintRentals && (
                            <Link
                              href={`/${locale}/documents/agreement/${b.id}` as never}
                              className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                            >
                              {tCommon("print")}
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.bookings.length && (
                <p className="p-6 text-sm text-[var(--muted)]">{tLedger("noBookings")}</p>
              )}
            </div>
          </section>

          {/* Invoices */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">
              {tLedger("invoicesTitle", { count: data.invoices.length })}
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--edge)]">
              <table className="min-w-[54rem] w-full text-sm">
                <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 text-start">{tReports("columns.Invoice # / Date")}</th>
                    <th className="px-3 py-3 text-start">{tReports("columns.Agreement")}</th>
                    <th className="px-3 py-3 text-start">{tReports("columns.Date (Oman)")}</th>
                    <th className="px-3 py-3 text-center">{tCommon("status")}</th>
                    <th className="px-3 py-3 text-end">{tReports("columns.Grand Total")}</th>
                    <th className="px-3 py-3 text-end">{tReports("columns.Advance + Recv")}</th>
                    <th className="px-3 py-3 text-end">{tReports("columns.Balance Due")}</th>
                    <th className="px-3 py-3 text-end print:hidden">{tCommon("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-[var(--edge)]">
                      <td className="px-3 py-3 font-mono text-xs font-medium">
                        <Link
                          href={`/${locale}/invoices/${inv.id}` as never}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{inv.agreementNumber}</td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">
                        {formatOmanDateTimeDisplay(inv.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(inv.status)}`}
                        >
                          {translateStatus(tStatus, inv.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-end font-mono tabular-nums">
                        {formatOMR(inv.grandTotalBaisa)}
                      </td>
                      <td className="px-3 py-3 text-end font-mono tabular-nums text-emerald-300">
                        {formatOMR(inv.advanceBaisa + inv.receivedBaisa)}
                      </td>
                      <td className="px-3 py-3 text-end font-mono font-medium tabular-nums">
                        {formatOMR(inv.balanceBaisa)}
                      </td>
                      <td className="px-3 py-3 text-end text-xs print:hidden">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/${locale}/invoices/${inv.id}` as never}
                            className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                          >
                            {tCommon("view")}
                          </Link>
                          {canPrintFinance && (
                            <Link
                              href={`/${locale}/documents/invoice/${inv.id}` as never}
                              className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                            >
                              {tCommon("print")}
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.invoices.length && (
                <p className="p-6 text-sm text-[var(--muted)]">{tCommon("noRecords")}</p>
              )}
            </div>
          </section>

          {/* Advances, Receipts & Paybacks */}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {tLedger("advancePayments")} ({data.advances.length})
                </h2>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  {formatOMR(data.financials.advancesBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{tLedger("referenceCol")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Date (Oman)")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Mode")}</th>
                      <th className="px-3 py-2.5 text-end">{tCommon("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.advances.map((p) => (
                      <tr key={p.id} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5 font-mono">
                          {canPrintFinance ? (
                            <Link
                              href={`/${locale}/documents/receipt/${p.id}` as never}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {p.receiptNumber}
                            </Link>
                          ) : (
                            p.receiptNumber
                          )}
                          {p.agreementNumber && (
                            <div className="text-[var(--muted)]">{p.agreementNumber}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                          {formatOmanDateTimeDisplay(p.receivedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div>{translateStatus(tStatus, p.method)}</div>
                          <div className="text-[var(--muted)]">{p.recordedByName}</div>
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono font-semibold tabular-nums text-emerald-300">
                          {formatOMR(p.amountBaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.advances.length && (
                  <p className="p-5 text-sm text-[var(--muted)]">{tCommon("noRecords")}</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {tLedger("receiptsCollected")} ({data.receipts.length})
                </h2>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  {formatOMR(data.financials.receiptsBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{tLedger("referenceCol")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Date (Oman)")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Mode")}</th>
                      <th className="px-3 py-2.5 text-end">{tCommon("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.receipts.map((p) => (
                      <tr key={p.id} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5 font-mono">
                          {canPrintFinance ? (
                            <Link
                              href={`/${locale}/documents/receipt/${p.id}` as never}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {p.receiptNumber}
                            </Link>
                          ) : (
                            p.receiptNumber
                          )}
                          {p.agreementNumber && (
                            <div className="text-[var(--muted)]">{p.agreementNumber}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                          {formatOmanDateTimeDisplay(p.receivedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div>
                            {translateStatus(tStatus, p.method)} ·{" "}
                            {translateStatus(tStatus, p.kind)}
                          </div>
                          <div className="text-[var(--muted)]">{p.recordedByName}</div>
                        </td>
                        <td
                          className={`px-3 py-2.5 text-end font-mono font-semibold tabular-nums ${
                            p.kind === "REVERSAL" ? "text-amber-300" : "text-emerald-300"
                          }`}
                        >
                          {p.kind === "REVERSAL" ? "-" : ""}
                          {formatOMR(p.amountBaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.receipts.length && (
                  <p className="p-5 text-sm text-[var(--muted)]">{tCommon("noRecords")}</p>
                )}
              </div>
            </section>
          </div>

          {/* Paybacks + Fines & Additional Charges */}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {tLedger("paybacksTitle", { count: data.paybacks.length })}
                </h2>
                <span className="font-mono text-sm font-semibold text-amber-200">
                  {formatOMR(data.financials.paybacksBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{tLedger("referenceCol")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Date (Oman)")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Mode")}</th>
                      <th className="px-3 py-2.5 text-end">{tCommon("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paybacks.map((p) => (
                      <tr key={p.id} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5 font-mono">
                          {canPrintFinance ? (
                            <Link
                              href={`/${locale}/documents/receipt/${p.id}` as never}
                              className="text-[var(--accent)] hover:underline"
                            >
                              {p.receiptNumber}
                            </Link>
                          ) : (
                            p.receiptNumber
                          )}
                          {p.agreementNumber && (
                            <div className="text-[var(--muted)]">{p.agreementNumber}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                          {formatOmanDateTimeDisplay(p.receivedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div>{translateStatus(tStatus, p.method)}</div>
                          <div className="text-[var(--muted)]">{p.recordedByName}</div>
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono font-semibold tabular-nums text-amber-200">
                          {formatOMR(p.amountBaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.paybacks.length && (
                  <p className="p-5 text-sm text-[var(--muted)]">{tCommon("noRecords")}</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {tLedger("finesTitle", {
                    count: data.fines.length + data.extraCharges.length,
                  })}
                </h2>
                <span className="font-mono text-sm font-semibold text-red-200">
                  {formatOMR(data.financials.finesAndChargesBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Type")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Details")}</th>
                      <th className="px-3 py-2.5 text-start">{tReports("columns.Date (Oman)")}</th>
                      <th className="px-3 py-2.5 text-end">{tCommon("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fines.map((f) => (
                      <tr key={`fine-${f.id}`} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-200">
                            {f.kind === "LEGAL" ? tStatus("LEGAL_FINE") : tStatus("FINE")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-[var(--accent)]">
                            {f.agreementNumber} · {f.registrationNumber}
                          </div>
                          <div>{f.details}</div>
                          {f.kind === "LEGAL" && canPrintFinance && (
                            <Link
                              href={`/${locale}/documents/legal-fine/${f.id}` as never}
                              className="mt-1 inline-block text-[11px] text-[var(--accent)] hover:underline print:hidden"
                            >
                              {tCommon("printA4")}
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                          {formatOmanDateTimeDisplay(f.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono font-semibold tabular-nums text-red-200">
                          {formatOMR(f.amountBaisa)}
                        </td>
                      </tr>
                    ))}
                    {data.extraCharges.map((c) => (
                      <tr key={`charge-${c.id}`} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full border border-[var(--edge)] bg-white/10 px-2 py-0.5 text-[11px]">
                            {translateStatus(tStatus, c.component)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-[var(--muted)]">{c.agreementNumber}</div>
                          <div>{c.description}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                          {formatOmanDateTimeDisplay(c.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-end font-mono font-semibold tabular-nums">
                          {formatOMR(c.amountBaisa)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.fines.length && !data.extraCharges.length && (
                  <p className="p-5 text-sm text-[var(--muted)]">{tCommon("noRecords")}</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
