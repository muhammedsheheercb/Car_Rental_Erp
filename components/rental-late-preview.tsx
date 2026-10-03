"use client";
import { useEffect, useState } from "react";
import { formatOMR } from "@/features/rentals/calculations";
import { calculateLateCharges, type LateChargePolicy } from "@/features/rentals/late-charges";
export function RentalLatePreview({
  expectedReturnAt,
  initialNow,
  policy,
}: {
  expectedReturnAt: string;
  initialNow: string;
  policy: LateChargePolicy;
}) {
  const [now, setNow] = useState(new Date(initialNow));
  useEffect(() => {
    const anchor = performance.now();
    const time = new Date(initialNow).getTime();
    setNow(new Date(time));
    const timer = setInterval(() => setNow(new Date(time + performance.now() - anchor)), 15000);
    return () => clearInterval(timer);
  }, [initialNow]);
  const quote = calculateLateCharges({
    expectedReturnAt: new Date(expectedReturnAt),
    assessedAt: now,
    policy,
  });
  return (
    <section className="rounded-xl border border-[var(--edge)] p-4">
      <h2 className="text-lg font-semibold">Current overdue charge estimate</h2>
      <p className="mt-2 text-sm">
        Additional rental charge: {formatOMR(quote.additionalRentalBaisa)} · Late fee:{" "}
        {formatOMR(quote.lateFeeBaisa)} · Overdue fine: {formatOMR(quote.overdueFineBaisa)}
      </p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        {policy.graceMinutes} minutes free per overdue day, then up to {policy.hourlyWindowHours}{" "}
        chargeable hours at {formatOMR(policy.hourlyRateBaisa)}/hour. Above that window, one day's
        rent replaces hourly fees. Fine: {formatOMR(policy.overdueFinePerDayBaisa)} per completed
        overdue day. Estimates are posted only when the vehicle is returned.
      </p>
    </section>
  );
}
