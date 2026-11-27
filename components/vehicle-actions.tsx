"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteVehicleAction,
  getVehicleDetailsAction,
  setVehicleActiveAction,
} from "@/app/[locale]/(protected)/fleet/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { VehicleWizard } from "@/components/vehicle-wizard";
import { translateStatus, translateValidation } from "@/lib/i18n-helpers";

type Details = Awaited<ReturnType<typeof getVehicleDetailsAction>>;
const date = (value: unknown) => (value ? String(value).slice(0, 10) : "");
function formValues(data: NonNullable<Details>) {
  const rate = (
    period: string,
    key: "listRentBaisa" | "minimumRentBaisa" | "includedKm" | "excessKmChargeBaisa",
  ) => String(data.pricing.find((price) => price.period === period)?.[key] ?? "");
  return {
    vehicleNumber: data.number,
    brandId: data.brandId,
    modelId: data.modelId,
    branchId: data.branchId,
    year: String(data.year),
    cylinderCount: String(data.cylinderCount),
    color: data.color,
    registrationNumber: data.registration,
    fuelType: data.fuelType,
    capacity: data.capacity,
    gearbox: data.gearbox,
    seatCount: String(data.seatCount),
    engineNumber: data.engine,
    chassisNumber: data.chassis,
    purchaseDate: date(data.purchaseDate),
    currentOdometerKm: String(data.odometer),
    insuranceCompany: data.insuranceCompany ?? "",
    insuranceNumber: data.insuranceNumber ?? "",
    insuranceValidUntil: date(data.insuranceUntil),
    lastEngineServiceKm: String(data.lastEngineServiceKm ?? ""),
    lastGearOilChangeKm: String(data.lastGearOilChangeKm ?? ""),
    engineServiceIntervalKm: String(data.engineInterval ?? ""),
    gearOilIntervalKm: String(data.gearInterval ?? ""),
    mulkiyaExpiryDate: date(data.mulkiyaUntil),
    mulkiyaIssuingDetail: data.issuingDetail ?? "",
    lateFeeBaisa: String(data.pricing[0]?.lateFeeBaisa ?? ""),
    lateGraceMinutes: String(data.pricing[0]?.lateGraceMinutes ?? 60),
    lateWindowHours: String(data.pricing[0]?.lateWindowHours ?? 4),
    overdueFineBaisa: String(data.pricing[0]?.overdueFineBaisa ?? 5000),
    ...Object.fromEntries(
      ["DAILY", "WEEKLY", "MONTHLY"].flatMap((period) => [
        [`${period.toLowerCase()}_listRentBaisa`, rate(period, "listRentBaisa")],
        [`${period.toLowerCase()}_minimumRentBaisa`, rate(period, "minimumRentBaisa")],
        [`${period.toLowerCase()}_includedKm`, rate(period, "includedKm")],
        [`${period.toLowerCase()}_excessKmChargeBaisa`, rate(period, "excessKmChargeBaisa")],
      ]),
    ),
  };
}
export function VehicleActions({
  id,
  name,
  registration,
  active,
  canUpdate = true,
  canDelete = true,
}: {
  id: string;
  name: string;
  registration: string;
  active: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const t = useTranslations();
  const tFleet = useTranslations("fleet");
  const tWizard = useTranslations("fleet.wizard");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [mode, setMode] = useState<"view" | "edit" | null>(null);
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [isActive, setIsActive] = useState(active);
  const [changingStatus, setChangingStatus] = useState(false);
  const { show } = useToast();
  const router = useRouter();
  const open = (next: "view" | "edit") =>
    startLoad(async () => {
      setError("");
      setData(null);
      setMode(next);
      try {
        setData(await getVehicleDetailsAction(id));
      } catch (cause) {
        const raw =
          cause instanceof Error ? cause.message : "We could not load this vehicle. Please retry.";
        setError(translateValidation(t, raw));
      }
    });
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteVehicleAction(id);
      if (!result.ok) {
        show(result.message, "error", `vehicle-${id}`);
        return;
      }
      show(result.message, "success", `vehicle-${id}`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };
  const changeStatus = async () => {
    if (changingStatus) return;
    setChangingStatus(true);
    const nextActive = !isActive;
    try {
      const result = await setVehicleActiveAction(id, nextActive);
      if (!result.ok) {
        show(result.message, "error", `vehicle-status-${id}`);
        return;
      }
      setIsActive(nextActive);
      show(result.message, "success", `vehicle-status-${id}`);
      router.refresh();
    } finally {
      setChangingStatus(false);
    }
  };
  return (
    <>
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label={`${tCommon("view")} ${name}`}
          title={tCommon("view")}
          onClick={() => open("view")}
          className="min-h-10 min-w-10 rounded-lg text-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mx-auto h-5 w-5 fill-none stroke-current"
          >
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.5" strokeWidth="1.8" />
          </svg>
        </button>
        {canUpdate && (
          <>
            <button
              type="button"
              aria-label={`${tCommon("edit")} ${name}`}
              title={tCommon("edit")}
              onClick={() => open("edit")}
              className="min-h-10 rounded-lg px-2 text-sm font-medium text-[var(--accent)]"
            >
              {tCommon("edit")}
            </button>
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  disabled={changingStatus}
                  className="min-h-10 rounded-lg border border-[var(--edge)] px-2 text-sm font-medium disabled:opacity-60"
                >
                  {changingStatus
                    ? isActive
                      ? tCommon("deactivating")
                      : tCommon("activating")
                    : isActive
                      ? tCommon("deactivate")
                      : tCommon("activate")}
                </button>
              }
              title={
                isActive
                  ? tFleet("deactivateVehicleTitle", { name })
                  : tFleet("activateVehicleTitle", { name })
              }
              description={
                isActive
                  ? tFleet("deactivateVehicleDesc", { reg: registration })
                  : tFleet("activateVehicleDesc", { reg: registration })
              }
              confirmLabel={isActive ? tCommon("deactivate") : tCommon("activate")}
              processingLabel={isActive ? tCommon("deactivating") : tCommon("activating")}
              onConfirm={changeStatus}
            />
          </>
        )}
        {canDelete && (
          <ConfirmDialog
            trigger={
              <button
                type="button"
                aria-label={`${tCommon("delete")} ${name}`}
                title={tCommon("delete")}
                disabled={deleting}
                className="min-h-10 rounded-lg px-2 text-sm font-medium text-red-300 disabled:opacity-60"
              >
                {tCommon("delete")}
              </button>
            }
            title={tFleet("deleteVehicleTitle", { name })}
            description={tFleet("deleteVehicleDesc", { reg: registration })}
            confirmLabel={deleting ? tCommon("deleting") : tCommon("delete")}
            pending={deleting}
            processingLabel={tCommon("deleting")}
            onConfirm={remove}
          />
        )}
      </div>
      {mode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onMouseDown={() => !loading && setMode(null)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-start sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--accent)]">
                  {mode === "edit" ? tFleet("vehicleEditEyebrow") : tFleet("vehicleDetailsEyebrow")}
                </p>
                <h2 className="break-words text-xl font-semibold">{name}</h2>
                <p className="text-sm text-[var(--muted)]">{registration}</p>
              </div>
              <button
                type="button"
                aria-label={tCommon("close")}
                onClick={() => setMode(null)}
                className="min-h-11 px-3"
              >
                ×
              </button>
            </div>
            {loading && <p className="mt-8 text-[var(--muted)]">{tFleet("loadingVehicle")}</p>}
            {error && (
              <div className="mt-6">
                <p role="alert" className="text-red-300">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => open(mode)}
                  className="mt-3 min-h-11 rounded-lg border border-[var(--edge)] px-4"
                >
                  {tCommon("retry")}
                </button>
              </div>
            )}
            {data && mode === "edit" && (
              <VehicleWizard
                vehicleId={id}
                initialData={formValues(data)}
                existingImage={data.primaryImage}
                {...data.formOptions}
                onSuccess={(message) => {
                  setMode(null);
                  show(message, "success", `vehicle-${id}`);
                  router.refresh();
                }}
              />
            )}
            {data && mode === "view" && (
              <div className="mt-6 space-y-5">
                {data.primaryImage && (
                  <div className="overflow-hidden rounded-xl border border-[var(--edge)] bg-black/30">
                    {/* biome-ignore lint/performance/noImgElement: authenticated private vehicle photo */}
                    <img
                      src={`/api/vehicle-images/${data.primaryImage.id}`}
                      alt={`${data.brand} ${data.model}`}
                      className="max-h-56 w-full object-contain"
                    />
                  </div>
                )}
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    [tWizard("vehicleNumber"), data.number],
                    [`${tWizard("brand")} / ${tWizard("model")}`, `${data.brand} ${data.model}`],
                    [tCommon("registration"), data.registration],
                    [tWizard("chassisNumber"), data.chassis],
                    [tWizard("engineNumber"), data.engine],
                    [tCommon("branch"), data.branch],
                    [tCommon("status"), translateStatus(tStatus, data.status)],
                    [
                      tWizard("currentOdometerKm"),
                      `${data.odometer.toLocaleString()} ${tCommon("km")}`,
                    ],
                    [
                      tFleet("insurance"),
                      `${data.insuranceCompany ?? "—"} · ${data.insuranceUntil ?? "—"}`,
                    ],
                    [tFleet("mulkiya"), data.mulkiyaUntil ?? "—"],
                    [
                      tWizard("engineServiceIntervalKm"),
                      data.engineInterval ? `${data.engineInterval} ${tCommon("km")}` : "—",
                    ],
                    [
                      tWizard("gearOilIntervalKm"),
                      data.gearInterval ? `${data.gearInterval} ${tCommon("km")}` : "—",
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="border-b border-[var(--edge)] pb-3">
                      <p className="text-xs text-[var(--muted)]">{label}</p>
                      <p className="mt-1 break-words">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
