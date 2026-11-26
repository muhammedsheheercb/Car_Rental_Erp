"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { LEDGER_FILTER_TYPES, type LedgerFilterType } from "@/features/ledger/calculations";
import { translateStatus } from "@/lib/i18n-helpers";

type CustomerOption = {
  id: string;
  customerNumber: string;
  name: string;
  mobile: string;
  blacklistId: string | null;
  isActive: boolean;
};

export function LedgerCustomerPicker({
  customers,
  selectedCustomerId,
  initialQuery,
}: {
  customers: CustomerOption[];
  selectedCustomerId: string;
  initialQuery: string;
}) {
  const tLedger = useTranslations("ledger");
  const tStatus = useTranslations("status");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}` as never, {
          scroll: false,
        });
      });
    }, 280);
  };

  const selectCustomer = (nextCustomerId: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (nextCustomerId) next.set("customerId", nextCustomerId);
    startTransition(() => {
      router.push(`${pathname}${next.size ? `?${next.toString()}` : ""}` as never);
    });
  };

  return (
    <div
      aria-busy={pending}
      className="grid gap-3 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end print:hidden"
    >
      <label className="block text-xs text-[var(--muted)]">
        {tLedger("searchCustomer")}
        <input
          type="search"
          name="q"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={tLedger("searchPlaceholder")}
          aria-label={tLedger("searchCustomer")}
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3 text-sm text-[var(--ink)]"
        />
      </label>

      <label className="block text-xs text-[var(--muted)]">
        {tLedger("selectCustomer", { count: customers.length })}
        <select
          aria-label={tLedger("chooseCustomer")}
          value={selectedCustomerId}
          onChange={(e) => selectCustomer(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3 text-sm text-[var(--ink)]"
        >
          <option value="">{tLedger("chooseCustomer")}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.customerNumber} · {c.mobile}
              {c.blacklistId
                ? ` [${tStatus("BLACKLISTED")}]`
                : !c.isActive
                  ? ` [${tStatus("INACTIVE")}]`
                  : ""}
            </option>
          ))}
        </select>
      </label>

      {selectedCustomerId && (
        <button
          type="button"
          onClick={() => selectCustomer("")}
          className="min-h-11 rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--muted)] hover:text-white"
        >
          {tLedger("allCustomers")}
        </button>
      )}
    </div>
  );
}

export function LedgerTransactionFilters({
  customerId,
  initialFrom,
  initialTo,
  initialType,
  searchQuery,
}: {
  customerId: string;
  initialFrom: string;
  initialTo: string;
  initialType: LedgerFilterType;
  searchQuery: string;
}) {
  const tLedger = useTranslations("ledger");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [type, setType] = useState<LedgerFilterType>(initialType);

  useEffect(() => {
    setFrom(initialFrom);
    setTo(initialTo);
    setType(initialType);
  }, [initialFrom, initialTo, initialType]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    next.set("customerId", customerId);
    if (searchQuery) next.set("q", searchQuery);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (type !== "ALL") next.set("type", type);
    router.push(`${pathname}?${next.toString()}` as never);
  };

  const clear = () => {
    setFrom("");
    setTo("");
    setType("ALL");
    const next = new URLSearchParams();
    next.set("customerId", customerId);
    if (searchQuery) next.set("q", searchQuery);
    router.push(`${pathname}?${next.toString()}` as never);
  };

  const hasFilters = Boolean(initialFrom || initialTo || initialType !== "ALL");

  return (
    <form
      onSubmit={apply}
      className="grid gap-3 rounded-xl border border-[var(--edge)] bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end print:hidden"
    >
      <label className="block text-xs text-[var(--muted)]">
        {tCommon("fromDate")}
        <input
          type="date"
          name="from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
        />
      </label>

      <label className="block text-xs text-[var(--muted)]">
        {tCommon("toDate")}
        <input
          type="date"
          name="to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
        />
      </label>

      <label className="block text-xs text-[var(--muted)]">
        {tLedger("transactionType")}
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as LedgerFilterType)}
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
        >
          {LEDGER_FILTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? tLedger("allTransactionTypes") : translateStatus(tStatus, t)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
        >
          {tCommon("filter")}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="min-h-11 rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--muted)] hover:text-white"
          >
            {tCommon("clear")}
          </button>
        )}
      </div>
    </form>
  );
}
