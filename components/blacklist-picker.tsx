"use client";
import { useState, useTransition } from "react";
import {
  blacklistCustomerAction,
  searchCustomersAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { useToast } from "./toast";
export function BlacklistPicker() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof searchCustomersAction>>>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  const { show } = useToast();
  const search = (value: string) => {
    setQ(value);
    start(async () => setRows(value ? await searchCustomersAction(value) : []));
  };
  const save = () =>
    start(async () => {
      if (!selected) return show("Select a customer.", "error");
      const result = await blacklistCustomerAction({
        customerId: selected.id,
        reason,
        description,
      });
      show(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setOpen(false);
        location.reload();
      }
    });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 min-h-11 rounded-lg bg-[var(--accent)] px-4 font-semibold text-black"
      >
        Add Blacklist Customer
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3"
        >
          <section className="w-full max-w-lg rounded-2xl bg-[var(--raised)] p-5">
            <h2 className="text-lg font-semibold">Add Blacklist Customer</h2>
            <div className="mt-4 flex gap-2">
              <input
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder="Search name, ID, mobile, Civil ID, passport or licence"
                className="min-h-11 min-w-0 flex-1 rounded border border-[var(--edge)] bg-black/20 px-3"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => search("")}
                  className="min-h-11 border border-[var(--edge)] px-3"
                >
                  Clear
                </button>
              )}
            </div>
            {pending && <p className="mt-2 text-sm text-[var(--muted)]">Searching…</p>}
            <div className="mt-2 max-h-36 overflow-auto">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => {
                    setSelected(row);
                    setRows([]);
                  }}
                  className="block w-full border-b border-[var(--edge)] p-2 text-start text-sm"
                >
                  {row.name} · {row.number} · {row.mobile}
                </button>
              ))}
            </div>
            {selected && (
              <p className="mt-2 text-sm text-[var(--accent)]">Selected: {selected.name}</p>
            )}
            <label className="mt-3 block text-sm">
              Reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 min-h-11 w-full rounded border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            <label className="mt-3 block text-sm">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 min-h-24 w-full rounded border border-[var(--edge)] bg-black/20 p-3"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="min-h-11 rounded bg-[var(--accent)] px-4 text-black"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
