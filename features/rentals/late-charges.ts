const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const money = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be nonnegative whole baisa.`);
};
export type LateChargePolicy = {
  hourlyRateBaisa: number;
  additionalDayRentBaisa: number;
  overdueFinePerDayBaisa: number;
  graceMinutes: number;
  hourlyWindowHours: number;
};
/** One authority for financial lateness. The hourly window excludes the free grace hour.
 * Above the window, one day's rent REPLACES hourly fees for that 24-hour cycle.
 * Each completed cycle incurs one daily rent and one separate overdue fine.
 */
export function calculateLateCharges(input: {
  expectedReturnAt: Date;
  assessedAt: Date;
  policy: LateChargePolicy;
  approvedExtensions?: { previousExpectedReturnAt: Date; newExpectedReturnAt: Date }[];
}) {
  const { policy } = input;
  money(policy.hourlyRateBaisa, "Hourly late rate");
  money(policy.additionalDayRentBaisa, "Daily rent");
  money(policy.overdueFinePerDayBaisa, "Overdue fine");
  if (
    !Number.isInteger(policy.graceMinutes) ||
    policy.graceMinutes < 0 ||
    !Number.isInteger(policy.hourlyWindowHours) ||
    policy.hourlyWindowHours < 0 ||
    policy.graceMinutes + policy.hourlyWindowHours * 60 >= 1440
  )
    throw new Error("Invalid grace period or hourly late window.");
  let deadline = input.expectedReturnAt;
  for (const extension of input.approvedExtensions ?? []) {
    if (
      extension.previousExpectedReturnAt.getTime() !== deadline.getTime() ||
      !(extension.newExpectedReturnAt > deadline)
    )
      throw new Error("Extension history must form an approved chronological deadline chain.");
    deadline = extension.newExpectedReturnAt;
  }
  if (!Number.isFinite(deadline.getTime()) || !Number.isFinite(input.assessedAt.getTime()))
    throw new Error("Invalid charge timestamp.");
  const overdueMs = Math.max(0, input.assessedAt.getTime() - deadline.getTime());
  const completedOverdueDays = Math.floor(overdueMs / DAY);
  const remainderMs = overdueMs % DAY;
  const chargeableMs = Math.max(0, remainderMs - policy.graceMinutes * 60_000);
  const dailyRollover = chargeableMs > policy.hourlyWindowHours * HOUR;
  const additionalRentalDays = completedOverdueDays + (dailyRollover ? 1 : 0);
  const chargeableHours = dailyRollover ? 0 : Math.ceil(chargeableMs / HOUR);
  const additionalRentalBaisa = additionalRentalDays * policy.additionalDayRentBaisa;
  const lateFeeBaisa = chargeableHours * policy.hourlyRateBaisa;
  const overdueFineBaisa = completedOverdueDays * policy.overdueFinePerDayBaisa;
  const totalBaisa = additionalRentalBaisa + lateFeeBaisa + overdueFineBaisa;
  money(totalBaisa, "Late charge total");
  return {
    effectiveDeadline: deadline,
    overdueMs,
    completedOverdueDays,
    additionalRentalDays,
    chargeableHours,
    additionalRentalBaisa,
    lateFeeBaisa,
    overdueFineBaisa,
    totalBaisa,
  };
}

export function cancellationPolicy(input: {
  createdAt: Date;
  now: Date;
  windowMinutes: number;
  authorizedAdmin: boolean;
}) {
  if (
    !Number.isFinite(input.createdAt.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    !Number.isInteger(input.windowMinutes) ||
    input.windowMinutes < 0
  )
    throw new Error("Invalid cancellation policy.");
  const expired = input.now.getTime() - input.createdAt.getTime() > input.windowMinutes * 60_000;
  return {
    allowed: !expired || input.authorizedAdmin,
    overridden: expired && input.authorizedAdmin,
  };
}
