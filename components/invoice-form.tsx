"use client";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { invoiceAction } from "@/app/[locale]/(protected)/invoices/actions";
import { parseOMR } from "@/features/finance/calculations";
import { invoiceCalculation, omrInput } from "@/features/invoices/calculations";
import { translateFieldLabel, translateStatus, translateValidation } from "@/lib/i18n-helpers";
import { SearchableCombobox } from "./searchable-combobox";
export type InvoiceBooking = {
  id: string;
  name: string;
  subtotal: number;
  deposit: number;
  advance: number;
  received: number;
  paybacks: number;
  ledgerBalance: number;
  transferBalance: number;
  snapshot: Record<string, string | number | null>;
  canFinalize: boolean;
};
export function InvoiceForm({
  bookings,
  initialBooking,
  record,
}: {
  bookings: InvoiceBooking[];
  initialBooking?: string;
  record?: { id: string; washing: string; petrol: string; discount: string; remarks: string };
}) {
  const tRoot = useTranslations();
  const tInvoices = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tFields = useTranslations("fieldLabels");
  const [state, action, pending] = useActionState(invoiceAction, { error: "", message: "" });
  const [requestId] = useState(() => crypto.randomUUID());
  const [bookingId, setBookingId] = useState(initialBooking ?? "");
  const [values, setValues] = useState({
    washing: record?.washing ?? "0",
    petrol: record?.petrol ?? "0",
    discount: record?.discount ?? "0",
    received: "0",
  });
  const booking = bookings.find((b) => b.id === bookingId);
  let calc: ReturnType<typeof invoiceCalculation> | undefined;
  let error = "";
  if (booking)
    try {
      calc = invoiceCalculation({
        subtotal: booking.subtotal,
        deposit: booking.deposit,
        washing: parseOMR(values.washing),
        petrol: parseOMR(values.petrol),
        discount: parseOMR(values.discount),
        advance: booking.advance,
        previouslyReceived: booking.received,
        paybacks: booking.paybacks,
        received: parseOMR(values.received),
      });
      if (
        parseOMR(values.received) >
        Math.max(
          0,
          booking.ledgerBalance +
            parseOMR(values.washing) +
            parseOMR(values.petrol) -
            parseOMR(values.discount),
        )
      )
        throw new Error("Received amount exceeds the ledger outstanding amount.");
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid amounts.";
    }
  const inputLabels = {
    washing: tInvoices("washingOmr"),
    petrol: tInvoices("petrolOmr"),
    discount: tInvoices("discountOmr"),
    received: tInvoices("receivedAmountOmr"),
  } as const;
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-[var(--edge)] p-4 print:hidden"
    >
      <input type="hidden" name="requestId" value={requestId} />
      {record && <input type="hidden" name="invoiceId" value={record.id} />}
      {record ? (
        <p>{tInvoices("bookingLabel", { name: booking?.name ?? "" })}</p>
      ) : (
        <SearchableCombobox
          label={tInvoices("billBookingNumber")}
          options={bookings}
          value={bookingId}
          onChange={setBookingId}
        />
      )}
      <input type="hidden" name="rentalId" value={bookingId} />
      {booking && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(booking.snapshot).map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-[var(--muted)]">{translateFieldLabel(tFields, k)}</dt>
                <dd>
                  {v == null
                    ? "—"
                    : k === "Status" || k === "Rental Type"
                      ? translateStatus(tStatus, String(v))
                      : v}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {tInvoices("transferBalanceCarried", { amount: omrInput(booking.transferBalance) })}
          </p>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["washing", "petrol", "discount", "received"] as const).map((k) => (
          <label key={k}>
            {inputLabels[k]}
            <input
              name={k}
              inputMode="decimal"
              required
              className="input mt-1"
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          {tCommon("paymentMode")}
          <select name="method" className="input mt-1">
            <option value="CASH">{tStatus("CASH")}</option>
            <option value="CARD">{tStatus("CARD")}</option>
            <option value="BANK_TRANSFER">{tStatus("BANK_TRANSFER")}</option>
          </select>
        </label>
        <label>
          {tCommon("status")}
          <select name="status" className="input mt-1">
            <option value="DRAFT">{tStatus("DRAFT")}</option>
            {booking?.canFinalize && <option value="FINALIZED">{tInvoices("finalize")}</option>}
          </select>
        </label>
      </div>
      {calc && booking && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries({
            "Subtotal (OMR)": calc.subtotal,
            "Total Amount / Grand Total (OMR)": calc.grandTotal,
            "Advance Received (OMR)": booking.advance,
            "Previously Received (OMR)": booking.received,
            "Remaining Collectible (OMR)": Math.min(
              calc.outstanding,
              Math.max(
                0,
                booking.ledgerBalance +
                  parseOMR(values.washing) +
                  parseOMR(values.petrol) -
                  parseOMR(values.discount),
              ),
            ),
            "Balance (OMR)":
              booking.ledgerBalance +
              parseOMR(values.washing) +
              parseOMR(values.petrol) -
              parseOMR(values.discount) -
              parseOMR(values.received),
          }).map(([k, v]) => (
            <div key={k}>
              {translateFieldLabel(tFields, k)}: <strong>{omrInput(v)}</strong>
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm text-[var(--muted)]">{tInvoices("draftNote")}</p>
      <label>
        {tCommon("remarks")}
        <textarea
          name="remarks"
          className="input mt-1"
          maxLength={1000}
          defaultValue={record?.remarks}
        />
      </label>
      {(error || state.error) && (
        <p role="alert" className="text-red-400">
          {translateValidation(tRoot, state.error || error)}
        </p>
      )}
      {state.message && <p role="status">{translateValidation(tRoot, state.message)}</p>}
      <button
        type="submit"
        className="btn"
        disabled={pending || !booking || !!error || !!state.message}
      >
        {pending ? tCommon("saving") : tInvoices("saveInvoice")}
      </button>
    </form>
  );
}
export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const tRoot = useTranslations();
  const tInvoices = useTranslations("invoices");
  const [state, action, pending] = useActionState(invoiceAction, { error: "", message: "" });
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-[var(--edge)] p-4 print:hidden"
    >
      <input type="hidden" name="operation" value="void" />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label>
        {tInvoices("voidReason")}
        <textarea name="reason" className="input mt-1" required maxLength={1000} />
      </label>
      <p>{tInvoices("voidNote")}</p>
      {state.error && <p role="alert">{translateValidation(tRoot, state.error)}</p>}
      {state.message && <p role="status">{translateValidation(tRoot, state.message)}</p>}
      <button type="submit" disabled={pending || !!state.message} className="btn">
        {tInvoices("voidInvoice")}
      </button>
    </form>
  );
}
