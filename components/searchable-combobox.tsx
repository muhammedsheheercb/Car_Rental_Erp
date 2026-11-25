"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

type Option = { id: string; name: string };
export function SearchableCombobox({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () =>
      options.filter((option) =>
        option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [options, query],
  );
  const selected = options.find((option) => option.id === value);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  const choose = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };
  return (
    <div ref={root} className="relative min-w-0 overflow-visible">
      <span className="block text-sm">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="mt-2 flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-start text-[var(--ink)] transition-colors hover:border-[#9A7B4F] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={selected ? "truncate font-medium text-[var(--ink)]" : "text-[var(--muted)]"}
        >
          {selected?.name ??
            (disabled
              ? t("selectBrandFirst")
              : t("selectField", { label: label.toLocaleLowerCase() }))}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">
          ⌄
        </span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {t("clearSelection")}
        </button>
      )}
      {open && !disabled && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 w-full min-w-0 rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-2 text-[var(--ink)] shadow-2xl">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" || event.key === "Tab") setOpen(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              }
              if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                choose(results[active].id);
              }
            }}
            placeholder={t("searchField", { label: label.toLocaleLowerCase() })}
            className="min-h-11 w-full rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--accent-ink)] focus:bg-[var(--surface)]"
          />
          <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
            {results.length ? (
              results.map((option, index) => {
                const isActive = active === index;
                const isSelected = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(option.id);
                    }}
                    className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 break-words rounded-lg px-3 py-2.5 text-start text-sm transition-colors ${
                      isActive
                        ? "bg-[#161513] font-semibold text-[#FAF8F5]"
                        : isSelected
                          ? "bg-[#F4F1EA] font-semibold text-[#8A6830]"
                          : "text-[var(--ink)] hover:bg-[#F4F1EA]"
                    }`}
                  >
                    <span className="min-w-0 break-words">{option.name}</span>
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-xs ${isActive ? "text-[#CFA968]" : "text-[#8A6830]"}`}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <p className="p-3 text-sm text-[var(--muted)]">{t("noMatchingOptions")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
