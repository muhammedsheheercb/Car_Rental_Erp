"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  blacklistCustomerAction,
  searchCustomersAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { translateValidation } from "@/lib/i18n-helpers";
import { CalendarInput } from "./calendar-input";
import { useToast } from "./toast";

export function BlacklistPicker() {
  const t = useTranslations();
  const tBl = useTranslations("customers.blacklistPage");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof searchCustomersAction>>>([]);
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
    number: string;
    mobile: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const { show } = useToast();
  const router = useRouter();

  const search = (value: string) => {
    setQ(value);
    start(async () => setRows(value.trim() ? await searchCustomersAction(value) : []));
  };

  const reset = () => {
    setQ("");
    setRows([]);
    setSelected(null);
    setReason("");
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setError("");
  };

  const save = () => {
    setError("");
    if (!selected) return setError(translateValidation(t, "Search and select a customer first."));
    if (!reason.trim()) return setError(translateValidation(t, "Reason is required."));
    if (!description.trim()) return setError(translateValidation(t, "Description is required."));
    if (startsAt && endsAt && endsAt < startsAt)
      return setError(translateValidation(t, "End date cannot be before start date."));
    start(async () => {
      const result = await blacklistCustomerAction({
        customerId: selected.id,
        reason,
        description,
        startsAt,
        endsAt,
      });
      show(result.message, result.ok ? "success" : "error");
      if (!result.ok) {
        setError(translateValidation(t, result.message));
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black"
      >
        {tBl("addBlacklistCustomer")}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tBl("addBlacklistCustomer")}
          onMouseDown={() => !pending && setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 text-start sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{tBl("addBlacklistCustomer")}</h2>
              <button
                type="button"
                aria-label={tCommon("close")}
                onClick={() => setOpen(false)}
                className="min-h-10 px-2 text-lg"
              >
                ×
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder={tBl("pickerPlaceholder")}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--edge)] bg-black/20 px-3 text-sm"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => search("")}
                  className="min-h-11 rounded-lg border border-[var(--edge)] px-3 text-sm"
                >
                  {tCommon("clear")}
                </button>
              )}
            </div>
            {pending && <p className="mt-2 text-xs text-[var(--muted)]">{tCommon("searching")}</p>}
            <div className="mt-2 max-h-36 overflow-auto rounded-lg">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => {
                    setSelected(row);
                    setRows([]);
                  }}
                  className="block w-full border-b border-[var(--edge)] bg-black/15 p-2.5 text-start text-sm hover:bg-white/10"
                >
                  {row.name} · {row.number} · {row.mobile}
                </button>
              ))}
            </div>
            {selected && (
              <p className="mt-2 text-sm text-[var(--accent)]">
                {tBl("selectedCustomer", { name: selected.name, number: selected.number })}
              </p>
            )}
            <label className="mt-3 block text-sm">
              {tCommon("reason")}
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            <label className="mt-3 block text-sm">
              {tCommon("description")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="mt-2 min-h-24 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label htmlFor="picker-bl-start" className="text-sm">
                {tBl("startDateOptional")}
                <CalendarInput id="picker-bl-start" value={startsAt} onChange={setStartsAt} />
              </label>
              <label htmlFor="picker-bl-end" className="text-sm">
                {tBl("endDateOptional")}
                <CalendarInput id="picker-bl-end" value={endsAt} onChange={setEndsAt} />
              </label>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-60"
              >
                {pending ? tCommon("saving") : tCommon("save")}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
