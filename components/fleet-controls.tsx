"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

const STATUS_FILTERS = [
  ["all", "All vehicles"],
  ["available", "Available"],
  ["on_rent", "On Rent"],
  ["reserved", "Reserved"],
  ["blocked", "Service / Transfer"],
  ["inactive", "Inactive"],
  ["mulkiya_expired", "Mulkiya expired"],
  ["insurance_expired", "Insurance expired"],
] as const;

type Option = { id: string; name: string };
type ModelOption = Option & { brandId: string };
type BranchOption = Option & { code: string };

export function FleetControls({
  total,
  branches = [],
  brands = [],
  models = [],
}: {
  total: number;
  branches?: BranchOption[];
  brands?: Option[];
  models?: ModelOption[];
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [registration, setRegistration] = useState(params.get("registration") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filter = params.get("filter") ?? "all";
  const branch = params.get("branch") ?? "";
  const brand = params.get("brand") ?? "";
  const model = params.get("model") ?? "";

  const visibleModels = useMemo(() => {
    if (!brand) return models;
    const matchedBrand = brands.find(
      (b) => b.id === brand || b.name.toLowerCase() === brand.toLowerCase(),
    );
    return matchedBrand ? models.filter((m) => m.brandId === matchedBrand.id) : models;
  }, [brand, brands, models]);

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      const trimmed = value.trim();
      if (trimmed && !(key === "filter" && trimmed === "all")) next.set(key, trimmed);
      else next.delete(key);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };

  useEffect(() => {
    setQuery(params.get("q") ?? "");
    setRegistration(params.get("registration") ?? "");
  }, [params]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hasAnyFilter = Boolean(
    query || registration || branch || brand || model || filter !== "all",
  );

  return (
    <div className="mt-6 space-y-3" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-[var(--muted)]">
          Search
          <input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => updateParams({ q: value }), 300);
            }}
            placeholder="SI no., registration, brand, model"
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
          />
        </label>

        <label className="text-xs text-[var(--muted)]">
          Registration number
          <input
            value={registration}
            onChange={(event) => {
              const value = event.target.value;
              setRegistration(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => updateParams({ registration: value }), 300);
            }}
            placeholder="Filter by plate / reg no."
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
          />
        </label>

        <label className="text-xs text-[var(--muted)]">
          Branch
          <select
            value={branch}
            onChange={(event) => updateParams({ branch: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
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
          Brand
          <select
            value={brand}
            onChange={(event) => updateParams({ brand: event.target.value, model: "" })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">All brands</option>
            {brands.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[var(--muted)]">
          Model
          <select
            value={model}
            onChange={(event) => updateParams({ model: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">All models</option>
            {visibleModels.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 [overscroll-behavior-inline:contain]">
        {STATUS_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => updateParams({ filter: value })}
            aria-pressed={filter === value}
            className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${filter === value ? "border-[var(--accent)] bg-[var(--accent)] font-medium text-black" : "border-[var(--edge)]"}`}
          >
            {label}
          </button>
        ))}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setQuery("");
              setRegistration("");
              updateParams({
                q: "",
                registration: "",
                branch: "",
                brand: "",
                model: "",
                filter: "all",
              });
            }}
            className="min-h-10 shrink-0 rounded-full px-3 text-sm text-[var(--accent)]"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        <p role="status">
          {pending ? "Updating vehicle overview…" : `${total} vehicle${total === 1 ? "" : "s"}`}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            Rented (Red)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white" />
            Available (White)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Reserved
          </span>
        </div>
      </div>
    </div>
  );
}
