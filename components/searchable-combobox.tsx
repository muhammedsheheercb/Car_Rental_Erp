"use client";

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
        onClick={() => setOpen(true)}
        className="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg border border-[var(--edge)] bg-black/20 px-3 text-start text-white disabled:opacity-50"
      >
        <span className={selected ? "truncate" : "text-[var(--muted)]"}>
          {selected?.name ??
            (disabled ? "Select a brand first" : `Select ${label.toLocaleLowerCase()}`)}
        </span>
        <span>⌄</span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="mt-1 text-xs text-[var(--muted)]"
        >
          Clear selection
        </button>
      )}
      {open && !disabled && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 w-full min-w-0 rounded-xl border border-[var(--edge)] bg-[#171815] p-2 shadow-2xl">
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
            placeholder={`Search ${label.toLocaleLowerCase()}…`}
            className="min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3 text-white placeholder:text-[var(--muted)]"
          />
          <div className="mt-2 max-h-60 overflow-y-auto">
            {results.length ? (
              results.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option.id);
                  }}
                  className={`block min-h-11 w-full break-words rounded-lg px-3 py-3 text-start text-sm ${active === index ? "bg-[var(--accent)] text-black" : "text-white hover:bg-white/10"}`}
                >
                  {option.name}
                </button>
              ))
            ) : (
              <p className="p-3 text-sm text-[var(--muted)]">
                No matching options. Clear the search to view all options.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
