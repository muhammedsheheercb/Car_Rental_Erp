"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  activateBookingAction,
  deleteBookingAction,
  updateBookingAction,
} from "@/app/[locale]/(protected)/rentals/actions";
import {
  calculateExpectedReturn,
  formatOmanDateTime,
  parseOmanDateTime,
  type RentalPeriod,
} from "@/features/rentals/booking-calculations";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

type BranchOption = { id: string; name: string; code: string };

export function BookingRowActions({
  locale,
  booking,
  branches,
  canUpdate,
  canDelete,
  canPrint,
}: {
  locale: string;
  booking: {
    id: string;
    agreement: string;
    status: "RESERVED" | "ACTIVE" | "RETURNED" | "CANCELLED";
    startsAtIso: string;
    pricingPeriod: RentalPeriod;
    rentDuration: number;
    pickupBranchId: string;
    returnBranchId: string;
    pickupOdometerKm: number;
    freeKm: number;
    openKm: boolean;
    notes: string;
    vehicleLabel: string;
    customerName: string;
  };
  branches: BranchOption[];
  canUpdate: boolean;
  canDelete: boolean;
  canPrint: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startKm, setStartKm] = useState(String(booking.pickupOdometerKm));
  const [startsAt, setStartsAt] = useState(formatOmanDateTime(new Date(booking.startsAtIso)));
  const [period, setPeriod] = useState<RentalPeriod>(booking.pricingPeriod);
  const [duration, setDuration] = useState(String(booking.rentDuration));
  const [pickupBranchId, setPickupBranchId] = useState(booking.pickupBranchId);
  const [returnBranchId, setReturnBranchId] = useState(booking.returnBranchId);
  const [pickupOdometerKm, setPickupOdometerKm] = useState(String(booking.pickupOdometerKm));
  const [freeKm, setFreeKm] = useState(String(booking.freeKm));
  const [openKm, setOpenKm] = useState(booking.openKm);
  const [notes, setNotes] = useState(booking.notes);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const { show } = useToast();
  const router = useRouter();

  let previewExpectedReturn = "";
  try {
    previewExpectedReturn = formatOmanDateTime(
      calculateExpectedReturn(parseOmanDateTime(startsAt), period, Number(duration)),
    );
  } catch {
    /* incomplete input */
  }

  const openEdit = () => {
    setStartsAt(formatOmanDateTime(new Date(booking.startsAtIso)));
    setPeriod(booking.pricingPeriod);
    setDuration(String(booking.rentDuration));
    setPickupBranchId(booking.pickupBranchId);
    setReturnBranchId(booking.returnBranchId);
    setPickupOdometerKm(String(booking.pickupOdometerKm));
    setFreeKm(String(booking.freeKm));
    setOpenKm(booking.openKm);
    setNotes(booking.notes);
    setError("");
    setEditing(true);
  };

  const submitEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const formData = new FormData();
    formData.set("rentalId", booking.id);
    formData.set("pickupBranchId", pickupBranchId);
    formData.set("returnBranchId", returnBranchId);
    formData.set("freeKm", freeKm);
    if (openKm) formData.set("openKm", "on");
    formData.set("notes", notes.trim());
    if (booking.status === "RESERVED") {
      formData.set("startsAt", startsAt);
      formData.set("pricingPeriod", period);
      formData.set("rentDuration", duration);
      formData.set("pickupOdometerKm", pickupOdometerKm);
    }
    startTransition(async () => {
      const result = await updateBookingAction(formData);
      if (!result.ok) {
        setError(result.message);
        show(result.message, "error", `booking-edit-${booking.id}`);
        return;
      }
      show(result.message, "success", `booking-edit-${booking.id}`);
      setEditing(false);
      router.refresh();
    });
  };

  const submitStartRental = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!/^\d+$/.test(startKm.trim())) {
      setError("Enter a valid starting odometer reading.");
      return;
    }
    startTransition(async () => {
      const result = await activateBookingAction(booking.id, Number(startKm.trim()));
      if (!result.ok) {
        setError(result.message);
        show(result.message, "error", `booking-start-${booking.id}`);
        return;
      }
      show(result.message, "success", `booking-start-${booking.id}`);
      setStarting(false);
      router.refresh();
    });
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteBookingAction(booking.id);
      show(result.message, result.ok ? "success" : "error", `booking-delete-${booking.id}`);
      if (result.ok) router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  const editable = canUpdate && ["RESERVED", "ACTIVE"].includes(booking.status);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
        <Link
          href={`/${locale}/rentals/${booking.id}` as never}
          className="min-h-9 content-center rounded-lg border border-[var(--edge)] px-2.5 text-white hover:border-[var(--accent)]"
        >
          View
        </Link>
        {canPrint && (
          <Link
            href={`/${locale}/documents/agreement/${booking.id}` as never}
            className="min-h-9 content-center rounded-lg border border-[var(--edge)] px-2.5 text-[var(--muted)] hover:text-white"
          >
            Print
          </Link>
        )}
        {canUpdate && booking.status === "RESERVED" && (
          <button
            type="button"
            onClick={() => {
              setStartKm(String(booking.pickupOdometerKm));
              setError("");
              setStarting(true);
            }}
            className="min-h-9 rounded-lg bg-[var(--accent)] px-2.5 font-semibold text-black"
          >
            Start
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={openEdit}
            className="min-h-9 rounded-lg px-2 font-medium text-[var(--accent)]"
          >
            Edit
          </button>
        )}
        {canDelete && booking.status === "RESERVED" && (
          <ConfirmDialog
            title={`Delete booking ${booking.agreement}?`}
            description={`Customer: ${booking.customerName} (${booking.vehicleLabel}). Only pending reservations without payments, invoices, fines, or operational records can be permanently deleted.`}
            confirmLabel="Delete booking"
            processingLabel="Deleting…"
            pending={deleting}
            onConfirm={handleDelete}
            trigger={
              <button
                type="button"
                disabled={deleting}
                className="min-h-9 rounded-lg px-2 font-medium text-red-300 disabled:opacity-50"
              >
                Delete
              </button>
            }
          />
        )}
      </div>

      {starting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Start rental ${booking.agreement}`}
          onMouseDown={() => !pending && setStarting(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <form
            onSubmit={submitStartRental}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 text-start sm:max-w-md sm:rounded-2xl sm:p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              PICK-UP / START RENTAL
            </p>
            <h2 className="mt-1 text-xl font-semibold">{booking.agreement}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {booking.customerName} · {booking.vehicleLabel}
            </p>
            <label className="mt-4 block text-sm">
              Starting odometer (KM)
              <input
                value={startKm}
                onChange={(e) => setStartKm(e.target.value)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                required
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setStarting(false)}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-60"
              >
                {pending ? "Starting…" : "Confirm pick-up"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit booking ${booking.agreement}`}
          onMouseDown={() => !pending && setEditing(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <form
            onSubmit={submitEdit}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] text-start sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  EDIT BOOKING ({booking.status})
                </p>
                <h2 className="mt-1 text-xl font-semibold">{booking.agreement}</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {booking.customerName} · {booking.vehicleLabel}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close edit booking modal"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="min-h-11 px-3 text-lg"
              >
                ×
              </button>
            </header>

            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              {booking.status === "RESERVED" ? (
                <>
                  <label className="block text-sm">
                    Pickup date & time (Oman)
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      required
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                    />
                  </label>
                  <label className="block text-sm">
                    Expected return (Oman)
                    <input
                      type="datetime-local"
                      readOnly
                      value={previewExpectedReturn}
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/10 px-3 text-[var(--muted)]"
                    />
                  </label>
                  <label className="block text-sm">
                    Rental category
                    <select
                      value={period}
                      onChange={(e) => setPeriod(e.target.value as RentalPeriod)}
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Duration
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      required
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                    />
                  </label>
                  <label className="block text-sm">
                    Pickup branch
                    <select
                      value={pickupBranchId}
                      onChange={(e) => setPickupBranchId(e.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} · {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Starting KM
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]+"
                      value={pickupOdometerKm}
                      onChange={(e) => setPickupOdometerKm(e.target.value)}
                      required
                      className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                    />
                  </label>
                </>
              ) : (
                <p className="rounded-lg border border-[var(--edge)] bg-black/20 p-3 text-xs text-[var(--muted)] sm:col-span-2">
                  Active rentals preserve their contracted pickup time and duration. Use{" "}
                  <strong>Approve contract extension</strong> on the agreement page to extend return
                  dates.
                </p>
              )}

              <label className="block text-sm">
                Return branch
                <select
                  value={returnBranchId}
                  onChange={(e) => setReturnBranchId(e.target.value)}
                  className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                Additional Free KM
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  value={freeKm}
                  onChange={(e) => setFreeKm(e.target.value)}
                  required
                  className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                />
              </label>

              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={openKm}
                  onChange={(e) => setOpenKm(e.target.checked)}
                />
                Open KM (disable excess kilometre charges)
              </label>

              <label className="block text-sm sm:col-span-2">
                Remarks / notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="mt-2 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
                />
              </label>

              {error && (
                <p role="alert" className="text-sm text-red-300 sm:col-span-2">
                  {error}
                </p>
              )}
            </div>

            <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[var(--edge)] bg-[var(--raised)] p-5 sm:flex-row sm:justify-end sm:p-6">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-black disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save booking changes"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
