import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
export const DEFAULT_FLEET_ALERTS = { nearServiceKm: 1000, expirySoonDays: 30 };
export function serviceDue(
  currentKm: number,
  lastServiceKm: number,
  intervalKm: number,
  thresholdKm: number,
) {
  for (const n of [currentKm, lastServiceKm, intervalKm, thresholdKm])
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error("Invalid service kilometre configuration.");
  if (!intervalKm) throw new Error("Service interval must be positive.");
  const nextServiceKm = lastServiceKm + intervalKm;
  if (!Number.isSafeInteger(nextServiceKm))
    throw new Error("Service kilometre configuration is too large.");
  const remainingKm = nextServiceKm - currentKm;
  return {
    nextServiceKm,
    remainingKm,
    show: remainingKm <= thresholdKm,
    status: remainingKm <= 0 ? "Due / Overdue" : "Approaching",
  };
}
export function expiryStatus(expiry: string | null, now: Date, thresholdDays: number) {
  if (!Number.isInteger(thresholdDays) || thresholdDays < 0 || thresholdDays > 3650)
    throw new Error("Invalid expiry threshold.");
  if (!expiry) return { daysRemaining: null, status: "Not configured" as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error("Invalid expiry date.");
  const date = new Date(`${expiry}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== expiry)
    throw new Error("Invalid expiry date.");
  const today = formatOmanDateTime(now).slice(0, 10);
  const daysRemaining = Math.round(
    (date.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000,
  );
  return {
    daysRemaining,
    status:
      daysRemaining < 0
        ? ("Expired" as const)
        : daysRemaining <= thresholdDays
          ? ("Expiring Soon" as const)
          : ("Valid" as const),
  };
}
