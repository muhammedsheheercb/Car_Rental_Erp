import { calculateExcessKm, type RentalPeriod } from "./booking-calculations";
import { calculateLateCharges } from "./late-charges";
export const BAISA_PER_OMR = 1000;

export function calculateRentalCharge(input: {
  startsAt: Date;
  expectedReturnAt: Date;
  actualReturnAt?: Date;
  dailyRateBaisa: number;
  pricingPeriod?: RentalPeriod;
  rentDuration?: number;
  freeKm?: number;
  openKm?: boolean;
  includedKm: number;
  pickupOdometerKm?: number;
  returnOdometerKm?: number;
  excessKmChargeBaisa: number;
  lateFeeBaisa: number;
  additionalDayRentBaisa?: number;
  lateGraceMinutes?: number;
  lateWindowHours?: number;
  overdueFineBaisa?: number;
  taxRate?: number;
}) {
  const durationMs =
    (input.actualReturnAt ?? input.expectedReturnAt).getTime() - input.startsAt.getTime();
  const days = Math.max(1, Math.ceil(durationMs / 86_400_000));
  const duration =
    input.rentDuration ??
    Math.max(
      1,
      Math.ceil((input.expectedReturnAt.getTime() - input.startsAt.getTime()) / 86_400_000),
    );
  const rentalBaisa = duration * input.dailyRateBaisa;
  const hasOdometers = input.returnOdometerKm != null && input.pickupOdometerKm != null;
  const drivenKm = hasOdometers ? (input.returnOdometerKm ?? 0) - (input.pickupOdometerKm ?? 0) : 0;
  const excessKm = hasOdometers
    ? calculateExcessKm({
        maximumKm: input.includedKm,
        freeKm: input.freeKm ?? 0,
        startingKm: input.pickupOdometerKm ?? 0,
        returnKm: input.returnOdometerKm ?? 0,
        openKm: input.openKm,
      })
    : 0;
  const excessBaisa = excessKm * input.excessKmChargeBaisa;
  const late = calculateLateCharges({
    expectedReturnAt: input.expectedReturnAt,
    assessedAt: input.actualReturnAt ?? input.expectedReturnAt,
    policy: {
      hourlyRateBaisa: input.lateFeeBaisa,
      additionalDayRentBaisa: input.additionalDayRentBaisa ?? input.dailyRateBaisa,
      overdueFinePerDayBaisa: input.overdueFineBaisa ?? 5000,
      graceMinutes: input.lateGraceMinutes ?? 60,
      hourlyWindowHours: input.lateWindowHours ?? 4,
    },
  });
  const lateDays = late.completedOverdueDays;
  const lateBaisa = late.lateFeeBaisa;
  const additionalRentalBaisa = late.additionalRentalBaisa;
  const overdueFineBaisa = late.overdueFineBaisa;
  const subtotalBaisa =
    rentalBaisa + excessBaisa + additionalRentalBaisa + lateBaisa + overdueFineBaisa;
  const taxBaisa = Math.round(subtotalBaisa * (input.taxRate ?? 0));
  return {
    days,
    drivenKm,
    excessKm,
    lateDays,
    rentalBaisa,
    excessBaisa,
    lateBaisa,
    additionalRentalBaisa,
    overdueFineBaisa,
    subtotalBaisa,
    taxBaisa,
    totalBaisa: subtotalBaisa + taxBaisa,
  };
}

export const formatOMR = (baisa: number, locale = "en-OM") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "OMR",
    minimumFractionDigits: 3,
  }).format(baisa / BAISA_PER_OMR);
