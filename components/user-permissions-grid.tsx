"use client";
import { useRef } from "react";

const MODULES = [
  "dashboard",
  "branches",
  "users",
  "fleet",
  "customers",
  "bookings",
  "rentals",
  "finance",
  "reports",
  "settings",
] as const;

const ACTIONS = [
  "create",
  "read",
  "update",
  "delete",
  "print",
  "export",
  "approve",
  "override_price",
] as const;

export function UserPermissionsGrid({
  defaultSelected = [],
  maxHeightClass = "max-h-72",
}: {
  defaultSelected?: string[];
  maxHeightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(defaultSelected);

  const toggleAll = (checked: boolean, moduleName?: string) => {
    const root = containerRef.current;
    if (!root) return;
    const selector = moduleName
      ? `input[type="checkbox"][data-module="${moduleName}"]`
      : 'input[type="checkbox"][name="permissions"]';
    for (const box of root.querySelectorAll<HTMLInputElement>(selector)) {
      box.checked = checked;
    }
  };

  return (
    <fieldset className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-medium">Module permissions</legend>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="min-h-8 rounded border border-[var(--edge)] px-2 text-[var(--accent)]"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="min-h-8 rounded border border-[var(--edge)] px-2 text-[var(--muted)]"
          >
            Clear all
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`mt-2 ${maxHeightClass} space-y-3 overflow-y-auto rounded-lg border border-[var(--edge)] bg-black/15 p-3`}
      >
        {MODULES.map((moduleName) => (
          <div key={moduleName} className="border-b border-[var(--edge)]/60 pb-2 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {moduleName}
              </p>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => toggleAll(true, moduleName)}
                  className="text-[var(--accent)] hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => toggleAll(false, moduleName)}
                  className="text-[var(--muted)] hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {ACTIONS.map((action) => {
                const value = `${moduleName}:${action}`;
                return (
                  <label key={value} className="flex min-h-9 items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={value}
                      data-module={moduleName}
                      defaultChecked={selectedSet.has(value)}
                    />
                    <span>{action.replaceAll("_", " ")}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
