import { describe, expect, it } from "vitest";
import {
  calculateExcessKm,
  calculateExpectedReturn,
  calculateIncludedKm,
  formatOmanDateTime,
  parseOmanDateTime,
  periodsOverlap,
  validateDownPayment,
} from "@/features/rentals/booking-calculations";
import { calculateRentalCharge } from "@/features/rentals/calculations";
import { reservationSchema } from "@/lib/validation";

describe("booking calculations", () => {
  it("includes 200 maximum plus 50 free KM, charging only above 250", () => {
    expect(calculateIncludedKm(200, 50)).toBe(250);
    const km = { maximumKm: 200, freeKm: 50, startingKm: 1000 };
    expect(calculateExcessKm({ ...km, returnKm: 1250 })).toBe(0);
    expect(calculateExcessKm({ ...km, returnKm: 1251 })).toBe(1);
    expect(calculateExcessKm({ ...km, returnKm: 1249 })).toBe(0);
    expect(calculateExcessKm({ ...km, returnKm: 3000, openKm: true })).toBe(0);
  });
  it("accepts zero starting odometer and rejects a decreasing odometer", () => {
    expect(calculateExcessKm({ maximumKm: 200, freeKm: 50, startingKm: 0, returnKm: 251 })).toBe(1);
    expect(() =>
      calculateExcessKm({ maximumKm: 200, freeKm: 50, startingKm: 1000, returnKm: 999 }),
    ).toThrow();
    expect(() => calculateIncludedKm(200, -1)).toThrow();
    expect(() => calculateIncludedKm(200, 0.5)).toThrow();
  });
  it("keeps Oman pickup time when adding days and weeks", () => {
    const start = parseOmanDateTime("2026-08-22T14:30");
    expect(start.toISOString()).toBe("2026-08-22T10:30:00.000Z");
    expect(formatOmanDateTime(calculateExpectedReturn(start, "DAILY", 2))).toBe("2026-08-24T14:30");
    expect(formatOmanDateTime(calculateExpectedReturn(start, "WEEKLY", 2))).toBe(
      "2026-09-05T14:30",
    );
  });
  it("uses calendar months and clamps month-end dates, including leap years", () => {
    expect(
      formatOmanDateTime(
        calculateExpectedReturn(parseOmanDateTime("2026-01-31T23:45"), "MONTHLY", 1),
      ),
    ).toBe("2026-02-28T23:45");
    expect(
      formatOmanDateTime(
        calculateExpectedReturn(parseOmanDateTime("2028-01-31T23:45"), "MONTHLY", 1),
      ),
    ).toBe("2028-02-29T23:45");
    expect(
      formatOmanDateTime(
        calculateExpectedReturn(parseOmanDateTime("2026-12-31T00:30"), "MONTHLY", 2),
      ),
    ).toBe("2027-02-28T00:30");
  });
  it("rejects missing time, impossible dates and invalid durations", () => {
    for (const value of ["2026-08-22", "2026-02-30T12:00", "2026-01-01T25:00", "invalid"])
      expect(() => parseOmanDateTime(value)).toThrow();
    for (const duration of [0, -1, 1.5, 366])
      expect(() => calculateExpectedReturn(new Date(), "DAILY", duration)).toThrow();
  });
  it("charges weekly/monthly rent per selected period rather than per day", () => {
    for (const pricingPeriod of ["WEEKLY", "MONTHLY"] as const) {
      const startsAt = parseOmanDateTime("2026-08-22T14:30");
      const result = calculateRentalCharge({
        startsAt,
        expectedReturnAt: calculateExpectedReturn(startsAt, pricingPeriod, 2),
        pricingPeriod,
        rentDuration: 2,
        dailyRateBaisa: 100000,
        includedKm: 200,
        freeKm: 50,
        pickupOdometerKm: 0,
        returnOdometerKm: 251,
        excessKmChargeBaisa: 100,
        lateFeeBaisa: 0,
      });
      expect(result.rentalBaisa).toBe(200000);
      expect(result.excessBaisa).toBe(100);
      expect(result.totalBaisa).toBe(200100);
    }
  });
  it("caps down payments at the rental plus deposit and permits zero", () => {
    expect(validateDownPayment(0, 20000, 10000)).toBe(30000);
    expect(validateDownPayment(30000, 20000, 10000)).toBe(30000);
    for (const amount of [30001, -1, 0.5, Number.NaN])
      expect(() => validateDownPayment(amount, 20000, 10000)).toThrow();
  });
  it("blocks overlapping periods but permits adjacent reservations", () => {
    const date = (day: number) => parseOmanDateTime(`2026-08-${day}T10:00`);
    expect(periodsOverlap(date(22), date(24), date(23), date(25))).toBe(true);
    expect(periodsOverlap(date(22), date(24), date(22), date(24))).toBe(true);
    expect(periodsOverlap(date(22), date(24), date(21), date(25))).toBe(true);
    expect(periodsOverlap(date(22), date(24), date(24), date(26))).toBe(false);
    expect(periodsOverlap(date(22), date(24), date(20), date(22))).toBe(false);
  });
});
const id = "00000000-0000-4000-8000-000000000001";
const booking = {
  customerId: id,
  vehicleId: id,
  branchId: id,
  pickupBranchId: id,
  returnBranchId: id,
  startsAt: "2026-08-22T14:30",
  pricingPeriod: "DAILY",
  rentDuration: "2",
  dailyRateBaisa: "20000",
  includedKm: "200",
  freeKm: "50",
  pickupOdometerKm: "1000",
  excessKmChargeBaisa: "100",
  lateFeeBaisa: "0",
  depositBaisa: "0",
  downPaymentBaisa: "10000",
  paymentMode: "CASH",
};
describe("booking input validation", () => {
  it("parses Oman time and ordinary typed numeric fields", () => {
    const value = reservationSchema.parse(booking);
    expect(value.startsAt.toISOString()).toBe("2026-08-22T10:30:00.000Z");
    expect(value.rentDuration).toBe(2);
    expect(value.openKm).toBe(false);
    expect(reservationSchema.parse({ ...booking, openKm: "on" }).openKm).toBe(true);
  });
  it("ignores forged return time/user and rejects unsupported payment modes", () => {
    const value = reservationSchema.parse({
      ...booking,
      expectedReturnAt: "1900-01-01",
      createdBy: id,
    });
    expect(value).not.toHaveProperty("expectedReturnAt");
    expect(value).not.toHaveProperty("createdBy");
    expect(reservationSchema.safeParse({ ...booking, paymentMode: "ONLINE" }).success).toBe(false);
  });
  it("rejects database integer overflow", () => {
    expect(reservationSchema.safeParse({ ...booking, freeKm: "2147483648" }).success).toBe(false);
  });
});
