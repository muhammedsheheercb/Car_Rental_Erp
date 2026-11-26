"use client";
import { useTranslations } from "next-intl";
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
  const tRentals = useTranslations("rentals");
  const tStatus = useTranslations("status");
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
      <h2 className="text-lg font-semibold">{tRentals("overdueEstimateTitle")}</h2>
      <p className="mt-2 text-sm">
        {tRentals("additionalRent")}: {formatOMR(quote.additionalRentalBaisa)} ·{" "}
        {tRentals("hourlyLateFee")}: {formatOMR(quote.lateFeeBaisa)} · {tStatus("OVERDUE")}:{" "}
        {formatOMR(quote.overdueFineBaisa)}
      </p>
    </section>
  );
}
