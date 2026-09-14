"use client";
import { useMemo, useState, useTransition } from "react";
import { createVehicleAction } from "@/app/[locale]/(protected)/fleet/actions";
import { SearchableCombobox } from "./searchable-combobox";

type Option = { id: string; name: string };
type Model = Option & { brandId: string };
type Branch = Option & { code: string };
const fields: Record<number, [string, string, string?][]> = {
  1: [
    ["year", "Year", "number"],
    ["cylinderCount", "Cylinder count", "number"],
    ["color", "Color"],
    ["registrationNumber", "Registration number"],
    ["capacity", "Capacity"],
    ["seatCount", "Seat count", "number"],
    ["engineNumber", "Engine number"],
    ["chassisNumber", "Chassis number"],
    ["purchaseDate", "Purchase date", "date"],
    ["currentOdometerKm", "Current odometer (km)", "number"],
  ],
  2: [
    ["insuranceCompany", "Insurance company"],
    ["insuranceNumber", "Insurance number"],
    ["insuranceValidUntil", "Valid until", "date"],
  ],
  3: [
    ["lastEngineServiceKm", "Last engine service (km)", "number"],
    ["lastGearOilChangeKm", "Last gear-oil change (km)", "number"],
    ["engineServiceIntervalKm", "Engine service interval (km)", "number"],
    ["gearOilIntervalKm", "Gear-oil interval (km)", "number"],
    ["mulkiyaExpiryDate", "Mulkiya expiry", "date"],
    ["mulkiyaIssuingDetail", "Mulkiya issuing detail"],
  ],
};
const cls = "mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3";
export function VehicleWizard({
  brands,
  models,
  branches,
}: {
  brands: Option[];
  models: Model[];
  branches: Branch[];
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Record<string, string>>({
    fuelType: "PETROL",
    gearbox: "AUTOMATIC",
  });
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const fuelOptions = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"].map((name) => ({
    id: name,
    name,
  }));
  const gearboxOptions = ["AUTOMATIC", "MANUAL"].map((name) => ({ id: name, name }));
  const set = (name: string, value: string) => setData((old) => ({ ...old, [name]: value }));
  const visible = useMemo(
    () => models.filter((model) => model.brandId === data.brandId),
    [models, data.brandId],
  );
  const input = ([name, label, type = "text"]: [string, string, string?]) => (
    <label key={name} className="block text-sm">
      {label}
      <input
        type={type}
        required={name !== "mulkiyaIssuingDetail"}
        value={data[name] ?? ""}
        onChange={(e) => set(name, e.target.value)}
        className={cls}
      />
    </label>
  );
  const pricing = (period: string) => (
    <div className="border-s-2 border-[var(--accent)] ps-4">
      <h3>{period}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {["listRentBaisa", "minimumRentBaisa", "includedKm", "excessKmChargeBaisa"].map((key) =>
          input([`${period.toLowerCase()}_${key}`, key.replace(/([A-Z])/g, " $1"), "number"]),
        )}
      </div>
    </div>
  );
  const submit = () =>
    start(async () => {
      try {
        const prices = (period: string) => ({
          listRentBaisa: Number(data[`${period}_listRentBaisa`]),
          minimumRentBaisa: Number(data[`${period}_minimumRentBaisa`]),
          includedKm: Number(data[`${period}_includedKm`]),
          excessKmChargeBaisa: Number(data[`${period}_excessKmChargeBaisa`]),
        });
        const result = await createVehicleAction({
          ...data,
          year: Number(data.year),
          cylinderCount: Number(data.cylinderCount),
          seatCount: Number(data.seatCount),
          currentOdometerKm: Number(data.currentOdometerKm),
          lastEngineServiceKm: Number(data.lastEngineServiceKm),
          lastGearOilChangeKm: Number(data.lastGearOilChangeKm),
          engineServiceIntervalKm: Number(data.engineServiceIntervalKm),
          gearOilIntervalKm: Number(data.gearOilIntervalKm),
          lateFeeBaisa: Number(data.lateFeeBaisa),
          daily: prices("daily"),
          weekly: prices("weekly"),
          monthly: prices("monthly"),
        });
        if (!result.ok || !result.id) {
          setError(result.message);
          return;
        }
        window.location.assign("/en/fleet");
      } catch {
        setError(
          "Could not create vehicle. Check required values, uniqueness, and your price permission.",
        );
      }
    });
  return (
    <div className="mx-auto min-w-0 max-w-4xl">
      <p className="text-sm text-[var(--accent)]">FLEET / CREATE</p>
      <h1 className="mt-2 text-3xl font-semibold">New vehicle</h1>
      <div className="mt-6 flex max-w-full gap-2 overflow-x-auto pb-1 text-xs [scrollbar-width:thin] sm:mt-7 sm:grid sm:grid-cols-4 sm:overflow-visible">
        {["Details", "Insurance", "Service", "Rental"].map((name, i) => (
          <div
            key={name}
            className={`min-w-[7rem] sm:min-w-0 ${
              step === i + 1
                ? "border-b-2 border-[var(--accent)] pb-2"
                : "border-b border-[var(--edge)] pb-2 text-[var(--muted)]"
            }`}
          >
            {i + 1}. {name}
          </div>
        ))}
      </div>
      <section className="mt-6 min-w-0 overflow-visible rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:mt-7 sm:p-5">
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SearchableCombobox
              label="Brand"
              value={data.brandId ?? ""}
              options={brands}
              onChange={(id) => {
                set("brandId", id);
                set("modelId", "");
              }}
            />
            <SearchableCombobox
              label="Model"
              value={data.modelId ?? ""}
              options={visible}
              disabled={!data.brandId}
              onChange={(id) => set("modelId", id)}
            />
            <SearchableCombobox
              label="Fuel"
              value={data.fuelType}
              options={fuelOptions}
              onChange={(id) => set("fuelType", id)}
            />
            <SearchableCombobox
              label="Gearbox"
              value={data.gearbox}
              options={gearboxOptions}
              onChange={(id) => set("gearbox", id)}
            />
            {fields[1].map(input)}
          </div>
        )}
        {step === 2 && <div className="grid gap-4 sm:grid-cols-2">{fields[2].map(input)}</div>}
        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields[3].map(input)}
            <SearchableCombobox
              label="Assigned branch"
              value={data.branchId ?? ""}
              options={branches.map((branch) => ({
                id: branch.id,
                name: `${branch.name} · ${branch.code}`,
              }))}
              onChange={(id) => set("branchId", id)}
            />
          </div>
        )}
        {step === 4 && (
          <div className="space-y-6">
            {pricing("Daily")}
            {pricing("Weekly")}
            {pricing("Monthly")}
            {input(["lateFeeBaisa", "Common late fee (baisa)", "number"])}
            {input(["overrideReason", "Price override reason (only below minimum)"])}
          </div>
        )}
        <div className="mt-8 flex flex-col-reverse gap-3 min-[360px]:flex-row min-[360px]:justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
            className="min-h-11 w-full rounded-lg border border-[var(--edge)] px-4 min-[360px]:w-auto"
          >
            Back
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black min-[360px]:w-auto"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black min-[360px]:w-auto"
            >
              {pending ? "Saving…" : "Create vehicle"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-red-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
