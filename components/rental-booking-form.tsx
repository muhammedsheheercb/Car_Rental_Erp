"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createReservationAction } from "@/app/[locale]/(protected)/rentals/actions";

import {
  calculateDurationFromReturn,
  calculateExpectedReturn,
  calculateIncludedKm,
  formatOmanDateTime,
  parseOmanDateTime,
  periodsOverlap,
} from "@/features/rentals/booking-calculations";
import { translateStatus, translateValidation } from "@/lib/i18n-helpers";
import { OmanDateTimePicker } from "./oman-datetime-picker";

type Vehicle = {
  id: string;
  number: string;
  registration: string;
  brand: string;
  model: string;
  branchId: string;
  branchName: string;
  currentOdometerKm: number;
  nextEngineServiceKm: number | null;
  nextGearOilKm: number | null;
  insuranceExpiry: string | null;
};
type Price = {
  vehicleId: string;
  period: "DAILY" | "WEEKLY" | "MONTHLY";
  listRentBaisa: number;
  minimumRentBaisa: number;
  includedKm: number;
  excessKmChargeBaisa: number;
  lateFeeBaisa: number;
};
type Customer = {
  id: string;
  name: string;
  mobile: string;
  address: string;
  civilIdNumber: string | null;
  civilIdExpiry: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  drivingLicenceNumber: string;
  drivingLicenceExpiry: string;
  visaNumber: string | null;
  visaExpiry: string | null;
  sponsorDetails: string | null;
};
type Branch = { id: string; name: string; code: string };

export function RentalBookingForm({
  locale = "en",
  vehicles,
  prices,
  customers,
  branches,
  defaultBranch,
  initialVehicleId = "",
  initialCustomerId = "",
  canOverridePrice,
  userName,
  reservations,
}: {
  locale?: string;
  vehicles: Vehicle[];
  prices: Price[];
  customers: Customer[];
  branches: Branch[];
  defaultBranch: string;
  initialVehicleId?: string;
  initialCustomerId?: string;
  canOverridePrice: boolean;
  userName: string;
  reservations: { vehicleId: string; startsAt: string; expectedReturnAt: string; status: string }[];
}) {
  const t = useTranslations();
  const tRentals = useTranslations("rentals");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const tCust = useTranslations("customers");
  const tFleet = useTranslations("fleet");
  const [vehicleId, setVehicleId] = useState(
    vehicles.some((v) => v.id === initialVehicleId) ? initialVehicleId : "",
  );
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({
    branchId: defaultBranch,
    pickupBranchId: defaultBranch,
    returnBranchId: defaultBranch,
  });
  const [customerId, setCustomerId] = useState(
    customers.some((c) => c.id === initialCustomerId) ? initialCustomerId : "",
  );
  const [period, setPeriod] = useState<Price["period"]>("DAILY");
  const [rate, setRate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("1");
  const [freeKm, setFreeKm] = useState("0");
  const [startingKm, setStartingKm] = useState("0");
  const [openKm, setOpenKm] = useState(false);
  const [deposit, setDeposit] = useState("0");
  const [downPayment, setDownPayment] = useState("0");
  const [state, action, pending] = useActionState(createReservationAction, { error: "" });
  let expectedReturn = "";
  try {
    expectedReturn = formatOmanDateTime(
      calculateExpectedReturn(parseOmanDateTime(startsAt), period, Number(duration)),
    );
  } catch {
    /* Incomplete input */
  }
  const availableVehicles = vehicles.filter(
    (vehicle) =>
      !reservations.some((reservation) => {
        if (reservation.vehicleId !== vehicle.id) return false;
        if (reservation.status === "ACTIVE") return true;
        if (!expectedReturn) return false;
        return periodsOverlap(
          parseOmanDateTime(startsAt),
          parseOmanDateTime(expectedReturn),
          new Date(reservation.startsAt),
          new Date(reservation.expectedReturnAt),
        );
      }),
  );
  const selectedAvailable = availableVehicles.some((vehicle) => vehicle.id === vehicleId);
  const total = Number(rate) * Number(duration);
  const maximumPayment = total + Number(deposit);
  const price = useMemo(
    () => prices.find((item) => item.vehicleId === vehicleId && item.period === period),
    [prices, vehicleId, period],
  );
  const customer = customers.find((item) => item.id === customerId);
  useEffect(() => setRate(String(price?.listRentBaisa ?? 0)), [price]);
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  useEffect(() => {
    setStartingKm(String(vehicle?.currentOdometerKm ?? 0));
    if (vehicle)
      setSelectedBranches({
        branchId: vehicle.branchId,
        pickupBranchId: vehicle.branchId,
        returnBranchId: vehicle.branchId,
      });
  }, [vehicle]);
  const addCustomerHref = `/${locale}/customers/new?returnTo=${encodeURIComponent(
    `/${locale}/rentals${vehicleId ? `?vehicleId=${vehicleId}` : ""}`,
  )}`;
  const handleExpectedReturnChange = (value: string) => {
    try {
      const pickedReturn = parseOmanDateTime(value);
      if (startsAt) {
        const parsedStart = parseOmanDateTime(startsAt);
        if (pickedReturn > parsedStart) {
          setDuration(String(calculateDurationFromReturn(parsedStart, pickedReturn, period)));
        }
      } else {
        const stepDays = period === "WEEKLY" ? 7 : period === "MONTHLY" ? 30 : 1;
        const defaultStart = new Date(pickedReturn.getTime() - stepDays * 86_400_000);
        setStartsAt(formatOmanDateTime(defaultStart));
        setDuration("1");
      }
    } catch {
      /* Wait for complete datetime-local value */
    }
  };
  const cls = "min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3";
  return (
    <section className="border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{tRentals("newBookingTitle")}</h2>
      <form action={action} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="locale" value={locale} />
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("customer")}
          <select
            required
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className={cls}
          >
            <option value="">{tRentals("selectCustomer")}</option>
            {customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.mobile}
              </option>
            ))}
          </select>
        </label>
        <div className="grid content-end">
          <Link
            href={addCustomerHref as never}
            className="min-h-11 border border-[var(--edge)] px-3 py-3 text-center text-sm hover:border-[var(--accent)]"
          >
            {tRentals("addCustomer")}
          </Link>
        </div>
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("vehicle")}
          <select
            required
            name="vehicleId"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            className={cls}
          >
            <option value="">{tRentals("selectVehicle")}</option>
            {availableVehicles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.number} · {item.registration} · {item.brand} {item.model}
              </option>
            ))}
          </select>
        </label>
        {vehicle && (
          <div className="grid gap-2 rounded-xl border border-[var(--edge)] bg-black/20 p-3 text-xs sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
            <div>
              <p className="text-[var(--muted)]">{tCommon("vehicle")}</p>
              <p className="mt-0.5 font-medium text-white">
                {vehicle.number} · {vehicle.brand} {vehicle.model}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">
                {tCommon("registration")} / {tCommon("branch")}
              </p>
              <p className="mt-0.5 font-mono text-white">
                {vehicle.registration} · {vehicle.branchName}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">{tFleet("nextServiceKm")}</p>
              <p className="mt-0.5 text-white">
                {vehicle.currentOdometerKm.toLocaleString()} {tCommon("km")} ·{" "}
                {vehicle.nextEngineServiceKm != null
                  ? `${vehicle.nextEngineServiceKm.toLocaleString()} ${tCommon("km")}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[var(--muted)]">
                {tStatus("GEAR_OIL")} / {tFleet("insurance")}
              </p>
              <p className="mt-0.5 text-white">
                {vehicle.nextGearOilKm != null
                  ? `${vehicle.nextGearOilKm.toLocaleString()} ${tCommon("km")}`
                  : "—"}{" "}
                · {vehicle.insuranceExpiry ?? "—"}
              </p>
            </div>
          </div>
        )}
        <label className="grid min-w-0 gap-1 text-sm">
          {tRentals("rentalCategory")}
          <select
            name="pricingPeriod"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Price["period"])}
            className={cls}
          >
            <option value="DAILY">{tStatus("DAILY")}</option>
            <option value="WEEKLY">{tStatus("WEEKLY")}</option>
            <option value="MONTHLY">{tStatus("MONTHLY")}</option>
          </select>
        </label>
        {[
          ["branchId", tRentals("operatingBranch")],
          ["pickupBranchId", tRentals("pickupBranch")],
          ["returnBranchId", tRentals("returnBranch")],
        ].map(([name, label]) => (
          <label key={name} className="grid min-w-0 gap-1 text-sm">
            {label}
            <select
              required
              name={name}
              value={selectedBranches[name]}
              onChange={(event) =>
                setSelectedBranches((previous) => ({ ...previous, [name]: event.target.value }))
              }
              className={cls}
            >
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <OmanDateTimePicker
          id="bookingStartsAt"
          name="startsAt"
          label={tRentals("pickupDateTime")}
          required
          value={startsAt}
          onChange={setStartsAt}
        />
        <OmanDateTimePicker
          id="expectedReturnAt"
          label={tRentals("expectedReturnDateTime")}
          min={startsAt || undefined}
          value={expectedReturn}
          onChange={handleExpectedReturnChange}
        />
        <label className="grid min-w-0 gap-1 text-sm">
          {tRentals("rentDuration", {
            unit:
              period === "DAILY"
                ? tCommon("days")
                : period === "WEEKLY"
                  ? tCommon("weeks")
                  : tCommon("calendarMonths"),
          })}
          <input
            required
            name="rentDuration"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className={cls}
          />
        </label>
        {[
          ["includedKm", tRentals("kmMaximum"), price?.includedKm],
          ["excessKmChargeBaisa", tRentals("excessKmCharge"), price?.excessKmChargeBaisa],
          ["lateFeeBaisa", tRentals("hourlyLateFee"), price?.lateFeeBaisa],
        ].map(([name, label, value]) => (
          <label key={String(name)} className="grid min-w-0 gap-1 text-sm">
            {label}
            <input
              required
              name={String(name)}
              type="text"
              inputMode="numeric"
              readOnly
              value={value ?? 0}
              className={cls}
            />
          </label>
        ))}
        {[
          ["pickupOdometerKm", tRentals("startingKm"), startingKm, setStartingKm],
          ["freeKm", tRentals("additionalFreeKm"), freeKm, setFreeKm],
          ["depositBaisa", tRentals("securityDeposit"), deposit, setDeposit],
          ["downPaymentBaisa", tRentals("downPayment"), downPayment, setDownPayment],
        ].map(([name, label, value, setValue]) => (
          <label key={String(name)} className="grid min-w-0 gap-1 text-sm">
            {String(label)}
            <input
              required
              name={String(name)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              value={String(value)}
              onChange={(event) => (setValue as (value: string) => void)(event.target.value)}
              className={cls}
            />
          </label>
        ))}
        <label className="grid min-w-0 gap-1 text-sm">
          {tRentals("rentAmountPer", { period: translateStatus(tStatus, period) })}
          <input
            required
            name="dailyRateBaisa"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            readOnly={!canOverridePrice}
            className={cls}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            name="openKm"
            type="checkbox"
            checked={openKm}
            onChange={(event) => setOpenKm(event.target.checked)}
          />
          {tRentals("openKmLabel")}
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("paymentMode")}
          <select name="paymentMode" className={cls}>
            <option value="CASH">{tStatus("CASH")}</option>
            <option value="CARD">{tStatus("CARD")}</option>
            <option value="BANK_TRANSFER">{tStatus("BANK_TRANSFER")}</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          {tCommon("user")}
          <input readOnly value={userName} className={cls} />
        </label>
        <p className="text-sm text-[var(--muted)] md:col-span-2">
          {tFleet("includedKm")}:{" "}
          {openKm
            ? tCommon("unlimited")
            : /^\d+$/.test(freeKm) &&
                Number.isSafeInteger(Number(freeKm)) &&
                Number(freeKm) <= 2_147_483_647
              ? calculateIncludedKm(price?.includedKm ?? 0, Number(freeKm))
              : "—"}{" "}
          · {tCommon("total")}: {Number.isFinite(total) ? total : "—"} {tCommon("baisa")} ·{" "}
          {tRentals("downPayment")}: {Number.isFinite(maximumPayment) ? maximumPayment : "—"}{" "}
          {tCommon("baisa")} · {tCommon("omanTimeFull")}
        </p>
        {vehicleId && !selectedAvailable && (
          <p role="alert" className="text-sm text-red-300">
            {tRentals("vehicleConflict")}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-red-300 md:col-span-2">
            {translateValidation(t, state.error)}
          </p>
        )}
        {price && (
          <p className="text-sm text-[var(--muted)]">
            {tRentals("lowestPermittedRate", { rate: price.minimumRentBaisa })}
            {canOverridePrice ? ` ${tRentals("overrideAudited")}` : ""}
          </p>
        )}
        {customer && (
          <div className="rounded border border-[var(--edge)] p-3 text-xs text-[var(--muted)] xl:col-span-3">
            {tCust("civilId")}: {customer.civilIdNumber ?? "—"} ({customer.civilIdExpiry ?? "—"}) ·{" "}
            {tCust("passport")}: {customer.passportNumber ?? "—"} ({customer.passportExpiry ?? "—"})
            · {tCust("drivingLicence")}: {customer.drivingLicenceNumber} (
            {customer.drivingLicenceExpiry}) · {tCust("visa")}: {customer.visaNumber ?? "—"} ·{" "}
            {tCust("sponsor")}: {customer.sponsorDetails ?? "—"} · {tCust("address")}:{" "}
            {customer.address}
          </div>
        )}
        <label className="grid min-w-0 gap-1 text-sm md:col-span-2">
          {tCommon("remarksNotes")}
          <textarea name="notes" rows={2} className={cls} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || !price || !expectedReturn || !selectedAvailable}
            className="min-h-11 w-full bg-[var(--accent)] px-4 font-semibold text-black"
          >
            {pending ? tRentals("savingReservation") : tRentals("createReservation")}
          </button>
        </div>
      </form>
    </section>
  );
}
