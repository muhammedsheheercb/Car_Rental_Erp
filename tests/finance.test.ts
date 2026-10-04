import { describe, expect, it } from "vitest";
import {
  assertPaymentAllowed,
  calculateBalance,
  calculatePayback,
  parseOMR,
  refundApprovalCredit,
} from "@/features/finance/calculations";
import { fineSchema } from "@/features/finance/validation";

describe("financial balances", () => {
  it("applies advances as credits and paybacks as debits", () => {
    expect(calculateBalance(500000, 200000)).toBe(300000);
    expect(calculateBalance(500000 + 100000, 700000)).toBe(-100000);
  });
  it("retains cumulative refunds and clearly shows the remaining amount", () => {
    expect(calculatePayback(500000, 300000, -200000)).toEqual({
      approvedBaisa: 500000,
      returnedBaisa: 300000,
      remainingBaisa: 200000,
      payableBaisa: 200000,
    });
    expect(() => assertPaymentAllowed(200001, 200000)).toThrow();
    expect(() => calculatePayback(500000, 500001, 0)).toThrow();
  });
  it("limits paybacks when subsequent charges consume customer credit", () => {
    expect(calculatePayback(500000, 300000, -50000).payableBaisa).toBe(50000);
    expect(calculatePayback(500000, 300000, 10000).payableBaisa).toBe(0);
  });
  it("approves only the credit adjustment needed for a refund", () => {
    expect(refundApprovalCredit(-500000, 0, 500000)).toBe(0);
    expect(refundApprovalCredit(0, 0, 500000)).toBe(500000);
    expect(refundApprovalCredit(-200000, 200000, 100000)).toBe(100000);
  });
  it("parses OMR exactly into baisa and rejects rounding and overflow", () => {
    expect(parseOMR("500.123")).toBe(500123);
    for (const amount of ["0.0001", "-1", "1e3", "2147483.648"])
      expect(() => parseOMR(amount)).toThrow();
  });
  it("rejects reversed fine date ranges", () => {
    expect(
      fineSchema.safeParse({
        rentalId: "00000000-0000-4000-8000-000000000001",
        requestId: "00000000-0000-4000-8000-000000000002",
        kind: "NORMAL",
        amount: "5",
        dateFrom: "2026-10-03T12:00",
        dateTo: "2026-10-03T11:00",
        details: "Traffic fine",
      }).success,
    ).toBe(false);
  });
});
