"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const STATUS_OPTIONS = [
  ["all", "All"],
  ["active", "Active"],
  ["removed", "Removed"],
] as const;

export function BlacklistControls({
  total,
  activeCount,
  removedCount,
}: {
  total: number;
  activeCount: number;
  removedCount: number;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = params.get("status") ?? "all";

  const navigate = (nextQuery: string, nextStatus = status) => {
    const next = new URLSearchParams(params.toString());
    if (nextQuery.trim()) next.set("q", nextQuery.trim());
    else next.delete("q");
    if (nextStatus !== "all") next.set("status", nextStatus);
    else next.delete("status");
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

  const countFor = (value: string) =>
    value === "active"
      ? activeCount
      : value === "removed"
        ? removedCount
        : activeCount + removedCount;

  return (
    <div className="mt-6 space-y-3" aria-busy={pending}>
      <div className="flex max-w-xl gap-2">
        <label className="min-w-0 flex-1 text-sm">
          <span className="sr-only">Search blacklist</span>
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => navigate(value), 300);
            }}
            placeholder="Search customer, ID, mobile, reason, or description"
            className="min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3"
          />
        </label>
        {query && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setQuery("");
              navigate("");
            }}
            className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex max-w-full flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => navigate(query, value)}
            aria-pressed={status === value}
            className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${status === value ? "border-[var(--accent)] bg-[var(--accent)] font-medium text-black" : "border-[var(--edge)]"}`}
          >
            {label} ({countFor(value)})
          </button>
        ))}
        {(status !== "all" || query) && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setQuery("");
              navigate("", "all");
            }}
            className="min-h-10 px-2 text-sm text-[var(--accent)]"
          >
            Reset filters
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--muted)]" role="status">
        {pending
          ? "Updating blacklist register…"
          : `${total} matching record${total === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
