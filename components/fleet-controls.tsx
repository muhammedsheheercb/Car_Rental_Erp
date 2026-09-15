"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const filters = [
  ["all", "All vehicles"],
  ["available", "Available"],
  ["unavailable", "Not available"],
  ["mulkiya_expired", "Mulkiya expired"],
  ["insurance_expired", "Insurance expired"],
] as const;

export function FleetControls({ total }: { total: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filter = params.get("filter") ?? "all";
  const navigate = (nextQuery: string, nextFilter = filter) => {
    const next = new URLSearchParams(params.toString());
    nextQuery.trim() ? next.set("q", nextQuery.trim()) : next.delete("q");
    nextFilter !== "all" ? next.set("filter", nextFilter) : next.delete("filter");
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
  return (
    <div className="mt-6 space-y-3" aria-busy={pending}>
      <div className="flex max-w-xl gap-2">
        <label className="min-w-0 flex-1 text-sm">
          <span className="sr-only">Search vehicles</span>
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => navigate(value), 300);
            }}
            placeholder="Search vehicle, number, registration, brand, or model"
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
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [overscroll-behavior-inline:contain]">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => navigate(query, value)}
            aria-pressed={filter === value}
            className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${filter === value ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-[var(--edge)]"}`}
          >
            {label}
          </button>
        ))}
        {filter !== "all" && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setQuery("");
              navigate("", "all");
            }}
            className="min-h-10 shrink-0 rounded-full px-3 text-sm text-[var(--accent)]"
          >
            Clear all
          </button>
        )}
      </div>
      <p className="text-sm text-[var(--muted)]" role="status">
        {pending ? "Searching vehicles…" : `${total} vehicle${total === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
