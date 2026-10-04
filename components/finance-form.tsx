"use client";
import { useActionState, useEffect, useState } from "react";
import { financeAction } from "@/app/[locale]/(protected)/finance/actions";
import { SearchableCombobox } from "./searchable-combobox";
export type FinanceBooking = {
  id: string;
  name: string;
  vehicleId: string;
  snapshot: Record<string, string | number | null>;
  from: string;
  to: string;
};
export function FinanceForm({
  operation,
  kind,
  bookings = [],
  record,
  previous = [],
}: {
  operation: string;
  kind?: string;
  bookings?: FinanceBooking[];
  record?: {
    id: string;
    amount: string;
    method?: string;
    details?: string;
    remarks?: string;
    from?: string;
    to?: string;
  };
  previous?: { id: string; vehicleId: string; text: string }[];
}) {
  const [state, action, pending] = useActionState(financeAction, { error: "", message: "" });
  const [bookingId, setBookingId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.message) setRequestId(crypto.randomUUID());
  }, [state]);
  const booking = bookings.find((b) => b.id === bookingId);
  const fine = operation === "fine" || operation === "edit";
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-[var(--edge)] p-4 print:hidden"
    >
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="requestId" value={requestId} />
      {record && (
        <>
          <input type="hidden" name="paymentId" value={record.id} />
          <input type="hidden" name="fineId" value={record.id} />
        </>
      )}
      {!!bookings.length && (
        <>
          <SearchableCombobox
            label="Booking Number / Customer / Vehicle"
            value={bookingId}
            options={bookings}
            onChange={(id) => {
              setBookingId(id);
              setRequestId(crypto.randomUUID());
            }}
          />
          <input type="hidden" name="rentalId" value={bookingId} />
        </>
      )}
      {booking && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(booking.snapshot).map(([k, v]) => (
            <p key={k}>
              {k}: {v ?? "—"}
            </p>
          ))}
        </div>
      )}
      {kind === "LEGAL" && booking && (
        <aside className="rounded-lg border border-[var(--edge)] p-3">
          <h3>Previous legal fines for this vehicle</h3>
          {previous
            .filter((p) => p.vehicleId === booking.vehicleId)
            .map((p) => (
              <p key={p.id} className="mt-2 text-sm">
                {p.text}
              </p>
            ))}
          {!previous.some((p) => p.vehicleId === booking.vehicleId) && (
            <p>No previous legal fines.</p>
          )}
        </aside>
      )}
      {operation !== "delete" && (
        <label>
          Amount (OMR)
          <input
            name="amount"
            required
            type="number"
            step="0.001"
            min={operation === "correction" ? "0" : "0.001"}
            defaultValue={record?.amount}
          />
        </label>
      )}
      {fine && (
        <>
          <label>
            Date From (Oman)
            <input
              key={`from-${bookingId}`}
              name="dateFrom"
              type="datetime-local"
              required
              defaultValue={record?.from ?? booking?.from}
            />
          </label>
          <label>
            Date To (Oman)
            <input
              key={`to-${bookingId}`}
              name="dateTo"
              type="datetime-local"
              required
              defaultValue={record?.to ?? booking?.to}
            />
          </label>
          <label>
            Fine details
            <textarea name="details" required maxLength={2000} defaultValue={record?.details} />
          </label>
        </>
      )}
      {(operation === "payment" || operation === "correction") && (
        <>
          <label>
            Payment Mode
            <select name="method" defaultValue={record?.method ?? "CASH"}>
              <option>CASH</option>
              <option>CARD</option>
              <option>BANK_TRANSFER</option>
            </select>
          </label>
          <label>
            Reference
            <input name="reference" maxLength={120} />
          </label>
        </>
      )}
      {operation !== "delete" && (
        <label>
          {operation === "correction"
            ? "Correction reason (zero amount reverses receipt)"
            : "Remarks"}
          <textarea
            name="remarks"
            maxLength={1000}
            required={operation === "correction" || operation === "refund"}
            defaultValue={record?.remarks}
          />
        </label>
      )}
      {(operation === "edit" || operation === "delete") && (
        <label>
          Reason
          <input name="reason" required maxLength={1000} />
        </label>
      )}
      {state.error && (
        <p role="alert" className="text-red-400">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
      <button
        type="submit"
        disabled={pending || (!!bookings.length && !bookingId)}
        className="rounded-lg bg-[var(--accent)] px-4 py-3 text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : operation === "delete" ? "Delete legal fine" : "Save"}
      </button>
    </form>
  );
}
