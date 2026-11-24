export type RentalPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
export const OMAN_TIMEZONE = "Asia/Muscat";
const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;
const integer = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a nonnegative integer.`);
};

/** datetime-local values always represent Oman wall time, independent of the browser/server zone. */
export function parseOmanDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid Oman date and time.");
  const date = new Date(`${value}:00+04:00`);
  if (!Number.isFinite(date.getTime()) || formatOmanDateTime(date) !== value)
    throw new Error("Enter a valid Oman date and time.");
  return date;
}
export function formatOmanDateTime(value: Date): string {
  return new Date(value.getTime() + OMAN_OFFSET_MS).toISOString().slice(0, 16);
}
export function calculateExpectedReturn(
  startsAt: Date,
  period: RentalPeriod,
  duration: number,
): Date {
  if (!Number.isFinite(startsAt.getTime())) throw new Error("Invalid start date.");
  integer(duration, "Duration");
  if (!duration || duration > 365) throw new Error("Duration must be between 1 and 365.");
  if (period === "DAILY" || period === "WEEKLY")
    return new Date(startsAt.getTime() + duration * (period === "WEEKLY" ? 7 : 1) * 86_400_000);
  if (period !== "MONTHLY") throw new Error("Invalid rental type.");
  const local = new Date(startsAt.getTime() + OMAN_OFFSET_MS);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + duration);
  const lastDay = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  local.setUTCDate(Math.min(day, lastDay));
  return new Date(local.getTime() - OMAN_OFFSET_MS);
}
export function calculateDurationFromReturn(
  startsAt: Date,
  returnAt: Date,
  period: RentalPeriod,
): number {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(returnAt.getTime())) return 1;
  const diffMs = returnAt.getTime() - startsAt.getTime();
  if (diffMs <= 0) return 1;
  if (period === "DAILY") return Math.min(365, Math.max(1, Math.ceil(diffMs / 86_400_000)));
  if (period === "WEEKLY") return Math.min(365, Math.max(1, Math.ceil(diffMs / (7 * 86_400_000))));
  const startOman = new Date(startsAt.getTime() + OMAN_OFFSET_MS);
  const endOman = new Date(returnAt.getTime() + OMAN_OFFSET_MS);
  let months = Math.max(
    1,
    (endOman.getUTCFullYear() - startOman.getUTCFullYear()) * 12 +
      (endOman.getUTCMonth() - startOman.getUTCMonth()),
  );
  if (months < 365 && calculateExpectedReturn(startsAt, "MONTHLY", months) < returnAt) {
    months += 1;
  }
  return Math.min(365, Math.max(1, months));
}
export function calculateIncludedKm(maximumKm: number, freeKm: number): number {
  integer(maximumKm, "KM maximum");
  integer(freeKm, "Free KM");
  const total = maximumKm + freeKm;
  integer(total, "Included KM");
  return total;
}
export function calculateExcessKm(input: {
  maximumKm: number;
  freeKm: number;
  startingKm: number;
  returnKm: number;
  openKm?: boolean;
}): number {
  integer(input.startingKm, "Starting KM");
  integer(input.returnKm, "Return KM");
  if (input.returnKm < input.startingKm) throw new Error("Return KM cannot be below starting KM.");
  const allowance = calculateIncludedKm(input.maximumKm, input.freeKm);
  return input.openKm ? 0 : Math.max(0, input.returnKm - input.startingKm - allowance);
}
export function validateDownPayment(amount: number, rentalTotal: number, deposit: number): number {
  integer(amount, "Down payment");
  integer(rentalTotal, "Rental total");
  integer(deposit, "Deposit");
  const maximum = rentalTotal + deposit;
  if (amount > maximum)
    throw new Error("Down payment cannot exceed rental total plus security deposit.");
  return maximum;
}
export function periodsOverlap(start: Date, end: Date, otherStart: Date, otherEnd: Date): boolean {
  return start < otherEnd && end > otherStart;
}
