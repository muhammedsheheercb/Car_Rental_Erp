"use client";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { serviceAction } from "@/app/[locale]/(protected)/service/actions";
import { translateFieldLabel, translateValidation } from "@/lib/i18n-helpers";
import { SearchableCombobox } from "./searchable-combobox";

type ServiceVehicle = {
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
  initialServiceBy = "COMPANY",
  initialVehicleId = "",
}: {
  vehicles: ServiceVehicle[];
  actorId: string;
  now: string;
  initialServiceBy?: "COMPANY" | "CUSTOMER";
  initialVehicleId?: string;
}) {
  const tRoot = useTranslations();
  const tService = useTranslations("service");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tFields = useTranslations("fieldLabels");
  const [state, action, pending] = useActionState(serviceAction, { error: "", message: "" });
  const initialVehicle = vehicles.find((item) => item.id === initialVehicleId);
  const [vehicleId, setVehicleId] = useState(initialVehicle?.id ?? "");
  const [rentalId, setRentalId] = useState(initialVehicle?.bookings[0]?.id ?? "");
  const [status, setStatus] = useState("COMPLETED");
  const [serviceBy, setServiceBy] = useState<string>(initialServiceBy);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.message) setRequestId(crypto.randomUUID());
  }, [state]);
  const v = vehicles.find((v) => v.id === vehicleId);
  const r = v?.bookings.find((r) => r.id === rentalId);
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-[var(--edge)] p-4">
      <h2 className="text-xl font-semibold">{tService("newService")}</h2>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="operation" value="create" />
      <SearchableCombobox
        label={tService("vehiclePickerLabel")}
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
                <dt className="text-sm text-[var(--muted)]">{translateFieldLabel(tFields, k)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <label>
            {tService("customerBookingLabel")}
            <select
              name="rentalId"
              value={rentalId}
              onChange={(e) => setRentalId(e.target.value)}
              className="input mt-1"
            >
              <option value="">{tService("companyVehicleNoCustomer")}</option>
              {v.bookings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {r && (
            <p>
              {tService("rentalOutSummary", {
                customer: r.customer,
                date: r.out.slice(0, 10),
                time: r.out.slice(11),
              })}
            </p>
          )}
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label>
          {tService("serviceBy")}
          <select
            name="serviceBy"
            className="input mt-1"
            value={serviceBy}
            onChange={(e) => {
              setServiceBy(e.target.value);
              if (e.target.value === "CUSTOMER") setStatus("COMPLETED");
            }}
          >
            <option value="COMPANY">{tService("companyService")}</option>
            <option value="CUSTOMER">{tService("customerService")}</option>
          </select>
        </label>
        <label>
          {tCommon("status")}
          <select
            name="status"
            className="input mt-1"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="COMPLETED">{tStatus("COMPLETED")}</option>
            {serviceBy === "COMPANY" && (
              <>
                <option value="SCHEDULED">{tStatus("SCHEDULED")}</option>
                <option value="IN_PROGRESS">{tStatus("IN_PROGRESS")}</option>
              </>
            )}
          </select>
        </label>
        <label>
          {tService("serviceType")}
          <select name="type" className="input mt-1">
            <option value="ENGINE">{tStatus("ENGINE")}</option>
            <option value="GEAR_OIL">{tStatus("GEAR_OIL")}</option>
            <option value="OTHER">{tStatus("OTHER")}</option>
          </select>
        </label>
        {v && (
          <>
            <label>
              {tService("staff")}
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
              {tService("kmReading")}
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
              {tService("serviceKmReading")}
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
          {tService("serviceOutDateTime")}
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
            {tService("completedDateTime")}
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
              {tService("dueDate")}
              <input name="dueDate" type="date" className="input mt-1" />
            </label>
            <label>
              {tService("dueKm")}
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
          {tService("expenseAmount")}
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
          {tCommon("paymentMode")}
          <select name="paymentMode" className="input mt-1">
            <option value="CASH">{tStatus("CASH")}</option>
            <option value="CARD">{tStatus("CARD")}</option>
            <option value="BANK_TRANSFER">{tStatus("BANK_TRANSFER")}</option>
          </select>
        </label>
      </div>
      <label>
        {tCommon("remarks")}
        <textarea name="remarks" required maxLength={2000} className="input mt-1" />
      </label>
      {state.error && <p role="alert">{translateValidation(tRoot, state.error)}</p>}
      {state.message && <p role="status">{translateValidation(tRoot, state.message)}</p>}
      <button type="submit" className="btn" disabled={pending || !v}>
        {pending ? tCommon("saving") : tService("saveService")}
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
  const tRoot = useTranslations();
  const tService = useTranslations("service");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [state, action, pending] = useActionState(serviceAction, { error: "", message: "" });
  const [nextStatus, setNextStatus] = useState("COMPLETED");
  const isCompleting = nextStatus === "COMPLETED";
  return (
    <form action={action} className="mt-3 grid gap-3 rounded-lg border border-[var(--edge)] p-3">
      <input type="hidden" name="operation" value="update" />
      <input type="hidden" name="serviceId" value={serviceId} />
      <label>
        {tService("nextStatus")}
        <select
          name="status"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value)}
          className="input mt-1"
        >
          <option value="COMPLETED">{tService("completeService")}</option>
          {status === "SCHEDULED" && (
            <option value="IN_PROGRESS">{tService("startService")}</option>
          )}
          <option value="CANCELLED">{tService("cancelService")}</option>
        </select>
      </label>
      {isCompleting && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            {tService("serviceKmReading")}
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
            {tService("completedDateTime")}
            <input
              name="completedAt"
              type="datetime-local"
              defaultValue={now}
              required
              className="input mt-1"
            />
          </label>
          <label>
            {tService("expenseAmount")}
            <input
              name="cost"
              inputMode="decimal"
              defaultValue="0"
              required
              className="input mt-1"
            />
          </label>
          <label>
            {tCommon("paymentMode")}
            <select name="paymentMode" className="input mt-1">
              <option value="CASH">{tStatus("CASH")}</option>
              <option value="CARD">{tStatus("CARD")}</option>
              <option value="BANK_TRANSFER">{tStatus("BANK_TRANSFER")}</option>
            </select>
          </label>
        </div>
      )}
      <label>
        {tService("remarksReason")}
        <textarea name="remarks" required className="input mt-1" maxLength={2000} />
      </label>
      {state.error && <p role="alert">{translateValidation(tRoot, state.error)}</p>}
      {state.message && <p role="status">{translateValidation(tRoot, state.message)}</p>}
      <button type="submit" className="btn" disabled={pending || !!state.message}>
        {pending ? tCommon("saving") : tService("updateService")}
      </button>
    </form>
  );
}
