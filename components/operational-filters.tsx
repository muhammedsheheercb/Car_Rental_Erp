"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const fields = [
  ["registration", "Registration number"],
  ["branch", "Branch"],
  ["user", "User"],
  ["brand", "Brand"],
  ["model", "Model"],
] as const;

export function OperationalFilters() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      setValues(Object.fromEntries(fields.map(([name]) => [name, searchParams.get(name) ?? ""]))),
    [searchParams],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const apply = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [name] of fields)
      next[name]?.trim() ? params.set(name, next[name].trim()) : params.delete(name);
    params.delete("page");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`));
  };
  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      className="relative"
    >
      <summary className="min-h-11 cursor-pointer list-none content-center px-2 text-sm text-[var(--muted)]">
        Filters
      </summary>
      <div className="absolute end-0 top-12 z-40 w-[min(22rem,calc(100vw-1.5rem))] border border-[var(--edge)] bg-[var(--raised)] p-3 shadow-2xl">
        <p className="mb-2 text-xs text-[var(--muted)]">
          Operational filters apply to modules where relevant.
        </p>
        <div className="grid gap-2">
          {fields.map(([name, label]) => (
            <label key={name} className="grid gap-1 text-xs">
              {label}
              <input
                value={values[name] ?? ""}
                onChange={(event) => {
                  const next = { ...values, [name]: event.target.value };
                  setValues(next);
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => apply(next), 300);
                }}
                className="min-h-10 border border-[var(--edge)] bg-[var(--surface)] px-2 text-sm"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const next = {};
              setValues(next);
              apply(next);
            }}
            className="min-h-10 px-2 text-sm text-[var(--accent)]"
          >
            Clear filters
          </button>
          {pending && <span className="text-xs text-[var(--muted)]">Updating…</span>}
        </div>
      </div>
    </details>
  );
}
