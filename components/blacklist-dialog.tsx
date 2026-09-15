"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blacklistCustomerAction } from "@/app/[locale]/(protected)/customers/actions";
import { CalendarInput } from "./calendar-input";
import { useToast } from "./toast";

export function BlacklistDialog({
  customerId,
  customerName,
  customerNumber,
  mobile,
  trigger = "Add to Blacklist",
  onSuccess,
}: {
  customerId: string;
  customerName: string;
  customerNumber: string;
  mobile: string;
  trigger?: string;
  onSuccess?: (blacklistId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const { show } = useToast();
  const router = useRouter();
  const close = () => {
    if (!pending) setOpen(false);
  };
  const save = () => {
    const next: Record<string, string> = {};
    if (!reason.trim()) next.reason = "Reason is required.";
    if (!description.trim()) next.description = "Description is required.";
    if (startsAt && endsAt && endsAt < startsAt)
      next.endsAt = "End date cannot be before start date.";
    setErrors(next);
    if (Object.keys(next).length) return;
    start(async () => {
      try {
        const result = await blacklistCustomerAction({
          customerId,
          reason,
          description,
          startsAt,
          endsAt,
        });
        if (!result.ok || !result.id) {
          setErrors({ form: result.message });
          show(result.message, "error", `blacklist-${customerId}`);
          return;
        }
        show(result.message, "success", `blacklist-${customerId}`);
        onSuccess?.(result.id);
        router.refresh();
        setOpen(false);
      } catch {
        setErrors({ form: "We could not add this customer to the blacklist. Please retry." });
      }
    });
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 px-2 text-sm text-amber-200"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Add ${customerName} to blacklist`}
          onMouseDown={close}
          className="fixed inset-0 z-[60] grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div>
                <p className="text-sm text-[var(--accent)]">CUSTOMER BLACKLIST</p>
                <h2 className="mt-1 text-xl font-semibold">Add to Blacklist</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {customerName} · {customerNumber} · {mobile}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-200">
                  Currently eligible
                </span>
              </div>
              <button
                type="button"
                aria-label="Close blacklist form"
                disabled={pending}
                onClick={close}
                className="min-h-11 px-3"
              >
                ×
              </button>
            </header>
            <div className="space-y-5 p-5 sm:p-6">
              <section>
                <h3 className="font-medium">Blacklist reason</h3>
                <label className="mt-3 block text-sm">
                  Reason
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-invalid={Boolean(errors.reason)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                  />
                </label>
                {errors.reason && <p className="mt-1 text-sm text-red-300">{errors.reason}</p>}
                <label className="mt-4 block text-sm">
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-invalid={Boolean(errors.description)}
                    className="mt-2 min-h-28 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
                  />
                </label>
                {errors.description && (
                  <p className="mt-1 text-sm text-red-300">{errors.description}</p>
                )}
              </section>
              <section>
                <h3 className="font-medium">
                  Effective period{" "}
                  <span className="text-sm font-normal text-[var(--muted)]">(optional)</span>
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label htmlFor="blacklist-start" className="text-sm">
                    Start date
                    <CalendarInput id="blacklist-start" value={startsAt} onChange={setStartsAt} />
                  </label>
                  <label htmlFor="blacklist-end" className="text-sm">
                    End date
                    <CalendarInput id="blacklist-end" value={endsAt} onChange={setEndsAt} />
                  </label>
                </div>
                {errors.endsAt && <p className="mt-1 text-sm text-red-300">{errors.endsAt}</p>}
              </section>
              {errors.form && (
                <p role="alert" className="text-sm text-red-300">
                  {errors.form}
                </p>
              )}
            </div>
            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[var(--edge)] bg-[var(--raised)] p-5 sm:flex-row sm:justify-end sm:p-6">
              <button
                type="button"
                disabled={pending}
                onClick={close}
                className="min-h-11 rounded-lg px-4"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 font-semibold text-black"
              >
                {pending ? "Adding…" : "Add to Blacklist"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
