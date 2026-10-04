"use client";
import { useActionState, useState } from "react";
import { serviceAction } from "@/app/[locale]/(protected)/service/actions";
import { SearchableCombobox } from "./searchable-combobox";
export type ServiceVehicle = {
  id: string;
  name: string;
  brand: string;
  registration: string;
  branch: string;
  km: number;
  staff: { id: string; name: string }[];
  bookings: { id: string; name: string; customer: string; out: string }[];
};
export function ServiceForm({
  vehicles,
  actorId,
  now,
}: {
  vehicles: ServiceVehicle[];
  actorId: string;
  now: string;
}) {
  const [state, action, pending] = useActionState(serviceAction, { error: "", message: "" });
  const [vehicleId, setVehicleId] = useState("");
  const [rentalId, setRentalId] = useState("");
  const [status, setStatus] = useState("COMPLETED");
  const [serviceBy, setServiceBy] = useState("COMPANY");
  const [requestId] = useState(() => crypto.randomUUID());
  const v = vehicles.find((v) => v.id === vehicleId);
  const r = v?.bookings.find((r) => r.id === rentalId);
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-[var(--edge)] p-4">
      <h2 className="text-xl font-semibold">New Service</h2>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="operation" value="create" />
      <SearchableCombobox
        label="Vehicle Name / Registration"
        options={vehicles}
        value={vehicleId}
        onChange={(id) => {
          setVehicleId(id);
          setRentalId(vehicles.find((v) => v.id === id)?.bookings[0]?.id ?? "");
        }}
      />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {v && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {Object.entries({
              "Vehicle Name": v.name,
              Brand: v.brand,
              "Registration Number": v.registration,
              Branch: v.branch,
              "KM Reading": v.km,
            }).map(([k, value]) => (
              <div key={k}>
                <dt className="text-sm text-[var(--muted)]">{k}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <label>
            Customer / Booking if applicable
            <select
              name="rentalId"
              value={rentalId}
              onChange={(e) => setRentalId(e.target.value)}
              className="input mt-1"
            >
              <option value="">Company vehicle — no customer</option>
              {v.bookings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {r && (
            <p>
              Customer Name: {r.customer} · Rental Out Date: {r.out.slice(0, 10)} · Out Time (Oman):{" "}
              {r.out.slice(11)}
            </p>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          Service By
          <select
            name="serviceBy"
            className="input mt-1"
            value={serviceBy}
            onChange={(e) => {
              setServiceBy(e.target.value);
              if (e.target.value === "CUSTOMER") setStatus("COMPLETED");
            }}
          >
            <option value="COMPANY">Company Service</option>
            <option value="CUSTOMER">Service By Customer</option>
          </select>
        </label>
        <label>
          Status
          <select
            name="status"
            className="input mt-1"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="COMPLETED">Completed</option>
            {serviceBy === "COMPANY" && (
              <>
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
              </>
            )}
          </select>
        </label>
        <label>
          Service Type
          <select name="type" className="input mt-1">
            <option value="ENGINE">Engine Service</option>
            <option value="GEAR_OIL">Gear Oil</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        {v && (
          <>
            <label>
              Staff
              <select
                key={v.id}
                name="staffId"
                defaultValue={v.staff.some((s) => s.id === actorId) ? actorId : v.staff[0]?.id}
                className="input mt-1"
                required
              >
                {v.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              KM Reading
              <input
                key={`${v.id}-km`}
                name="kmReading"
                inputMode="numeric"
                pattern="[0-9]+"
                className="input mt-1"
                defaultValue={v.km}
                required
              />
            </label>
            <label>
              Service KM Reading
              <input
                key={`${v.id}-service`}
                name="serviceOdometerKm"
                inputMode="numeric"
                pattern="[0-9]+"
                className="input mt-1"
                defaultValue={v.km}
                required
              />
            </label>
          </>
        )}
        <label>
          Service Out Date / Time (Oman)
          <input
            name="outAt"
            type="datetime-local"
            defaultValue={now}
            required
            className="input mt-1"
          />
        </label>
        {status === "COMPLETED" && (
          <label>
            Completed Date / Time (Oman)
            <input
              name="completedAt"
              type="datetime-local"
              defaultValue={now}
              required
              className="input mt-1"
            />
          </label>
        )}
        {status === "SCHEDULED" && (
          <>
            <label>
              Due Date (Oman)
              <input name="dueDate" type="date" className="input mt-1" />
            </label>
            <label>
              Due KM
              <input
                name="dueOdometerKm"
                inputMode="numeric"
                pattern="[0-9]+"
                className="input mt-1"
              />
            </label>
          </>
        )}
        <label>
          Expense Amount (OMR)
          <input
            key={status}
            name="cost"
            inputMode="decimal"
            className="input mt-1"
            defaultValue="0"
            required
            readOnly={status !== "COMPLETED"}
          />
        </label>
        <label>
          Payment Mode
          <select name="paymentMode" className="input mt-1">
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank</option>
          </select>
        </label>
      </div>
      <label>
        Remarks
        <textarea name="remarks" required maxLength={2000} className="input mt-1" />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" className="btn" disabled={pending || !v || !!state.message}>
        Save Service
      </button>
    </form>
  );
}
export function ServiceStatusForm({
  serviceId,
  currentKm,
  now,
  status,
}: {
  serviceId: string;
  currentKm: number;
  now: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(serviceAction, { error: "", message: "" });
  return (
    <form action={action} className="mt-3 grid gap-3 rounded-lg border border-[var(--edge)] p-3">
      <input type="hidden" name="operation" value="update" />
      <input type="hidden" name="serviceId" value={serviceId} />
      <label>
        Next Status
        <select name="status" className="input mt-1">
          <option value="COMPLETED">Complete Service</option>
          {status === "SCHEDULED" && <option value="IN_PROGRESS">Start Service</option>}
          <option value="CANCELLED">Cancel Scheduled / In-progress Service</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Service KM Reading
          <input
            name="serviceOdometerKm"
            inputMode="numeric"
            pattern="[0-9]+"
            defaultValue={currentKm}
            required
            className="input mt-1"
          />
        </label>
        <label>
          Completed Date / Time (Oman)
          <input
            name="completedAt"
            type="datetime-local"
            defaultValue={now}
            required
            className="input mt-1"
          />
        </label>
        <label>
          Expense Amount (OMR)
          <input name="cost" inputMode="decimal" defaultValue="0" required className="input mt-1" />
        </label>
        <label>
          Payment Mode
          <select name="paymentMode" className="input mt-1">
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank</option>
          </select>
        </label>
      </div>
      <label>
        Remarks / Reason
        <textarea name="remarks" required className="input mt-1" maxLength={2000} />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" className="btn" disabled={pending || !!state.message}>
        Update Service
      </button>
    </form>
  );
}
