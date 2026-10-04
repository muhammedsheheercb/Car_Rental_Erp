import { describe, expect, it } from "vitest";
import { invoiceCalculation, omrInput } from "@/features/invoices/calculations";
import { transferBalance, transferMileage } from "@/features/transfers/calculations";

const mileage = {
  startingKm: 1000,
  endingKm: 1100,
  maximumKm: 200,
  freeKm: 50,
  excessRateBaisa: 100,
  openKm: false,
};
describe("transfer allowance", () => {
  it("carries unused standard and free KM", () =>
    expect(transferMileage(mileage)).toEqual({
      totalKm: 100,
      extraKm: 0,
      extraBaisa: 0,
      remainingMaximumKm: 100,
      remainingFreeKm: 50,
    }));
  it("uses free KM only after standard KM", () =>
    expect(transferMileage({ ...mileage, endingKm: 1220 })).toMatchObject({
      remainingMaximumKm: 0,
      remainingFreeKm: 30,
      extraBaisa: 0,
    }));
  it("charges excess once and carries no exhausted allowance", () =>
    expect(transferMileage({ ...mileage, endingKm: 1300 })).toMatchObject({
      remainingMaximumKm: 0,
      remainingFreeKm: 0,
      extraKm: 50,
      extraBaisa: 5000,
    }));
  it("does not multiply allowances when vehicles swap repeatedly", () => {
    const first = transferMileage(mileage);
    const second = transferMileage({
      ...mileage,
      startingKm: 3000,
      endingKm: 3120,
      maximumKm: first.remainingMaximumKm,
      freeKm: first.remainingFreeKm,
    });
    expect(second.remainingFreeKm).toBe(30);
    expect(second.extraBaisa).toBe(0);
  });
  it("respects open KM", () =>
    expect(transferMileage({ ...mileage, endingKm: 5000, openKm: true }).extraBaisa).toBe(0));
  it("rejects odometer reversal and fractional KM", () => {
    expect(() => transferMileage({ ...mileage, endingKm: 999 })).toThrow();
    expect(() => transferMileage({ ...mileage, endingKm: 1000.1 })).toThrow();
  });
  it("rejects an overflowing charge", () =>
    expect(() =>
      transferMileage({ ...mileage, endingKm: 2147483647, excessRateBaisa: 2147483647 }),
    ).toThrow());
  it("transfers debt after charges and receipt", () =>
    expect(transferBalance(5000, 2000, 3000)).toEqual({
      balanceToTransfer: 7000,
      newBalance: 4000,
    }));
  it("preserves customer credit without collecting additional money", () =>
    expect(transferBalance(-5000, 2000, 0).newBalance).toBe(-3000));
  it("does not collect more than remaining debt", () =>
    expect(() => transferBalance(5000, 0, 5001)).toThrow());
});
describe("invoice exact amounts", () => {
  const base = {
    subtotal: 10000,
    washing: 0,
    petrol: 0,
    discount: 0,
    advance: 5000,
    previouslyReceived: 0,
    paybacks: 0,
    received: 0,
  };
  it("OMR 10 less OMR 5 advance leaves OMR 5", () =>
    expect(invoiceCalculation(base)).toMatchObject({
      grandTotal: 10000,
      outstanding: 5000,
      balance: 5000,
    }));
  it("accepts the exact remaining amount", () =>
    expect(invoiceCalculation({ ...base, received: 5000 }).balance).toBe(0));
  it("rejects one baisa of overpayment", () =>
    expect(() => invoiceCalculation({ ...base, received: 5001 })).toThrow());
  it("combines charges and discount in exact baisa", () =>
    expect(
      invoiceCalculation({ ...base, washing: 1111, petrol: 2222, discount: 333 }).grandTotal,
    ).toBe(13000));
  it("includes earlier receipts and paybacks", () =>
    expect(
      invoiceCalculation({ ...base, previouslyReceived: 3000, paybacks: 1000 }).outstanding,
    ).toBe(3000));
  it("keeps an existing credit visible", () =>
    expect(invoiceCalculation({ ...base, advance: 12000 })).toMatchObject({
      outstanding: 0,
      balance: -2000,
    }));
  it("rejects negative totals and fractions", () => {
    expect(() => invoiceCalculation({ ...base, discount: 10001 })).toThrow();
    expect(() => invoiceCalculation({ ...base, washing: 1.1 })).toThrow();
  });
  it("rejects totals beyond supported limits", () =>
    expect(() => invoiceCalculation({ ...base, subtotal: 2147483647, washing: 1 })).toThrow());
  it("formats positive and negative baisa without float division", () => {
    expect(omrInput(1)).toBe("0.001");
    expect(omrInput(10005)).toBe("10.005");
    expect(omrInput(-2000)).toBe("-2.000");
  });
});

it("includes the held deposit in collection without discounting it", () => {
  expect(
    invoiceCalculation({
      subtotal: 10000,
      deposit: 5000,
      washing: 0,
      petrol: 0,
      discount: 1000,
      advance: 5000,
      previouslyReceived: 0,
      paybacks: 0,
      received: 0,
    }),
  ).toMatchObject({ grandTotal: 14000, balance: 9000 });
});
