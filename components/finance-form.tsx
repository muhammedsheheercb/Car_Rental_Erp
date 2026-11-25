"use client";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { financeAction } from "@/app/[locale]/(protected)/finance/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translateFieldLabel, translateValidation } from "@/lib/i18n-helpers";
import { SearchableCombobox } from "./searchable-combobox";

type FinanceBooking = {
  id: string;
  name: string;
  vehicleId: string;
  registration?: string;
  snapshot: Record<string, string | number | null>;
  from: string;
  to: string;
};

type PreviousLegalFine = {
  id: string;
  vehicleId: string;
  date: string;
  amount: string;
  details: string;
};

function normalizeReg(value: string) {
  return value.toLowerCase().replace(/[\s-]+/g, "");
}

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
  previous?: PreviousLegalFine[];
}) {
  const tRoot = useTranslations();
  const tFinance = useTranslations("finance");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tFields = useTranslations("fieldLabels");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(financeAction, { error: "", message: "" });
  const [bookingId, setBookingId] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lookupReg, setLookupReg] = useState("");
  const [lookupFrom, setLookupFrom] = useState("");
  const [lookupTo, setLookupTo] = useState("");
  const [lookupNotice, setLookupNotice] = useState<{
    type: "match" | "empty";
    text: string;
  } | null>(null);
  const [overrideDates, setOverrideDates] = useState<{ from?: string; to?: string }>({});

  useEffect(() => {
    if (state.message) setRequestId(crypto.randomUUID());
  }, [state]);

  const booking = bookings.find((b) => b.id === bookingId);
  const fine = operation === "fine" || operation === "edit";
  const showNormalFineLookup = operation === "fine" && kind === "NORMAL" && bookings.length > 0;
  const showLegalSidePanel = operation === "fine" && kind === "LEGAL";
  const vehiclePreviousFines = booking
    ? previous.filter((p) => p.vehicleId === booking.vehicleId)
    : [];

  const handleFindMatchingBooking = () => {
    const queryReg = normalizeReg(lookupReg.trim());
    if (!queryReg && !lookupFrom && !lookupTo) {
      setLookupNotice({ type: "empty", text: tFinance("noMatchingBooking") });
      return;
    }
    const candidates = bookings.filter((b) => {
      const regTarget = normalizeReg(b.registration ?? b.name);
      const nameTarget = normalizeReg(b.name);
      const regMatch = !queryReg || regTarget.includes(queryReg) || nameTarget.includes(queryReg);
      if (!regMatch) return false;
      if (lookupFrom && lookupTo) {
        return b.from <= lookupTo && b.to >= lookupFrom;
      }
      if (lookupFrom) {
        return b.from <= lookupFrom && b.to >= lookupFrom;
      }
      if (lookupTo) {
        return b.from <= lookupTo && b.to >= lookupTo;
      }
      return true;
    });
    const exactMatch = queryReg
      ? candidates.find((b) => normalizeReg(b.registration ?? "") === queryReg)
      : undefined;
    const matched = exactMatch ?? candidates[0];
    if (matched) {
      setBookingId(matched.id);
      setRequestId(crypto.randomUUID());
      setOverrideDates({
        from: lookupFrom || undefined,
        to: lookupTo || undefined,
      });
      setLookupNotice({
        type: "match",
        text: tFinance("matchedBookingNotice", { name: matched.name }),
      });
    } else {
      setLookupNotice({ type: "empty", text: tFinance("noMatchingBooking") });
    }
  };

  const formContent = (
    <form
      ref={formRef}
      action={action}
      className="grid min-w-0 gap-4 rounded-xl border border-[var(--edge)] p-4 print:hidden"
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
      {showNormalFineLookup && (
        <div className="grid gap-3 rounded-lg border border-[var(--edge)] bg-black/20 p-3">
          <div>
            <h3 className="text-sm font-semibold">{tFinance("fineLookupHeading")}</h3>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tFinance("fineLookupHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              {tCommon("registration")}
              <input
                type="text"
                value={lookupReg}
                onChange={(e) => setLookupReg(e.target.value)}
                placeholder={tFinance("regSearchPlaceholder")}
                className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              {tFinance("dateFrom")}
              <input
                type="datetime-local"
                value={lookupFrom}
                onChange={(e) => setLookupFrom(e.target.value)}
                className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
            <label className="grid gap-1 text-xs text-[var(--muted)]">
              {tFinance("dateTo")}
              <input
                type="datetime-local"
                value={lookupTo}
                onChange={(e) => setLookupTo(e.target.value)}
                className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleFindMatchingBooking}
              className="min-h-11 rounded-lg border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black"
            >
              {tFinance("findMatchingBooking")}
            </button>
            {lookupNotice && (
              <p
                role={lookupNotice.type === "empty" ? "alert" : "status"}
                className={`text-xs ${lookupNotice.type === "match" ? "text-[var(--accent)]" : "text-amber-300"}`}
              >
                {lookupNotice.text}
              </p>
            )}
          </div>
        </div>
      )}
      {!!bookings.length && (
        <>
          <SearchableCombobox
            label={tFinance("bookingPickerLabel")}
            value={bookingId}
            options={bookings}
            onChange={(id) => {
              setBookingId(id);
              setOverrideDates({});
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
              {translateFieldLabel(tFields, k)}: {v ?? "—"}
            </p>
          ))}
        </div>
      )}
      {operation !== "delete" && (
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("amountOmr")}
          <input
            name="amount"
            required
            type="text"
            inputMode="decimal"
            pattern="^\d+(\.\d{1,3})?$"
            placeholder="0.000"
            defaultValue={record?.amount}
            className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
      )}
      {fine && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm">
              {tFinance("dateFrom")}
              <input
                key={`from-${bookingId}-${overrideDates.from ?? ""}`}
                name="dateFrom"
                type="datetime-local"
                required
                defaultValue={overrideDates.from ?? record?.from ?? booking?.from}
                className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {tFinance("dateTo")}
              <input
                key={`to-${bookingId}-${overrideDates.to ?? ""}`}
                name="dateTo"
                type="datetime-local"
                required
                defaultValue={overrideDates.to ?? record?.to ?? booking?.to}
                className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
          </div>
          <label className="grid min-w-0 gap-1 text-sm">
            {tFinance("fineDetails")}
            <textarea
              name="details"
              required
              rows={3}
              maxLength={2000}
              defaultValue={record?.details}
              className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] p-3 text-sm text-[var(--ink)]"
            />
          </label>
        </>
      )}
      {(operation === "payment" || operation === "correction") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm">
            {tCommon("paymentMode")}
            <select
              name="method"
              defaultValue={record?.method ?? "CASH"}
              className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            >
              <option value="CASH">{tStatus("CASH")}</option>
              <option value="CARD">{tStatus("CARD")}</option>
              <option value="BANK_TRANSFER">{tStatus("BANK_TRANSFER")}</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            {tCommon("reference")}
            <input
              name="reference"
              maxLength={120}
              className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            />
          </label>
        </div>
      )}
      {operation !== "delete" && (
        <label className="grid min-w-0 gap-1 text-sm">
          {operation === "correction" ? tFinance("correctionReason") : tCommon("remarks")}
          <textarea
            name="remarks"
            rows={2}
            maxLength={1000}
            required={operation === "correction" || operation === "refund"}
            defaultValue={record?.remarks}
            className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] p-3 text-sm text-[var(--ink)]"
          />
        </label>
      )}
      {(operation === "edit" || operation === "delete") && (
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("reason")}
          <input
            name="reason"
            required
            maxLength={1000}
            className="min-h-11 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>
      )}
      {state.error && (
        <p role="alert" className="text-red-400">
          {translateValidation(tRoot, state.error)}
        </p>
      )}
      {state.message && <p role="status">{translateValidation(tRoot, state.message)}</p>}
      {operation === "delete" ? (
        <ConfirmDialog
          title={tFinance("deleteLegalFine")}
          description={tFinance("legalFineNotice")}
          confirmLabel={tFinance("deleteLegalFine")}
          pending={pending}
          processingLabel={tCommon("saving")}
          onConfirm={() => {
            formRef.current?.requestSubmit();
          }}
          trigger={
            <button
              type="button"
              disabled={pending}
              onClick={(event) => {
                if (formRef.current && !formRef.current.reportValidity()) {
                  event.preventDefault();
                }
              }}
              className="rounded-lg bg-[var(--accent)] px-4 py-3 text-black disabled:opacity-50"
            >
              {pending ? tCommon("saving") : tFinance("deleteLegalFine")}
            </button>
          }
        />
      ) : (
        <button
          type="submit"
          disabled={pending || (!!bookings.length && !bookingId)}
          className="rounded-lg bg-[var(--accent)] px-4 py-3 text-black disabled:opacity-50"
        >
          {pending ? tCommon("saving") : tCommon("save")}
        </button>
      )}
    </form>
  );

  if (!showLegalSidePanel) return formContent;

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start print:hidden">
      {formContent}
      <aside className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
        <h3 className="text-base font-semibold">{tFinance("previousLegalFines")}</h3>
        {!booking ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{tFinance("bookingPickerLabel")}</p>
        ) : !vehiclePreviousFines.length ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{tFinance("noPreviousLegalFines")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-[var(--edge)] text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-start">{tCommon("date")}</th>
                  <th className="px-2 py-2 text-start">{tCommon("amount")}</th>
                  <th className="px-2 py-2 text-start">{tFinance("fineDetails")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--edge)]">
                {vehiclePreviousFines.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{p.date}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-medium text-[var(--accent)]">
                      {p.amount}
                    </td>
                    <td className="break-words px-2 py-2">{p.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}
