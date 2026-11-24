"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { getVehicleDetailsAction } from "@/app/[locale]/(protected)/fleet/actions";
import {
  getVehicleContextualActions,
  type VehicleActionPermissionFlags,
  type VehicleOperationalStatus,
} from "@/features/fleet/vehicle-actions";
import { formatOMR } from "@/features/rentals/calculations";
import { translateSafe, translateStatus, translateValidation } from "@/lib/i18n-helpers";

type Details = Awaited<ReturnType<typeof getVehicleDetailsAction>>;

const STATUS_BADGE: Record<VehicleOperationalStatus, { label: string; className: string }> = {
  ON_RENT: {
    label: "ON RENT",
    className: "border border-red-400/50 bg-red-500/25 text-red-100",
  },
  AVAILABLE: {
    label: "AVAILABLE",
    className: "border border-white/80 bg-white text-black font-semibold",
  },
  RESERVED: {
    label: "RESERVED",
    className: "border border-amber-400/40 bg-amber-400/20 text-amber-100",
  },
  SERVICE_OR_TRANSFER: {
    label: "SERVICE / TRANSFER",
    className: "border border-zinc-500/40 bg-zinc-500/20 text-zinc-200",
  },
  INACTIVE: {
    label: "INACTIVE",
    className: "border border-zinc-600/40 bg-zinc-700/30 text-zinc-300",
  },
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Muscat",
    dateStyle: "medium",
    timeStyle: "short",
  });

export function VehicleActionModalTrigger({
  locale,
  vehicle,
  permissions,
}: {
  locale: string;
  vehicle: {
    id: string;
    number: string;
    registration: string;
    brand: string;
    model: string;
    branch: string;
    odometer: number;
    operationalStatus: VehicleOperationalStatus;
    imageId: string | null;
    activeRentalId: string | null;
    activeAgreementNumber: string | null;
    activeCustomerName: string | null;
  };
  permissions: VehicleActionPermissionFlags;
}) {
  const t = useTranslations();
  const tFleet = useTranslations("fleet");
  const tWizard = useTranslations("fleet.wizard");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [open, setOpen] = useState(false);
  const [viewInfo, setViewInfo] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, startLoad] = useTransition();

  const actions = getVehicleContextualActions({
    locale,
    vehicleId: vehicle.id,
    registration: vehicle.registration,
    status: vehicle.operationalStatus,
    activeRentalId: vehicle.activeRentalId,
    activeAgreementNumber: vehicle.activeAgreementNumber,
    permissions,
  });

  const badge = STATUS_BADGE[vehicle.operationalStatus];
  const badgeText = translateStatus(tStatus, vehicle.operationalStatus);

  const loadInfo = () => {
    setViewInfo(true);
    setError("");
    if (details) return;
    startLoad(async () => {
      try {
        setDetails(await getVehicleDetailsAction(vehicle.id));
      } catch (cause) {
        const raw = cause instanceof Error ? cause.message : "Could not load vehicle details.";
        setError(translateValidation(t, raw));
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setViewInfo(false);
          setOpen(true);
        }}
        className="group flex w-full min-w-0 items-center gap-3 text-start focus-visible:outline-none"
        title={tFleet("manage")}
      >
        <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--edge)] bg-black/30">
          {vehicle.imageId ? (
            /* biome-ignore lint/performance/noImgElement: authenticated private vehicle photo */
            <img
              src={`/api/vehicle-images/${vehicle.imageId}`}
              alt={`${vehicle.brand} ${vehicle.model}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] font-mono text-[var(--muted)]">
              {tFleet("noImg")}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium group-hover:text-[var(--accent)] group-hover:underline">
            {vehicle.brand} {vehicle.model}
          </p>
          <p className="truncate font-mono text-xs text-[var(--muted)]">
            {vehicle.number} · {vehicle.branch}
          </p>
        </div>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${vehicle.brand} ${vehicle.model} (${vehicle.registration})`}
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/75 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] text-start sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--edge)] bg-[var(--raised)] p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--edge)] bg-black/30">
                  {vehicle.imageId ? (
                    /* biome-ignore lint/performance/noImgElement: authenticated private vehicle photo */
                    <img
                      src={`/api/vehicle-images/${vehicle.imageId}`}
                      alt={`${vehicle.brand} ${vehicle.model}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs font-mono text-[var(--muted)]">
                      {tFleet("noPhoto")}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${badge.className}`}>
                      {badgeText}
                    </span>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {vehicle.registration}
                    </span>
                  </div>
                  <h2 className="mt-1 break-words text-xl font-semibold">
                    {vehicle.brand} {vehicle.model}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {vehicle.number} · {vehicle.branch} · {vehicle.odometer.toLocaleString()}{" "}
                    {tCommon("km")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={tCommon("close")}
                onClick={() => setOpen(false)}
                className="min-h-11 px-3 text-lg"
              >
                ×
              </button>
            </header>

            <div className="space-y-5 p-5 sm:p-6">
              {vehicle.activeAgreementNumber && (
                <div
                  className={`rounded-xl border p-3.5 text-sm ${
                    vehicle.operationalStatus === "ON_RENT"
                      ? "border-red-400/40 bg-red-500/10"
                      : "border-amber-400/40 bg-amber-400/10"
                  }`}
                >
                  <p className="font-medium">
                    {vehicle.operationalStatus === "ON_RENT"
                      ? tFleet("activeRentalAgreement")
                      : tFleet("pendingReservation")}
                    :{" "}
                    <span className="font-mono text-[var(--accent)]">
                      {vehicle.activeAgreementNumber}
                    </span>
                  </p>
                  {vehicle.activeCustomerName && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {tCommon("customer")}:{" "}
                      <span className="text-white">{vehicle.activeCustomerName}</span>
                    </p>
                  )}
                </div>
              )}

              {!viewInfo ? (
                <>
                  <p className="text-xs text-[var(--muted)]">
                    {tFleet("modalStatusHint", { status: badgeText })}
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                    {actions.map((action) => {
                      const actionLabel = translateSafe(
                        tFleet,
                        `modalActions.${action.key}`,
                        action.label,
                      );
                      if (!action.enabled) {
                        return (
                          <button
                            key={action.key}
                            type="button"
                            disabled
                            title={action.reason}
                            className="min-h-12 cursor-not-allowed rounded-xl border border-[var(--edge)]/50 bg-black/15 px-3 py-2.5 text-start text-sm text-[var(--muted)] opacity-45"
                          >
                            <span className="block font-medium">{actionLabel}</span>
                            <span className="mt-0.5 block truncate text-[11px]">
                              {tCommon("unavailable")}
                            </span>
                          </button>
                        );
                      }
                      if (action.key === "retrieve_information") {
                        return (
                          <button
                            key={action.key}
                            type="button"
                            onClick={loadInfo}
                            className="min-h-12 rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-3 py-2.5 text-start text-sm transition-colors hover:border-[var(--accent)] hover:bg-white/5"
                          >
                            <span className="block font-medium text-white">{actionLabel}</span>
                            <span className="mt-0.5 block text-[11px] text-[var(--accent)]">
                              {tFleet("viewSpecsRates")}
                            </span>
                          </button>
                        );
                      }
                      return (
                        <Link
                          key={action.key}
                          href={action.href as never}
                          onClick={() => setOpen(false)}
                          className="min-h-12 content-center rounded-xl border border-[var(--edge)] bg-[var(--surface)] px-3 py-2.5 text-start text-sm transition-colors hover:border-[var(--accent)] hover:bg-white/5"
                        >
                          <span className="block font-medium text-white">{actionLabel}</span>
                          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                            {tFleet("openWorkflow")}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{tFleet("retrievedInfo")}</h3>
                    <button
                      type="button"
                      onClick={() => setViewInfo(false)}
                      className="min-h-10 rounded-lg border border-[var(--edge)] px-3 text-sm text-[var(--accent)]"
                    >
                      {tFleet("backToActions")}
                    </button>
                  </div>

                  {loading && (
                    <p className="text-sm text-[var(--muted)]">{tFleet("loadingDetails")}</p>
                  )}
                  {error && (
                    <p role="alert" className="text-sm text-red-300">
                      {error}
                    </p>
                  )}

                  {details && (
                    <div className="space-y-5">
                      {details.primaryImage && (
                        <div className="overflow-hidden rounded-xl border border-[var(--edge)] bg-black/30">
                          {/* biome-ignore lint/performance/noImgElement: authenticated private vehicle photo */}
                          <img
                            src={`/api/vehicle-images/${details.primaryImage.id}`}
                            alt={`${details.brand} ${details.model}`}
                            className="max-h-56 w-full object-contain"
                          />
                        </div>
                      )}

                      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          [tFleet("siNo"), details.number],
                          [
                            `${tWizard("brand")} / ${tWizard("model")}`,
                            `${details.brand} ${details.model}`,
                          ],
                          [tCommon("registration"), details.registration],
                          [tCommon("branch"), details.branch],
                          [
                            `${tWizard("year")} / ${tWizard("color")}`,
                            `${details.year} · ${details.color}`,
                          ],
                          [
                            `${tWizard("fuel")} / ${tWizard("gearbox")}`,
                            `${translateStatus(tStatus, details.fuelType)} · ${translateStatus(tStatus, details.gearbox)}`,
                          ],
                          [
                            `${tWizard("seatCount")} / ${tWizard("capacity")}`,
                            `${details.seatCount} · ${details.capacity}`,
                          ],
                          [tWizard("chassisNumber"), details.chassis],
                          [tWizard("engineNumber"), details.engine],
                          [
                            tWizard("currentOdometerKm"),
                            `${details.odometer.toLocaleString()} ${tCommon("km")}`,
                          ],
                          [
                            tFleet("insurance"),
                            `${details.insuranceCompany ?? "—"} (${details.insuranceUntil ?? "—"})`,
                          ],
                          [tWizard("mulkiyaExpiryDate"), details.mulkiyaUntil ?? "—"],
                          [
                            tFleet("nextServiceKm"),
                            details.lastEngineServiceKm != null && details.engineInterval
                              ? `${(details.lastEngineServiceKm + details.engineInterval).toLocaleString()} ${tCommon("km")}`
                              : "—",
                          ],
                          [
                            tStatus("GEAR_OIL"),
                            details.lastGearOilChangeKm != null && details.gearInterval
                              ? `${(details.lastGearOilChangeKm + details.gearInterval).toLocaleString()} ${tCommon("km")}`
                              : "—",
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-3"
                          >
                            <dt className="text-xs text-[var(--muted)]">{label}</dt>
                            <dd className="mt-1 break-words font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      {details.pricing.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                            {tFleet("pricingSettings")}
                          </h4>
                          <div className="mt-2 grid gap-3 sm:grid-cols-3">
                            {details.pricing.map((tier) => (
                              <div
                                key={tier.id}
                                className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-3 text-xs"
                              >
                                <p className="font-semibold text-[var(--accent)]">
                                  {translateStatus(tStatus, tier.period)}
                                </p>
                                <p className="mt-1">
                                  {tFleet("standardRate")}: {formatOMR(tier.listRentBaisa)}
                                </p>
                                <p>
                                  {tFleet("minimumRate")}: {formatOMR(tier.minimumRentBaisa)}
                                </p>
                                <p>
                                  {tFleet("includedKm")}: {tier.includedKm.toLocaleString()}
                                </p>
                                <p>
                                  {tFleet("excessKm")}: {formatOMR(tier.excessKmChargeBaisa)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {details.activeBooking && (
                        <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4 text-sm">
                          <h4 className="font-semibold">{tFleet("currentBookingDetails")}</h4>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {details.activeBooking.agreementNumber} ·{" "}
                            {translateStatus(tStatus, details.activeBooking.status)} ·{" "}
                            {details.activeBooking.customerName} (
                            {details.activeBooking.customerMobile})
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {formatDateTime(details.activeBooking.startsAt)} →{" "}
                            {formatDateTime(details.activeBooking.expectedReturnAt)} (
                            {tCommon("omanTime")})
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
