import { describe, expect, it } from "vitest";
import { calculateRentalCharge } from "@/features/rentals/calculations";
import { calculateLateCharges, cancellationPolicy } from "@/features/rentals/late-charges";
import { cancellationSchema } from "@/lib/validation";

const deadline = new Date("2026-08-23T10:00:00+04:00");
const policy = {
  hourlyRateBaisa: 2000,
  additionalDayRentBaisa: 20000,
  overdueFinePerDayBaisa: 5000,
  graceMinutes: 60,
  hourlyWindowHours: 4,
};
const assess = (hours: number, ms = 0) =>
  calculateLateCharges({
    expectedReturnAt: deadline,
    assessedAt: new Date(deadline.getTime() + hours * 3600000 + ms),
    policy,
  });
describe("authoritative financial late charges", () => {
  it.each([-1, 0, 0.5, 1])("does not charge within the first free hour (%s)", (hours) =>
    expect(assess(hours).totalBaisa).toBe(0),
  );
  it.each([
    [2, 2000],
    [3, 4000],
    [4, 6000],
    [5, 8000],
  ])("charges OMR 2 per hour after grace (%s hours overdue)", (hours, fee) => {
    expect(assess(hours)).toMatchObject({
      lateFeeBaisa: fee,
      additionalRentalBaisa: 0,
      overdueFineBaisa: 0,
    });
  });
  it("rounds partial chargeable hours up but keeps exact grace/window boundaries", () => {
    expect(assess(1, 1).lateFeeBaisa).toBe(2000);
    expect(assess(2, 1).lateFeeBaisa).toBe(4000);
    expect(assess(5).lateFeeBaisa).toBe(8000);
    expect(assess(5, 1)).toMatchObject({
      lateFeeBaisa: 0,
      additionalRentalBaisa: 20000,
      overdueFineBaisa: 0,
    });
    expect(assess(23.99)).toMatchObject({
      additionalRentalBaisa: 20000,
      lateFeeBaisa: 0,
      overdueFineBaisa: 0,
    });
  });
  it.each([
    [24, 20000, 5000],
    [48, 40000, 10000],
    [72, 60000, 15000],
  ])("charges separate daily rent and completed-day fine at %s hours", (hours, rent, fine) => {
    expect(assess(hours)).toMatchObject({
      additionalRentalBaisa: rent,
      lateFeeBaisa: 0,
      overdueFineBaisa: fine,
    });
  });
  it("repeats grace/hourly/daily rules in subsequent overdue periods", () => {
    expect(assess(25)).toMatchObject({
      additionalRentalBaisa: 20000,
      lateFeeBaisa: 0,
      overdueFineBaisa: 5000,
    });
    expect(assess(26)).toMatchObject({
      additionalRentalBaisa: 20000,
      lateFeeBaisa: 2000,
      overdueFineBaisa: 5000,
    });
    expect(assess(29)).toMatchObject({
      additionalRentalBaisa: 20000,
      lateFeeBaisa: 8000,
      overdueFineBaisa: 5000,
    });
    expect(assess(29, 1)).toMatchObject({
      additionalRentalBaisa: 40000,
      lateFeeBaisa: 0,
      overdueFineBaisa: 5000,
    });
    expect(assess(50)).toMatchObject({
      additionalRentalBaisa: 40000,
      lateFeeBaisa: 2000,
      overdueFineBaisa: 10000,
    });
  });
  it("supports configurable grace, window, rent, hourly fee, and disabled fines", () => {
    const result = calculateLateCharges({
      expectedReturnAt: deadline,
      assessedAt: new Date(deadline.getTime() + 2 * 3600000),
      policy: {
        ...policy,
        graceMinutes: 30,
        hourlyWindowHours: 2,
        hourlyRateBaisa: 1500,
        overdueFinePerDayBaisa: 0,
      },
    });
    expect(result).toMatchObject({ chargeableHours: 2, lateFeeBaisa: 3000, overdueFineBaisa: 0 });
    expect(
      calculateLateCharges({
        expectedReturnAt: deadline,
        assessedAt: new Date(deadline.getTime() + 3 * 3600000),
        policy: {
          ...policy,
          graceMinutes: 30,
          hourlyWindowHours: 2,
          additionalDayRentBaisa: 30000,
        },
      }).additionalRentalBaisa,
    ).toBe(30000);
  });
  it("excludes all periods covered by approved extensions, including retroactive coverage", () => {
    const first = new Date(deadline.getTime() + 24 * 3600000);
    const second = new Date(deadline.getTime() + 48 * 3600000);
    const extensions = [
      { previousExpectedReturnAt: deadline, newExpectedReturnAt: first },
      { previousExpectedReturnAt: first, newExpectedReturnAt: second },
    ];
    expect(
      calculateLateCharges({
        expectedReturnAt: deadline,
        assessedAt: second,
        policy,
        approvedExtensions: extensions,
      }).totalBaisa,
    ).toBe(0);
    expect(
      calculateLateCharges({
        expectedReturnAt: deadline,
        assessedAt: new Date(second.getTime() + 24 * 3600000),
        policy,
        approvedExtensions: extensions,
      }),
    ).toMatchObject({ additionalRentalBaisa: 20000, overdueFineBaisa: 5000 });
    expect(() =>
      calculateLateCharges({
        expectedReturnAt: deadline,
        assessedAt: second,
        policy,
        approvedExtensions: [extensions[1]],
      }),
    ).toThrow("chronological");
  });
  it("keeps base rent, added rent, hourly fees and fine separate without double-counting elapsed days", () => {
    const result = calculateRentalCharge({
      startsAt: new Date("2026-08-22T10:00:00+04:00"),
      expectedReturnAt: deadline,
      actualReturnAt: new Date(deadline.getTime() + 26 * 3600000),
      dailyRateBaisa: 20000,
      includedKm: 200,
      excessKmChargeBaisa: 100,
      lateFeeBaisa: 2000,
      additionalDayRentBaisa: 20000,
    });
    expect(result).toMatchObject({
      rentalBaisa: 20000,
      additionalRentalBaisa: 20000,
      lateBaisa: 2000,
      overdueFineBaisa: 5000,
      totalBaisa: 47000,
    });
  });
  it("uses elapsed timestamps independent of presentation timezone", () => {
    expect(
      calculateLateCharges({
        expectedReturnAt: new Date("2026-08-23T06:00:00Z"),
        assessedAt: new Date("2026-08-23T12:00:00+04:00"),
        policy,
      }).lateFeeBaisa,
    ).toBe(2000);
  });
  it.each([
    { ...policy, hourlyRateBaisa: -1 },
    { ...policy, hourlyRateBaisa: 0.5 },
    { ...policy, graceMinutes: -1 },
    { ...policy, hourlyWindowHours: 24 },
    { ...policy, overdueFinePerDayBaisa: NaN },
  ])("rejects invalid financial policies", (invalid) => {
    expect(() =>
      calculateLateCharges({ expectedReturnAt: deadline, assessedAt: deadline, policy: invalid }),
    ).toThrow();
  });
  it("rejects invalid timestamps and unsafe totals", () => {
    expect(() =>
      calculateLateCharges({ expectedReturnAt: new Date("invalid"), assessedAt: deadline, policy }),
    ).toThrow();
    expect(() =>
      calculateLateCharges({
        expectedReturnAt: deadline,
        assessedAt: new Date(deadline.getTime() + 48 * 3600000),
        policy: { ...policy, additionalDayRentBaisa: Number.MAX_SAFE_INTEGER },
      }),
    ).toThrow();
  });
});
describe("cancellation restrictions", () => {
  const createdAt = new Date("2026-08-22T06:00:00Z");
  it("permits normal users through exactly 15 minutes and rejects the next millisecond", () => {
    expect(
      cancellationPolicy({
        createdAt,
        now: new Date(createdAt.getTime() + 900000),
        windowMinutes: 15,
        authorizedAdmin: false,
      }).allowed,
    ).toBe(true);
    expect(
      cancellationPolicy({
        createdAt,
        now: new Date(createdAt.getTime() + 900001),
        windowMinutes: 15,
        authorizedAdmin: false,
      }).allowed,
    ).toBe(false);
  });
  it("records authorized admin override only when the window has expired", () => {
    expect(
      cancellationPolicy({
        createdAt,
        now: new Date(createdAt.getTime() + 900001),
        windowMinutes: 15,
        authorizedAdmin: true,
      }),
    ).toEqual({ allowed: true, overridden: true });
    expect(
      cancellationPolicy({ createdAt, now: createdAt, windowMinutes: 15, authorizedAdmin: true })
        .overridden,
    ).toBe(false);
  });
  it("requires confirmation, remarks and consistent odometers", () => {
    const base = {
      rentalId: "00000000-0000-4000-8000-000000000001",
      confirmed: "on",
      startingKm: "100",
      endingKm: "110",
      remarks: "Customer request",
    };
    expect(cancellationSchema.safeParse(base).success).toBe(true);
    expect(cancellationSchema.safeParse({ ...base, confirmed: undefined }).success).toBe(false);
    expect(cancellationSchema.safeParse({ ...base, remarks: " " }).success).toBe(false);
    expect(cancellationSchema.safeParse({ ...base, endingKm: "99" }).success).toBe(false);
  });
});
