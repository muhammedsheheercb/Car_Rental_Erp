"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  getCustomerBlacklistHistoryAction,
  updateBlacklistEntryAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { CalendarInput } from "./calendar-input";
import { useToast } from "./toast";
import { UnblacklistButton } from "./unblacklist-button";

type HistoryPayload = Awaited<ReturnType<typeof getCustomerBlacklistHistoryAction>>;

const formatOmanDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Muscat",
    dateStyle: "medium",
    timeStyle: "short",
  });

export function BlacklistRowActions({
  entry,
  canUpdate,
}: {
  entry: {
    id: string;
    customerId: string;
    customerName: string;
    customerNumber: string;
    reason: string;
    description: string;
    startsAt: string | null;
    endsAt: string | null;
    isActive: boolean;
  };
  canUpdate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reason, setReason] = useState(entry.reason);
  const [description, setDescription] = useState(entry.description);
  const [startsAt, setStartsAt] = useState(entry.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(entry.endsAt ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [historyLoading, startHistory] = useTransition();
  const [historyError, setHistoryError] = useState("");
  const [historyData, setHistoryData] = useState<HistoryPayload | null>(null);
  const { show } = useToast();
  const router = useRouter();

  const openEdit = () => {
    setReason(entry.reason);
    setDescription(entry.description);
    setStartsAt(entry.startsAt ?? "");
    setEndsAt(entry.endsAt ?? "");
    setErrors({});
    setEditing(true);
  };

  const saveEdit = () => {
    const next: Record<string, string> = {};
    if (!reason.trim()) next.reason = "Reason is required.";
    if (!description.trim()) next.description = "Description is required.";
    if (startsAt && endsAt && endsAt < startsAt)
      next.endsAt = "End date cannot be before start date.";
    setErrors(next);
    if (Object.keys(next).length) return;
    startSave(async () => {
      try {
        const result = await updateBlacklistEntryAction({
          id: entry.id,
          reason,
          description,
          startsAt,
          endsAt,
        });
        if (!result.ok) {
          setErrors({ form: result.message });
          show(result.message, "error", `blacklist-edit-${entry.id}`);
          return;
        }
        show(result.message, "success", `blacklist-edit-${entry.id}`);
        setEditing(false);
        router.refresh();
      } catch {
        setErrors({ form: "We could not update this blacklist record. Please retry." });
      }
    });
  };

  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryError("");
    setHistoryData(null);
    startHistory(async () => {
      try {
        setHistoryData(await getCustomerBlacklistHistoryAction(entry.customerId));
      } catch (cause) {
        setHistoryError(
          cause instanceof Error ? cause.message : "Could not load blacklist history.",
        );
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {canUpdate && (
          <button
            type="button"
            onClick={openEdit}
            className="min-h-10 rounded-lg px-2 text-sm font-medium text-[var(--accent)]"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={openHistory}
          className="min-h-10 rounded-lg border border-[var(--edge)] px-2.5 text-sm"
        >
          History
        </button>
        {canUpdate && entry.isActive && (
          <UnblacklistButton
            id={entry.id}
            name={entry.customerName}
            customerNumber={entry.customerNumber}
            reason={entry.reason}
          />
        )}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit blacklist entry for ${entry.customerName}`}
          onMouseDown={() => !saving && setEditing(false)}
          className="fixed inset-0 z-[60] grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveEdit();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] text-start sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  BLACKLIST ENTRY
                </p>
                <h2 className="mt-1 text-xl font-semibold">Edit Blacklist Details</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {entry.customerName} · {entry.customerNumber}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close edit blacklist dialog"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="min-h-11 px-3 text-lg"
              >
                ×
              </button>
            </header>

            <div className="space-y-4 p-5 sm:p-6">
              <label className="block text-sm">
                Reason
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-invalid={Boolean(errors.reason)}
                  maxLength={300}
                  className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                />
              </label>
              {errors.reason && <p className="text-sm text-red-300">{errors.reason}</p>}

              <label className="block text-sm">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={Boolean(errors.description)}
                  maxLength={2000}
                  className="mt-2 min-h-28 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
                />
              </label>
              {errors.description && <p className="text-sm text-red-300">{errors.description}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor={`edit-bl-start-${entry.id}`} className="text-sm">
                  Start date (optional)
                  <CalendarInput
                    id={`edit-bl-start-${entry.id}`}
                    value={startsAt}
                    onChange={setStartsAt}
                  />
                </label>
                <label htmlFor={`edit-bl-end-${entry.id}`} className="text-sm">
                  End date (optional)
                  <CalendarInput
                    id={`edit-bl-end-${entry.id}`}
                    value={endsAt}
                    onChange={setEndsAt}
                  />
                </label>
              </div>
              {errors.endsAt && <p className="text-sm text-red-300">{errors.endsAt}</p>}
              {errors.form && (
                <p role="alert" className="text-sm text-red-300">
                  {errors.form}
                </p>
              )}
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[var(--edge)] bg-[var(--raised)] p-5 sm:flex-row sm:justify-end sm:p-6">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(false)}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {historyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Blacklist history for ${entry.customerName}`}
          onMouseDown={() => setHistoryOpen(false)}
          className="fixed inset-0 z-[60] grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] text-start sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  BLACKLIST HISTORY
                </p>
                <h2 className="mt-1 text-xl font-semibold">{entry.customerName}</h2>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                  {entry.customerNumber}
                  {historyData ? ` · ${historyData.customer.mobile}` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close history dialog"
                onClick={() => setHistoryOpen(false)}
                className="min-h-11 px-3 text-lg"
              >
                ×
              </button>
            </header>

            <div className="space-y-4 p-5 sm:p-6">
              {historyLoading && (
                <p className="text-sm text-[var(--muted)]">Loading customer blacklist history…</p>
              )}
              {historyError && (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-red-300">
                    {historyError}
                  </p>
                  <button
                    type="button"
                    onClick={openHistory}
                    className="min-h-10 rounded-lg border border-[var(--edge)] px-3 text-sm"
                  >
                    Retry
                  </button>
                </div>
              )}
              {historyData && (
                <>
                  <p className="text-sm text-[var(--muted)]">
                    {historyData.entries.length} total blacklist record
                    {historyData.entries.length === 1 ? "" : "s"} (active and removed).
                  </p>
                  <div className="space-y-3">
                    {historyData.entries.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="break-words font-semibold">{item.reason}</h3>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs ${item.isActive ? "bg-red-400/20 text-red-200" : "bg-white/10 text-[var(--muted)]"}`}
                          >
                            {item.isActive ? "Active" : "Removed"}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-[var(--ink)]">{item.description}</p>
                        <dl className="mt-3 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                          <div>
                            <dt>Effective period</dt>
                            <dd className="text-[var(--ink)]">
                              {item.startsAt ?? "—"} – {item.endsAt ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>Recorded by</dt>
                            <dd className="text-[var(--ink)]">{item.recordedBy ?? "System"}</dd>
                          </div>
                          <div>
                            <dt>Created (Oman)</dt>
                            <dd className="text-[var(--ink)]">
                              {formatOmanDateTime(item.createdAt)}
                            </dd>
                          </div>
                          <div>
                            <dt>Removed (Oman)</dt>
                            <dd className="text-[var(--ink)]">
                              {item.deactivatedAt ? formatOmanDateTime(item.deactivatedAt) : "—"}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
