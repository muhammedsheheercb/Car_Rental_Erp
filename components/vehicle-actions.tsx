"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteVehicleAction,
  getVehicleDetailsAction,
  setVehicleActiveAction,
} from "@/app/[locale]/(protected)/fleet/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { VehicleWizard } from "@/components/vehicle-wizard";

type Details = Awaited<ReturnType<typeof getVehicleDetailsAction>>;
const date = (value: unknown) => (value ? String(value).slice(0, 10) : "");
function formValues(data: NonNullable<Details>) {
  const rate = (
    period: string,
    key: "listRentBaisa" | "minimumRentBaisa" | "includedKm" | "excessKmChargeBaisa",
  ) => String(data.pricing.find((price) => price.period === period)?.[key] ?? "");
  return {
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
}: {
  id: string;
  name: string;
  registration: string;
  active: boolean;
}) {
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
        setError(
          cause instanceof Error ? cause.message : "We could not load this vehicle. Please retry.",
        );
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
          aria-label={`View ${name}`}
          title="View vehicle"
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
        <button
          type="button"
          aria-label={`Edit ${name}`}
          title="Edit vehicle"
          onClick={() => open("edit")}
          className="min-h-10 rounded-lg px-2 text-sm font-medium text-[var(--accent)]"
        >
          Edit
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
                  ? "Deactivating…"
                  : "Activating…"
                : isActive
                  ? "Deactivate"
                  : "Activate"}
            </button>
          }
          title={`${isActive ? "Deactivate" : "Activate"} ${name}?`}
          description={`Registration: ${registration}. ${isActive ? "Deactivation is blocked while a vehicle is reserved, rented, overdue, transferred, or in service." : "This will make the vehicle available for use."}`}
          confirmLabel={isActive ? "Deactivate" : "Activate"}
          processingLabel={isActive ? "Deactivating…" : "Activating…"}
          onConfirm={changeStatus}
        />
        <ConfirmDialog
          trigger={
            <button
              type="button"
              aria-label={`Delete ${name}`}
              title="Delete vehicle"
              disabled={deleting}
              className="min-h-10 rounded-lg px-2 text-sm font-medium text-red-300 disabled:opacity-60"
            >
              Delete
            </button>
          }
          title={`Delete ${name}?`}
          description={`Registration: ${registration}. This permanently removes a vehicle with no operational history.`}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          pending={deleting}
          processingLabel="Deleting…"
          onConfirm={remove}
        />
      </div>
      {mode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${mode === "edit" ? "Edit" : "Vehicle details"} for ${name}`}
          onMouseDown={() => !loading && setMode(null)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--accent)]">
                  VEHICLE {mode === "edit" ? "EDIT" : "DETAILS"}
                </p>
                <h2 className="break-words text-xl font-semibold">{name}</h2>
                <p className="text-sm text-[var(--muted)]">{registration}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMode(null)}
                className="min-h-11 px-3"
              >
                ×
              </button>
            </div>
            {loading && <p className="mt-8 text-[var(--muted)]">Loading vehicle…</p>}
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
                  Retry
                </button>
              </div>
            )}
            {data && mode === "edit" && (
              <VehicleWizard
                vehicleId={id}
                initialData={formValues(data)}
                {...data.formOptions}
                onSuccess={(message) => {
                  setMode(null);
                  show(message, "success", `vehicle-${id}`);
                  router.refresh();
                }}
              />
            )}
            {data && mode === "view" && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {[
                  ["Vehicle number", data.number],
                  ["Brand & model", `${data.brand} ${data.model}`],
                  ["Registration", data.registration],
                  ["Chassis", data.chassis],
                  ["Engine", data.engine],
                  ["Branch", data.branch],
                  ["Status", data.status],
                  ["Odometer", `${data.odometer.toLocaleString()} km`],
                  ["Insurance", `${data.insuranceCompany ?? "—"} · ${data.insuranceUntil ?? "—"}`],
                  ["Mulkiya", data.mulkiyaUntil ?? "—"],
                  ["Service interval", data.engineInterval ? `${data.engineInterval} km` : "—"],
                  ["Gear-oil interval", data.gearInterval ? `${data.gearInterval} km` : "—"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border-b border-[var(--edge)] pb-3">
                    <p className="text-xs text-[var(--muted)]">{label}</p>
                    <p className="mt-1 break-words">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
