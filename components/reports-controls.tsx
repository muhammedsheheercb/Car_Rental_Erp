"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarInput } from "@/components/calendar-input";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import {
  formatPaymentModeLabel,
  PAYMENT_MODES,
  type PaymentModeFilter,
  REPORT_LIST,
  type ReportDefinition,
  type ReportSlug,
} from "@/features/reports/definitions";

type BranchOption = { id: string; name: string; code: string };

export function ReportsControls({
  definition,
  branches,
  initialFilters,
}: {
  definition: ReportDefinition;
  branches: BranchOption[];
  initialFilters: {
    report: ReportSlug;
    q: string;
    branchId: string;
    status: string;
    paymentMode: PaymentModeFilter;
    from: string;
    to: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(initialFilters.q);
  const [branchId, setBranchId] = useState(initialFilters.branchId);
  const [status, setStatus] = useState(initialFilters.status);
  const [paymentMode, setPaymentMode] = useState<PaymentModeFilter>(initialFilters.paymentMode);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);

  useEffect(() => {
    setQ(initialFilters.q);
    setBranchId(initialFilters.branchId);
    setStatus(initialFilters.status);
    setPaymentMode(initialFilters.paymentMode);
    setFrom(initialFilters.from);
    setTo(initialFilters.to);
  }, [
    initialFilters.q,
    initialFilters.branchId,
    initialFilters.status,
    initialFilters.paymentMode,
    initialFilters.from,
    initialFilters.to,
  ]);

  const navigate = (next: {
    report: ReportSlug;
    q?: string;
    branchId?: string;
    status?: string;
    paymentMode?: PaymentModeFilter;
    from?: string;
    to?: string;
  }) => {
    const params = new URLSearchParams();
    params.set("report", next.report);
    const trimmedQ = (next.q ?? "").trim();
    if (trimmedQ) params.set("q", trimmedQ);
    if (next.branchId) params.set("branchId", next.branchId);
    if (next.status && next.status !== "ALL") params.set("status", next.status);
    if (next.paymentMode && next.paymentMode !== "ALL") params.set("paymentMode", next.paymentMode);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}` as never);
    });
  };

  const selectReport = (slug: ReportSlug) => {
    if (slug === definition.slug) return;
    // Preserve shared branch and Oman date bounds; reset report-specific status/mode/search.
    navigate({
      report: slug,
      branchId,
      from,
      to,
    });
  };

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    navigate({
      report: definition.slug,
      q,
      branchId,
      status: definition.supportsStatus ? status : "ALL",
      paymentMode: definition.supportsPaymentMode ? paymentMode : "ALL",
      from,
      to,
    });
  };

  const clearFilters = () => {
    setQ("");
    setBranchId("");
    setStatus("ALL");
    setPaymentMode("ALL");
    setFrom("");
    setTo("");
    navigate({ report: definition.slug });
  };

  const applyPreset = (preset: "today" | "7d" | "month" | "all") => {
    if (preset === "all") {
      setFrom("");
      setTo("");
      navigate({
        report: definition.slug,
        q,
        branchId,
        status: definition.supportsStatus ? status : "ALL",
        paymentMode: definition.supportsPaymentMode ? paymentMode : "ALL",
      });
      return;
    }
    const now = new Date();
    const todayStr = formatOmanDateTime(now).slice(0, 10);
    let nextFrom = todayStr;
    const nextTo = todayStr;
    if (preset === "7d") {
      nextFrom = formatOmanDateTime(new Date(now.getTime() - 6 * 86_400_000)).slice(0, 10);
    } else if (preset === "month") {
      nextFrom = `${todayStr.slice(0, 7)}-01`;
    }
    setFrom(nextFrom);
    setTo(nextTo);
    navigate({
      report: definition.slug,
      q,
      branchId,
      status: definition.supportsStatus ? status : "ALL",
      paymentMode: definition.supportsPaymentMode ? paymentMode : "ALL",
      from: nextFrom,
      to: nextTo,
    });
  };

  const hasFilters = Boolean(
    initialFilters.q ||
      initialFilters.branchId ||
      initialFilters.status !== "ALL" ||
      initialFilters.paymentMode !== "ALL" ||
      initialFilters.from ||
      initialFilters.to,
  );

  return (
    <div className="space-y-4 print:hidden" aria-busy={pending}>
      {/* 12-Report Selector */}
      <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Select Report (12 Available)
            </h2>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="shrink-0">Jump to:</span>
            <select
              aria-label="Report selector"
              value={definition.slug}
              onChange={(e) => selectReport(e.target.value as ReportSlug)}
              className="min-h-10 rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            >
              {REPORT_LIST.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.number}. {r.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {REPORT_LIST.map((item) => {
            const active = item.slug === definition.slug;
            return (
              <button
                key={item.slug}
                type="button"
                aria-pressed={active}
                onClick={() => selectReport(item.slug)}
                className={`min-h-11 rounded-xl border px-3 py-2 text-start text-xs transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 font-semibold text-[var(--accent)]"
                    : "border-[var(--edge)] bg-[var(--raised)] text-[var(--muted)] hover:border-white/30 hover:text-white"
                }`}
              >
                {item.shortTitle}
              </button>
            );
          })}
        </div>
      </section>

      {/* Filter Bar */}
      <form
        onSubmit={apply}
        className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-5"
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid min-w-0 gap-1 text-sm">
            <span>Search</span>
            <input
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={definition.searchPlaceholder}
              aria-label="Search report rows"
              className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            />
          </label>

          {definition.supportsBranch && (
            <label className="grid min-w-0 gap-1 text-sm">
              <span>Branch</span>
              <select
                name="branchId"
                aria-label="Filter by branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="">All permitted branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} · {branch.code}
                  </option>
                ))}
              </select>
            </label>
          )}

          {definition.supportsStatus && (
            <label className="grid min-w-0 gap-1 text-sm">
              <span>{definition.statusLabel}</span>
              <select
                name="status"
                aria-label={`Filter by ${definition.statusLabel}`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="ALL">All</option>
                {definition.statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {definition.supportsPaymentMode && (
            <label className="grid min-w-0 gap-1 text-sm">
              <span>Payment Mode</span>
              <select
                name="paymentMode"
                aria-label="Filter by payment mode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentModeFilter)}
                className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              >
                <option value="ALL">All payment modes</option>
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {formatPaymentModeLabel(mode)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="grid min-w-0 gap-1 text-sm">
            <label htmlFor="reportFrom">From Date ({definition.dateRangeLabel}, Oman)</label>
            <CalendarInput
              id="reportFrom"
              name="from"
              type="date"
              value={from}
              onChange={setFrom}
              className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3"
              wrapperClassName="w-full"
            />
          </div>

          <div className="grid min-w-0 gap-1 text-sm">
            <label htmlFor="reportTo">To Date ({definition.dateRangeLabel}, Oman)</label>
            <CalendarInput
              id="reportTo"
              name="to"
              type="date"
              min={from || undefined}
              value={to}
              onChange={setTo}
              className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3"
              wrapperClassName="w-full"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-black disabled:opacity-60 sm:flex-none"
            >
              {pending ? "Loading…" : "Apply Filters"}
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                disabled={pending}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm text-[var(--muted)] hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--edge)] pt-3 text-xs">
          <span className="text-[var(--muted)]">Quick range (Oman):</span>
          <button
            type="button"
            onClick={() => applyPreset("today")}
            className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyPreset("7d")}
            className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset("month")}
            className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
          >
            This Month
          </button>
          {(from || to) && (
            <button
              type="button"
              onClick={() => applyPreset("all")}
              className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
            >
              All Dates
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
