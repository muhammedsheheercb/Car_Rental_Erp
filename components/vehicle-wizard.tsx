"use client";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  createVehicleAction,
  updateVehicleAction,
  uploadVehicleImageAction,
} from "@/app/[locale]/(protected)/fleet/actions";
import { translateStatus, translateValidation } from "@/lib/i18n-helpers";
import { CalendarInput } from "./calendar-input";
import { DocumentPicker } from "./document-picker";
import { SearchableCombobox } from "./searchable-combobox";

type Option = { id: string; name: string };
type Model = Option & { brandId: string };
type Branch = Option & { code: string };
const fields: Record<number, [string, string, string?][]> = {
  1: [
    ["vehicleNumber", "vehicleNumber"],
    ["year", "year", "number"],
    ["cylinderCount", "cylinderCount", "number"],
    ["color", "color"],
    ["registrationNumber", "registrationNumber"],
    ["capacity", "capacity"],
    ["seatCount", "seatCount", "number"],
    ["engineNumber", "engineNumber"],
    ["chassisNumber", "chassisNumber"],
    ["purchaseDate", "purchaseDate", "date"],
    ["currentOdometerKm", "currentOdometerKm", "number"],
  ],
  2: [
    ["insuranceCompany", "insuranceCompany"],
    ["insuranceNumber", "insuranceNumber"],
    ["insuranceValidUntil", "insuranceValidUntil", "date"],
  ],
  3: [
    ["lastEngineServiceKm", "lastEngineServiceKm", "number"],
    ["lastGearOilChangeKm", "lastGearOilChangeKm", "number"],
    ["engineServiceIntervalKm", "engineServiceIntervalKm", "number"],
    ["gearOilIntervalKm", "gearOilIntervalKm", "number"],
    ["mulkiyaExpiryDate", "mulkiyaExpiryDate", "date"],
    ["mulkiyaIssuingDetail", "mulkiyaIssuingDetail"],
  ],
};
const cls = "mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3";
export function VehicleWizard({
  brands,
  models,
  branches,
  vehicleId,
  initialData,
  existingImage,
  onSuccess,
}: {
  brands: Option[];
  models: Model[];
  branches: Branch[];
  vehicleId?: string;
  initialData?: Record<string, string>;
  existingImage?: {
    id: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  } | null;
  onSuccess?: (message: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const tWizard = useTranslations("fleet.wizard");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Record<string, string>>({
    fuelType: "PETROL",
    gearbox: "AUTOMATIC",
    ...initialData,
  });
  const [vehiclePhoto, setVehiclePhoto] = useState<{
    file: File;
    width: number;
    height: number;
  } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const fuelOptions = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"].map((id) => ({
    id,
    name: translateStatus(tStatus, id),
  }));
  const gearboxOptions = ["AUTOMATIC", "MANUAL"].map((id) => ({
    id,
    name: translateStatus(tStatus, id),
  }));
  const set = (name: string, value: string) => setData((old) => ({ ...old, [name]: value }));
  const visible = useMemo(
    () => models.filter((model) => model.brandId === data.brandId),
    [models, data.brandId],
  );
  const input = ([name, labelKey, type = "text"]: [string, string, string?]) => (
    <label key={name} htmlFor={name} className="block text-sm">
      {tWizard(labelKey)}
      {type === "date" ? (
        <CalendarInput
          id={name}
          required={name !== "mulkiyaIssuingDetail"}
          value={
            data[name] ??
            (
              { lateGraceMinutes: "60", lateWindowHours: "4", overdueFineBaisa: "5000" } as Record<
                string,
                string
              >
            )[name] ??
            ""
          }
          onChange={(value) => set(name, value)}
        />
      ) : (
        <input
          id={name}
          type={type === "number" ? "text" : type}
          inputMode={type === "number" ? "numeric" : undefined}
          pattern={type === "number" ? "[0-9]+" : undefined}
          required={name !== "mulkiyaIssuingDetail"}
          value={
            data[name] ??
            (
              { lateGraceMinutes: "60", lateWindowHours: "4", overdueFineBaisa: "5000" } as Record<
                string,
                string
              >
            )[name] ??
            ""
          }
          onChange={(e) => set(name, e.target.value)}
          className={cls}
        />
      )}
    </label>
  );
  const pricing = (period: "DAILY" | "WEEKLY" | "MONTHLY") => (
    <div className="border-s-2 border-[var(--accent)] ps-4">
      <h3>{translateStatus(tStatus, period)}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["listRentBaisa", "minimumRentBaisa", "includedKm", "excessKmChargeBaisa"] as const).map(
          (key) => input([`${period.toLowerCase()}_${key}`, key, "number"]),
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
        const payload = {
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
          lateGraceMinutes: Number(data.lateGraceMinutes ?? 60),
          lateWindowHours: Number(data.lateWindowHours ?? 4),
          overdueFineBaisa: Number(data.overdueFineBaisa ?? 5000),
          daily: prices("daily"),
          weekly: prices("weekly"),
          monthly: prices("monthly"),
        };
        const result = vehicleId
          ? await updateVehicleAction(vehicleId, payload)
          : await createVehicleAction(payload);
        if (!result.ok || (!vehicleId && (!("id" in result) || !result.id))) {
          setError(translateValidation(t, result.message));
          return;
        }
        const savedId =
          vehicleId ?? ("id" in result && typeof result.id === "string" ? result.id : undefined);
        if (vehiclePhoto && savedId) {
          const formData = new FormData();
          formData.set("file", vehiclePhoto.file);
          formData.set("width", String(vehiclePhoto.width));
          formData.set("height", String(vehiclePhoto.height));
          const uploadResult = await uploadVehicleImageAction(savedId, formData);
          if (!uploadResult.ok) {
            setError(translateValidation(t, uploadResult.message));
            return;
          }
        }
        if (onSuccess) onSuccess(result.message);
        else window.location.assign(`/${locale}/fleet`);
      } catch {
        setError(translateValidation(t, "Invalid values."));
      }
    });
  return (
    <div className="mx-auto min-w-0 max-w-4xl">
      <p className="text-sm text-[var(--accent)]">
        {vehicleId ? tWizard("eyebrowEdit") : tWizard("eyebrowCreate")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">
        {vehicleId ? tWizard("editTitle") : tWizard("newTitle")}
      </h1>
      <div className="mt-6 flex max-w-full gap-2 overflow-x-auto pb-1 text-xs [scrollbar-width:thin] sm:mt-7 sm:grid sm:grid-cols-4 sm:overflow-visible">
        {(["step1", "step2", "step3", "step4"] as const).map((stepKey, i) => (
          <div
            key={stepKey}
            className={`min-w-[7rem] sm:min-w-0 ${
              step === i + 1
                ? "border-b-2 border-[var(--accent)] pb-2"
                : "border-b border-[var(--edge)] pb-2 text-[var(--muted)]"
            }`}
          >
            {tWizard(stepKey)}
          </div>
        ))}
      </div>
      <section className="mt-6 min-w-0 overflow-visible rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:mt-7 sm:p-5">
        {step === 1 && (
          <div className="space-y-4">
            <DocumentPicker
              label={tWizard("vehiclePhoto")}
              existing={existingImage ?? undefined}
              existingUrl={existingImage ? `/api/vehicle-images/${existingImage.id}` : undefined}
              hint={tWizard("vehiclePhotoHint")}
              onChange={(file, width, height) =>
                setVehiclePhoto(file ? { file, width, height } : null)
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SearchableCombobox
                label={tWizard("brand")}
                value={data.brandId ?? ""}
                options={brands}
                onChange={(id) => {
                  set("brandId", id);
                  set("modelId", "");
                }}
              />
              <SearchableCombobox
                label={tWizard("model")}
                value={data.modelId ?? ""}
                options={visible}
                disabled={!data.brandId}
                onChange={(id) => set("modelId", id)}
              />
              <SearchableCombobox
                label={tWizard("fuel")}
                value={data.fuelType}
                options={fuelOptions}
                onChange={(id) => set("fuelType", id)}
              />
              <SearchableCombobox
                label={tWizard("gearbox")}
                value={data.gearbox}
                options={gearboxOptions}
                onChange={(id) => set("gearbox", id)}
              />
              {fields[1].map(input)}
            </div>
          </div>
        )}
        {step === 2 && <div className="grid gap-4 sm:grid-cols-2">{fields[2].map(input)}</div>}
        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields[3].map(input)}
            <SearchableCombobox
              label={tWizard("assignedBranch")}
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
            {pricing("DAILY")}
            {pricing("WEEKLY")}
            {pricing("MONTHLY")}
            {input(["lateFeeBaisa", "lateFeeBaisa", "number"])}
            {input(["lateGraceMinutes", "lateGraceMinutes", "number"])}
            {input(["lateWindowHours", "lateWindowHours", "number"])}
            {input(["overdueFineBaisa", "overdueFineBaisa", "number"])}
            {input(["overrideReason", "overrideReason"])}
          </div>
        )}
        <div className="mt-8 flex flex-col-reverse gap-3 min-[360px]:flex-row min-[360px]:justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
            className="min-h-11 w-full rounded-lg border border-[var(--edge)] px-4 min-[360px]:w-auto"
          >
            {tCommon("back")}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black min-[360px]:w-auto"
            >
              {tCommon("continue")}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black min-[360px]:w-auto"
            >
              {pending
                ? vehicleId
                  ? tCommon("updating")
                  : tCommon("saving")
                : vehicleId
                  ? tWizard("updateVehicle")
                  : tWizard("createVehicle")}
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
