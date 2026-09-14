"use client";
import { useState, useTransition } from "react";
import { getVehicleDetailsAction } from "@/app/[locale]/(protected)/fleet/actions";
export function VehicleActions({
  id,
  name,
  registration,
}: {
  id: string;
  name: string;
  registration: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getVehicleDetailsAction>> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      setError("");
      try {
        setData(await getVehicleDetailsAction(id));
      } catch {
        setError("We could not load this vehicle. Please retry.");
      }
    });
  const show = () => {
    setOpen(true);
    load();
  };
  return (
    <>
      <button
        type="button"
        aria-label={`View ${name}`}
        title="View vehicle"
        onClick={show}
        className="min-h-11 min-w-11 rounded-lg text-[var(--accent)]"
      >
        ◉
      </button>
      <button
        type="button"
        aria-label={`Edit ${name}`}
        title="Edit vehicle"
        className="min-h-11 min-w-11 rounded-lg text-[var(--muted)]"
      >
        ✎
      </button>
      <button
        type="button"
        aria-label={`Delete ${name}`}
        title="Delete vehicle"
        className="min-h-11 min-w-11 rounded-lg text-red-300"
      >
        ⌫
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Vehicle details for ${name}`}
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[calc(100dvh-0.5rem)] w-full overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:p-6"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-[var(--accent)]">VEHICLE DETAILS</p>
                <h2 className="break-words text-xl font-semibold">{name}</h2>
                <p className="break-words text-sm text-[var(--muted)]">{registration}</p>
              </div>
              <button
                type="button"
                aria-label="Close vehicle details"
                onClick={() => setOpen(false)}
                className="min-h-11 px-3"
              >
                ×
              </button>
            </div>
            {pending && <p className="mt-8 text-[var(--muted)]">Loading latest vehicle details…</p>}
            {error && (
              <div className="mt-6">
                <p className="text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-3 min-h-11 rounded-lg border border-[var(--edge)] px-4"
                >
                  Retry
                </button>
              </div>
            )}
            {data && (
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-7 min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black sm:w-auto"
            >
              Close
            </button>
          </section>
        </div>
      )}
    </>
  );
}
