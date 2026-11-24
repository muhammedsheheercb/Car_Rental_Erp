"use client";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { transferAction } from "@/app/[locale]/(protected)/transfers/actions";
import { parseOMR } from "@/features/finance/calculations";
import { omrInput } from "@/features/invoices/calculations";
import { transferBalance, transferMileage } from "@/features/transfers/calculations";
import { translateFieldLabel, translateValidation } from "@/lib/i18n-helpers";
import { SearchableCombobox } from "./searchable-combobox";
export type ReplacementOption = {
  id: string;
  name: string;
  details: Record<string, string | number | null>;
  startingKm: number;
};
export function TransferForm({
  rental,
  options,
  transferredAt,
}: {
  rental: {
    id: string;
    startingKm: number;
    maximumKm: number;
    freeKm: number;
    rate: number;
    openKm: boolean;
    balance: number;
  };
  options: ReplacementOption[];
  transferredAt: string;
}) {
  const tRoot = useTranslations();
  const tTransfers = useTranslations("transfers");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tFields = useTranslations("fieldLabels");
  const [state, action, pending] = useActionState(transferAction, { error: "", message: "" });
  const [requestId] = useState(() => crypto.randomUUID());
  const [vehicleId, setVehicleId] = useState("");
  const [endingKm, setEndingKm] = useState(String(rental.startingKm));
  const [charges, setCharges] = useState({ damage: "0", washing: "0", petrol: "0", received: "0" });
  const selected = options.find((o) => o.id === vehicleId);
  let preview:
    | (ReturnType<typeof transferMileage> & ReturnType<typeof transferBalance>)
    | undefined;
  let error = "";
  try {
    if (!/^\d+$/.test(endingKm)) throw new Error("Enter ending KM.");
    const mileage = transferMileage({
      startingKm: rental.startingKm,
      endingKm: Number(endingKm),
      maximumKm: rental.maximumKm,
      freeKm: rental.freeKm,
      excessRateBaisa: rental.rate,
      openKm: rental.openKm,
    });
    preview = {
      ...mileage,
      ...transferBalance(
        rental.balance,
        mileage.extraBaisa +
          parseOMR(charges.damage) +
          parseOMR(charges.washing) +
          parseOMR(charges.petrol),
        parseOMR(charges.received),
      ),
    };
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid values.";
  }
  const chargeLabels = {
    damage: tTransfers("damageOmr"),
    washing: tTransfers("washingOmr"),
    petrol: tTransfers("petrolOmr"),
    received: tTransfers("receivedOmr"),
  } as const;
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-[var(--edge)] p-4">
      <input type="hidden" name="rentalId" value={rental.id} />
      <input type="hidden" name="requestId" value={requestId} />
      <SearchableCombobox
        label={tTransfers("newTransferVehicle")}
        options={options}
        value={vehicleId}
        onChange={setVehicleId}
      />
      <input type="hidden" name="newVehicleId" value={vehicleId} />
      {selected && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(selected.details).map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-[var(--muted)]">{translateFieldLabel(tFields, k)}</dt>
              <dd>{v ?? "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          {tTransfers("transferDateTime")}
          <input
            name="transferredAt"
            type="datetime-local"
            defaultValue={transferredAt}
            required
            className="input mt-1"
          />
        </label>
        <label>
          {tTransfers("currentEndingKm")}
          <input
            name="endingKm"
            inputMode="numeric"
            pattern="[0-9]+"
            value={endingKm}
            onChange={(e) => setEndingKm(e.target.value)}
            required
            className="input mt-1"
          />
        </label>
        {selected && (
          <label>
            {tTransfers("newStartingKm")}
            <input
              key={selected.id}
              name="newStartingKm"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={selected.startingKm}
              required
              className="input mt-1"
            />
          </label>
        )}
        {(["damage", "washing", "petrol", "received"] as const).map((k) => (
          <label key={k}>
            {chargeLabels[k]}
            <input
              name={k}
              inputMode="decimal"
              value={charges[k]}
              onChange={(e) => setCharges({ ...charges, [k]: e.target.value })}
              required
              className="input mt-1"
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
      </div>
      {preview && (
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries({
            "Total KM": preview.totalKm,
            "Extra KM": preview.extraKm,
            "Extra KM Charge (OMR)": omrInput(preview.extraBaisa),
            "KM Maximum To Transfer": preview.remainingMaximumKm,
            "Free KM Transfer": preview.remainingFreeKm,
            "Balance To Transfer (OMR)": omrInput(preview.balanceToTransfer),
            "New Balance (OMR)": omrInput(preview.newBalance),
          }).map(([k, v]) => (
            <div key={k}>
              {translateFieldLabel(tFields, k)}: <strong>{v}</strong>
            </div>
          ))}
        </dl>
      )}
      <label>
        {tCommon("remarks")}
        <textarea name="remarks" required maxLength={1000} className="input mt-1" />
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
        disabled={pending || !selected || !!error || !!state.message}
      >
        {pending ? tTransfers("transferring") : tTransfers("submit")}
      </button>
    </form>
  );
}
