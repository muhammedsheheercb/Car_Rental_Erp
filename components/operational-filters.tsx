"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

const fields = [
  ["registration", "registrationNumber"],
  ["branch", "branch"],
  ["user", "user"],
  ["brand", "brand"],
  ["model", "model"],
] as const;

export function OperationalFilters({ direction = "down" }: { direction?: "down" | "up" }) {
  const tNav = useTranslations("nav");
  const tFilters = useTranslations("filters");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDetailsElement>(null);
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
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const apply = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [name] of fields)
      next[name]?.trim() ? params.set(name, next[name].trim()) : params.delete(name);
    params.delete("page");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`));
  };
  return (
    <details
      ref={containerRef}
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      className="relative"
    >
      <summary className="min-h-11 cursor-pointer list-none content-center rounded-lg px-2 text-xs text-[var(--muted)] transition-colors hover:bg-[var(--raised)] hover:text-[var(--ink)] sm:text-sm">
        {tNav("filters")}
      </summary>
      <div
        className={`z-50 rounded-2xl border border-[var(--edge)] bg-[var(--raised)] p-3.5 text-[var(--ink)] shadow-2xl ${
          direction === "up"
            ? "fixed inset-x-3 bottom-20 mx-auto max-w-sm sm:absolute sm:inset-x-auto sm:bottom-12 sm:start-0 sm:w-80"
            : "fixed inset-x-3 top-16 mx-auto max-w-sm sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-80"
        }`}
      >
        <p className="mb-2 text-xs text-[var(--muted)]">{tFilters("operationalHint")}</p>
        <div className="grid gap-2">
          {fields.map(([name, labelKey]) => (
            <label key={name} className="grid gap-1 text-xs">
              {tFilters(labelKey)}
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
            className="min-h-10 px-2 text-sm text-[var(--accent-ink)]"
          >
            {tCommon("clearFilters")}
          </button>
          {pending && <span className="text-xs text-[var(--muted)]">{tCommon("updating")}</span>}
        </div>
      </div>
    </details>
  );
}
