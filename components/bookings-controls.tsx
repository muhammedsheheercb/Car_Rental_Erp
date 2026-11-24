"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type BranchOption = { id: string; name: string; code: string };

const STATUSES = ["", "RESERVED", "ACTIVE", "RETURNED", "CANCELLED"] as const;

export function BookingsControls({ total, branches }: { total: number; branches: BranchOption[] }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = params.get("status") ?? "";
  const branch = params.get("branch") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      const trimmed = value.trim();
      if (trimmed) next.set(key, trimmed);
      else next.delete(key);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hasFilters = Boolean(query || status || branch || from || to);

  return (
    <div className="space-y-3 border-b border-[var(--edge)] p-4" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-[var(--muted)]">
          Search bookings
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => updateParams({ q: value }), 300);
            }}
            placeholder="Agreement, customer, vehicle, reg"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Status
          <select
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            {STATUSES.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "All statuses"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Branch
          <select
            value={branch}
            onChange={(event) => updateParams({ branch: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">All branches</option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          From date (Oman)
          <input
            type="date"
            value={from}
            onChange={(event) => updateParams({ from: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          To date (Oman)
          <input
            type="date"
            value={to}
            onChange={(event) => updateParams({ to: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <p role="status">
          {pending ? "Filtering bookings…" : `${total} booking${total === 1 ? "" : "s"}`}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setQuery("");
              updateParams({ q: "", status: "", branch: "", from: "", to: "" });
            }}
            className="min-h-9 px-2 text-sm text-[var(--accent)]"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
