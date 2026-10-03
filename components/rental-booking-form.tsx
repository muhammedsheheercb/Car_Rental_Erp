"use client";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { createReservationAction } from "@/app/[locale]/(protected)/rentals/actions";

import {
  calculateExpectedReturn,
  calculateIncludedKm,
  formatOmanDateTime,
  parseOmanDateTime,
  periodsOverlap,
} from "@/features/rentals/booking-calculations";

type Vehicle = {
  id: string;
  number: string;
  brand: string;
  model: string;
  branchId: string;
  currentOdometerKm: number;
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
  vehicles,
  prices,
  customers,
  branches,
  defaultBranch,
  canOverridePrice,
  userName,
  reservations,
}: {
  vehicles: Vehicle[];
  prices: Price[];
  customers: Customer[];
  branches: Branch[];
  defaultBranch: string;
  canOverridePrice: boolean;
  userName: string;
  reservations: { vehicleId: string; startsAt: string; expectedReturnAt: string; status: string }[];
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({
    branchId: defaultBranch,
    pickupBranchId: defaultBranch,
    returnBranchId: defaultBranch,
  });
  const [customerId, setCustomerId] = useState("");
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
  const cls = "min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3";
  return (
    <section className="border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-6">
      <h2 className="text-lg font-semibold">New booking / rental agreement</h2>
      <form action={action} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm">
          Customer
          <select
            required
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            className={cls}
          >
            <option value="">Search/select customer</option>
            {customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.mobile}
              </option>
            ))}
          </select>
        </label>
        <div className="grid content-end">
          <Link
            href="/en/customers/new?returnTo=/en/rentals"
            className="min-h-11 border border-[var(--edge)] px-3 py-3 text-center text-sm"
          >
            Add customer
          </Link>
        </div>
        <label className="grid min-w-0 gap-1 text-sm">
          Vehicle
          <select
            required
            name="vehicleId"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            className={cls}
          >
            <option value="">Search/select eligible vehicle</option>
            {availableVehicles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.number} · {item.brand} {item.model}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Rental category
          <select
            name="pricingPeriod"
            value={period}
            onChange={(event) => setPeriod(event.target.value as Price["period"])}
            className={cls}
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>
        {[
          ["branchId", "Operating branch"],
          ["pickupBranchId", "Pickup branch"],
          ["returnBranchId", "Return branch"],
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
        <label className="grid min-w-0 gap-1 text-sm">
          Reservation / pickup date and time (Oman)
          <input
            required
            name="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={cls}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Expected return date and time (Oman)
          <input readOnly value={expectedReturn} type="datetime-local" className={cls} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Rent duration (
          {period === "DAILY" ? "days" : period === "WEEKLY" ? "weeks" : "calendar months"})
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
          ["includedKm", "KM Maximum (total booking allowance)", price?.includedKm],
          ["excessKmChargeBaisa", "Excess KM charge (baisa)", price?.excessKmChargeBaisa],
          ["lateFeeBaisa", "Hourly late fee (baisa)", price?.lateFeeBaisa],
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
          ["pickupOdometerKm", "Starting KM", startingKm, setStartingKm],
          ["freeKm", "Additional Free KM", freeKm, setFreeKm],
          ["depositBaisa", "Security deposit (baisa)", deposit, setDeposit],
          ["downPaymentBaisa", "Down payment (baisa)", downPayment, setDownPayment],
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
          Rent amount per {period.toLowerCase()} period (baisa)
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
          Open KM (no excess KM charges)
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Payment mode
          <select name="paymentMode" className={cls}>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          User
          <input readOnly value={userName} className={cls} />
        </label>
        <p className="text-sm text-[var(--muted)] md:col-span-2">
          Included KM:{" "}
          {openKm
            ? "Unlimited"
            : /^\d+$/.test(freeKm) &&
                Number.isSafeInteger(Number(freeKm)) &&
                Number(freeKm) <= 2_147_483_647
              ? calculateIncludedKm(price?.includedKm ?? 0, Number(freeKm))
              : "—"}
          . Rental total: {Number.isFinite(total) ? total : "—"} baisa. Maximum down payment:{" "}
          {Number.isFinite(maximumPayment) ? maximumPayment : "—"} baisa. All dates and times use
          Asia/Muscat (UTC+04:00).
        </p>
        {vehicleId && !selectedAvailable && (
          <p role="alert" className="text-sm text-red-300">
            Selected vehicle is reserved or rented for this period. Choose another vehicle or
            period.
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-red-300 md:col-span-2">
            {state.error}
          </p>
        )}
        {price && (
          <p className="text-sm text-[var(--muted)]">
            Lowest permitted rate: {price.minimumRentBaisa} baisa.
            {canOverridePrice ? " Your role may override this rate; the action is audited." : ""}
          </p>
        )}
        {customer && (
          <div className="rounded border border-[var(--edge)] p-3 text-xs text-[var(--muted)] xl:col-span-3">
            Customer ID information: Civil {customer.civilIdNumber ?? "—"} (expires{" "}
            {customer.civilIdExpiry ?? "—"}) · Passport {customer.passportNumber ?? "—"} (expires{" "}
            {customer.passportExpiry ?? "—"}) · Licence {customer.drivingLicenceNumber} (expires{" "}
            {customer.drivingLicenceExpiry}) · Visa {customer.visaNumber ?? "—"} · Sponsor{" "}
            {customer.sponsorDetails ?? "—"} · Address {customer.address}
          </div>
        )}
        <label className="grid min-w-0 gap-1 text-sm md:col-span-2">
          Remarks / notes
          <textarea name="notes" rows={2} className={cls} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending || !price || !expectedReturn || !selectedAvailable}
            className="min-h-11 w-full bg-[var(--accent)] px-4 font-semibold text-black"
          >
            {pending ? "Saving reservation…" : "Create reservation"}
          </button>
        </div>
      </form>
    </section>
  );
}
