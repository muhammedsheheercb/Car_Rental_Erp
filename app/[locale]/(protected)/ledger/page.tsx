import Link from "next/link";
import { redirect } from "next/navigation";
import { LedgerCustomerPicker, LedgerTransactionFilters } from "@/components/ledger-controls";
import {
  formatOmanDateTimeDisplay,
  isDateExpiredInOman,
  type LedgerFilterType,
} from "@/features/ledger/calculations";
import { loadCustomerLedger, searchLedgerCustomers } from "@/features/ledger/service";
import { formatOMR } from "@/features/rentals/calculations";
import { can, requirePermission } from "@/lib/auth";

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

function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "—";
  return method.replaceAll("_", " ");
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
  const [actor, { locale }, query] = await Promise.all([
    requirePermission("customers", "read"),
    params,
    searchParams,
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
          <p className="text-sm text-[var(--accent)]">FINANCE / CUSTOMER LEDGER</p>
          <h1 className="mt-2 text-3xl font-semibold">Customer Ledger</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Complete customer statement: vehicles rented, bookings, advances, receipts, invoices,
            fines, paybacks, and running OMR balance (Oman time).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link
            href={`/${locale}/customers` as never}
            className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-3 text-sm"
          >
            Customers
          </Link>
          {data && canPrintLedger && (
            <Link
              href={printHref() as never}
              className="min-h-11 content-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
            >
              Print A4 Statement
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
          Customer not found. Select another customer from the directory below.
        </div>
      )}

      {!data ? (
        <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--edge)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Select a customer</h2>
              <p className="text-xs text-[var(--muted)]">
                Showing {matchingCustomers.length} customer
                {matchingCustomers.length === 1 ? "" : "s"}
                {q ? ` matching "${q}"` : ""}. Click any customer to open their full ledger.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[44rem] w-full text-sm">
              <thead className="bg-[var(--raised)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 text-start">Customer</th>
                  <th className="px-4 py-3 text-start">Mobile</th>
                  <th className="px-4 py-3 text-start">Driving Licence</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-end">Action</th>
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
                        {c.blacklistId ? "Blacklisted" : c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link
                        href={ledgerHref({ customerId: c.id, page: 1 }) as never}
                        className="inline-flex min-h-10 items-center rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-black"
                      >
                        Open Ledger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!matchingCustomers.length && (
              <p className="p-8 text-sm text-[var(--muted)]">
                No customers match your search criteria.
              </p>
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
              <p className="font-semibold">Active Blacklist Alert — {data.blacklist.reason}</p>
              <p className="mt-1 text-xs text-red-200">{data.blacklist.description}</p>
              {(data.blacklist.startsAt || data.blacklist.endsAt) && (
                <p className="mt-1 font-mono text-xs text-red-200">
                  Period: {data.blacklist.startsAt ?? "—"} to{" "}
                  {data.blacklist.endsAt ?? "Indefinite"}
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
                      ? "Blacklisted"
                      : data.customer.isActive
                        ? "Active"
                        : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {data.customer.mobile}
                  {data.customer.email ? ` · ${data.customer.email}` : ""}
                  {` · ${data.customer.address}`}
                </p>
                {data.customer.sponsorDetails && (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Sponsor: {data.customer.sponsorDetails}
                  </p>
                )}
              </div>

              <div className="shrink-0 rounded-xl border border-[var(--edge)] bg-black/25 px-4 py-3 sm:text-end">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Total Outstanding Balance
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
                    ? "Amount payable by customer"
                    : data.financials.balanceStatus === "CREDIT"
                      ? "Credit balance in favour of customer"
                      : "Account settled"}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  [
                    "Driving Licence",
                    data.customer.drivingLicenceNumber,
                    data.customer.drivingLicenceExpiry,
                  ],
                  ["Civil ID", data.customer.civilIdNumber, data.customer.civilIdExpiry],
                  ["Passport", data.customer.passportNumber, data.customer.passportExpiry],
                  ["Visa", data.customer.visaNumber, data.customer.visaExpiry],
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
                      {expiry ? `Exp: ${expiry}${expired ? " (Expired)" : ""}` : "No expiry"}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {data.customer.remarks && (
              <p className="mt-3 text-xs text-[var(--muted)]">Remarks: {data.customer.remarks}</p>
            )}
          </section>

          {/* Financial KPI Overview */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Total Debits (Charges)</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.totalDebitsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.bookings.length} booking{data.bookings.length === 1 ? "" : "s"} ·{" "}
                {data.rentedVehicles.length} vehicle{data.rentedVehicles.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Total Credits (Payments)</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-300">
                {formatOMR(data.financials.totalCreditsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.ledger.totalEntries} total ledger entr
                {data.ledger.totalEntries === 1 ? "y" : "ies"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Advance Payments</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.advancesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.advanceCount} advance
                {data.financials.advanceCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Receipts Collected</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.receiptsBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.receiptCount} receipt
                {data.financials.receiptCount === 1 ? "" : "s"}
                {data.financials.reversalCount
                  ? ` · ${data.financials.reversalCount} reversal${data.financials.reversalCount === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Invoices (Active)</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.invoicedBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.activeInvoiceCount} invoice
                {data.financials.activeInvoiceCount === 1 ? "" : "s"} ({data.invoices.length} total)
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Fines (Normal & Legal)</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-200">
                {formatOMR(data.financials.finesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.fineCount} fine{data.financials.fineCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Additional Charges</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatOMR(data.financials.extraChargesBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.extraChargeCount} charge
                {data.financials.extraChargeCount === 1 ? "" : "s"} (excess KM, late, damage, etc.)
              </p>
            </div>
            <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
              <p className="text-xs text-[var(--muted)]">Payback Transactions</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-200">
                {formatOMR(data.financials.paybacksBaisa)}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {data.financials.paybackCount} payback
                {data.financials.paybackCount === 1 ? "" : "s"}
              </p>
            </div>
          </section>

          {/* Complete Chronological Transaction Ledger (15 per page) */}
          <section className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Chronological Transaction Ledger</h2>
                <p className="text-xs text-[var(--muted)]">
                  All timestamps in Oman time (Asia/Muscat). Running balance reflects exact
                  cumulative ledger position across all pages.
                </p>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {data.ledger.totalFiltered} matching transaction
                {data.ledger.totalFiltered === 1 ? "" : "s"} · Page {data.ledger.page} of{" "}
                {data.ledger.totalPages}
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
                  {data.filters.from ? `Opening (before ${data.filters.from})` : "Opening Balance"}
                </span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatOMR(data.ledger.openingBalanceBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Filtered Debits</span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatOMR(data.ledger.periodDebitBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">Filtered Credits</span>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-300">
                  {formatOMR(data.ledger.periodCreditBaisa)}
                </p>
              </div>
              <div>
                <span className="text-[var(--muted)]">
                  {data.filters.from || data.filters.to
                    ? "Period Closing Balance"
                    : "Closing Balance"}
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
                    <th className="px-3 py-3 text-start">Date / Time (Oman)</th>
                    <th className="px-3 py-3 text-start">Type</th>
                    <th className="px-3 py-3 text-start">Reference / Booking</th>
                    <th className="px-3 py-3 text-start">Description</th>
                    <th className="px-3 py-3 text-end">Debit (OMR)</th>
                    <th className="px-3 py-3 text-end">Credit (OMR)</th>
                    <th className="px-3 py-3 text-end">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filters.from && data.ledger.page === 1 && (
                    <tr className="border-t border-[var(--edge)] bg-white/5 text-xs">
                      <td className="px-3 py-2.5 font-mono text-[var(--muted)]">
                        Before {data.filters.from}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-[var(--edge)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          Opening
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">—</td>
                      <td className="px-3 py-2.5 text-[var(--muted)]">
                        Opening balance brought forward
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
                          {entry.displayLabel}
                        </span>
                        {entry.paymentMethod && (
                          <p className="mt-1 text-[11px] text-[var(--muted)]">
                            {formatPaymentMethod(entry.paymentMethod)}
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
                <p className="p-8 text-sm text-[var(--muted)]">
                  No ledger transactions found for the selected criteria.
                </p>
              )}
            </div>

            {data.ledger.totalPages > 1 && (
              <nav
                aria-label="Ledger transaction pages"
                className="flex items-center justify-end gap-3 text-sm print:hidden"
              >
                {data.ledger.page > 1 && (
                  <Link
                    href={ledgerHref({ page: data.ledger.page - 1 }) as never}
                    className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-[var(--muted)]">
                  Page {data.ledger.page} of {data.ledger.totalPages}
                </span>
                {data.ledger.page < data.ledger.totalPages && (
                  <Link
                    href={ledgerHref({ page: data.ledger.page + 1 }) as never}
                    className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
                  >
                    Next
                  </Link>
                )}
              </nav>
            )}
          </section>

          {/* Active & Historical Vehicles Rented */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">
              Vehicles Rented — Active &amp; Historical ({data.rentedVehicles.length})
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
                          ? "ON RENT"
                          : v.usageStatus === "RESERVED"
                            ? "RESERVED"
                            : "HISTORICAL"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Branch: {v.branchName} · Color: {v.color} · {v.rentalCount} assignment
                      {v.rentalCount === 1 ? "" : "s"}
                      {v.swappedFrom ? " (incl. transfer)" : ""}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                      Last activity: {formatOmanDateTimeDisplay(v.lastUsedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">No vehicles rented yet.</p>
            )}
          </section>

          {/* Booking History */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">Booking History ({data.bookings.length})</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--edge)]">
              <table className="min-w-[54rem] w-full text-sm">
                <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 text-start">Agreement</th>
                    <th className="px-3 py-3 text-start">Vehicle</th>
                    <th className="px-3 py-3 text-start">Branch</th>
                    <th className="px-3 py-3 text-start">Dates (Oman)</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-end">Total (OMR)</th>
                    <th className="px-3 py-3 text-end print:hidden">Actions</th>
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
                        <div>Out: {formatOmanDateTimeDisplay(b.startsAt)}</div>
                        <div>
                          {b.actualReturnAt
                            ? `Returned: ${formatOmanDateTimeDisplay(b.actualReturnAt)}`
                            : `Due: ${formatOmanDateTimeDisplay(b.expectedReturnAt)}`}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(b.status)}`}
                        >
                          {b.status}
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
                              View
                            </Link>
                          )}
                          {canPrintRentals && (
                            <Link
                              href={`/${locale}/documents/agreement/${b.id}` as never}
                              className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                            >
                              Print
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.bookings.length && (
                <p className="p-6 text-sm text-[var(--muted)]">No bookings found.</p>
              )}
            </div>
          </section>

          {/* Invoices */}
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">Invoices ({data.invoices.length})</h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--edge)]">
              <table className="min-w-[54rem] w-full text-sm">
                <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-3 text-start">Invoice #</th>
                    <th className="px-3 py-3 text-start">Booking #</th>
                    <th className="px-3 py-3 text-start">Date (Oman)</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-end">Grand Total</th>
                    <th className="px-3 py-3 text-end">Received</th>
                    <th className="px-3 py-3 text-end">Balance</th>
                    <th className="px-3 py-3 text-end print:hidden">Actions</th>
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
                          {inv.status}
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
                            View
                          </Link>
                          {canPrintFinance && (
                            <Link
                              href={`/${locale}/documents/invoice/${inv.id}` as never}
                              className="rounded border border-[var(--edge)] px-2 py-1 hover:bg-white/5"
                            >
                              Print
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.invoices.length && (
                <p className="p-6 text-sm text-[var(--muted)]">No invoices recorded.</p>
              )}
            </div>
          </section>

          {/* Advances, Receipts & Paybacks */}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Advance Payments ({data.advances.length})</h2>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  {formatOMR(data.financials.advancesBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">Receipt / Booking</th>
                      <th className="px-3 py-2.5 text-start">Date (Oman)</th>
                      <th className="px-3 py-2.5 text-start">Mode</th>
                      <th className="px-3 py-2.5 text-end">Amount</th>
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
                          <div>{formatPaymentMethod(p.method)}</div>
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
                  <p className="p-5 text-sm text-[var(--muted)]">No advance payments recorded.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Receipts &amp; Reversals ({data.receipts.length})
                </h2>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  {formatOMR(data.financials.receiptsBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">Receipt / Booking</th>
                      <th className="px-3 py-2.5 text-start">Date (Oman)</th>
                      <th className="px-3 py-2.5 text-start">Mode / Kind</th>
                      <th className="px-3 py-2.5 text-end">Amount</th>
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
                            {formatPaymentMethod(p.method)} · {p.kind}
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
                  <p className="p-5 text-sm text-[var(--muted)]">No receipts recorded.</p>
                )}
              </div>
            </section>
          </div>

          {/* Paybacks + Fines & Additional Charges */}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Payback Transactions ({data.paybacks.length})
                </h2>
                <span className="font-mono text-sm font-semibold text-amber-200">
                  {formatOMR(data.financials.paybacksBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">Reference / Booking</th>
                      <th className="px-3 py-2.5 text-start">Date (Oman)</th>
                      <th className="px-3 py-2.5 text-start">Mode / Staff</th>
                      <th className="px-3 py-2.5 text-end">Amount</th>
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
                          <div>{formatPaymentMethod(p.method)}</div>
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
                  <p className="p-5 text-sm text-[var(--muted)]">
                    No payback transactions recorded.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Fines &amp; Additional Charges ({data.fines.length + data.extraCharges.length})
                </h2>
                <span className="font-mono text-sm font-semibold text-red-200">
                  {formatOMR(data.financials.finesAndChargesBaisa)}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--edge)]">
                <table className="min-w-[30rem] w-full text-xs">
                  <thead className="bg-[var(--raised)] uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2.5 text-start">Category</th>
                      <th className="px-3 py-2.5 text-start">Booking / Details</th>
                      <th className="px-3 py-2.5 text-start">Date (Oman)</th>
                      <th className="px-3 py-2.5 text-end">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fines.map((f) => (
                      <tr key={`fine-${f.id}`} className="border-t border-[var(--edge)]">
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-200">
                            {f.kind === "LEGAL" ? "Legal Fine" : "Fine"}
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
                              Print Legal Fine A4
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
                            {c.component.replaceAll("_", " ")}
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
                  <p className="p-5 text-sm text-[var(--muted)]">
                    No fines or additional charges recorded.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
