import { describe, expect, it } from "vitest";
import {
  buildRunningLedger,
  isDateExpiredInOman,
  LEDGER_PAGE_SIZE,
  normalizeLedgerFilterType,
  parseOmanDateRange,
  type RawLedgerEntry,
  resolveLedgerDisplayType,
  summarizeCustomerFinancials,
} from "@/features/ledger/calculations";

function makeEntry(
  overrides: Partial<RawLedgerEntry> & { id: string; createdAt: Date },
): RawLedgerEntry {
  return {
    type: "RENT_CHARGE",
    paymentKind: null,
    paymentMethod: null,
    rentalId: "00000000-0000-4000-8000-000000000100",
    agreementNumber: "OMR-20261001-AAA11111",
    paymentId: null,
    receiptNumber: null,
    branchName: "Al Watan",
    description: "Rental charge",
    debitBaisa: 0,
    creditBaisa: 0,
    ...overrides,
  };
}

describe("Customer Ledger calculations (§18)", () => {
  it("parses Oman calendar date ranges accurately (UTC+04:00)", () => {
    const range = parseOmanDateRange("2026-10-01", "2026-10-05");
    expect(range.validFrom).toBe("2026-10-01");
    expect(range.validTo).toBe("2026-10-05");
    expect(range.fromDate?.toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(range.toExclusiveDate?.toISOString()).toBe("2026-10-05T20:00:00.000Z");

    const swapped = parseOmanDateRange("2026-10-10", "2026-10-02");
    expect(swapped.validFrom).toBe("2026-10-02");
    expect(swapped.validTo).toBe("2026-10-10");

    const invalid = parseOmanDateRange("2026-02-30", "invalid");
    expect(invalid.validFrom).toBe("");
    expect(invalid.validTo).toBe("");
    expect(invalid.fromDate).toBeUndefined();
    expect(invalid.toExclusiveDate).toBeUndefined();
  });

  it("maps ledger types and payment kinds to clear display labels", () => {
    expect(resolveLedgerDisplayType("PAYMENT", "ADVANCE")).toEqual({
      code: "ADVANCE",
      label: "Advance",
    });
    expect(resolveLedgerDisplayType("PAYMENT", "RECEIPT")).toEqual({
      code: "RECEIPT",
      label: "Receipt",
    });
    expect(resolveLedgerDisplayType("PAYBACK", "REVERSAL")).toEqual({
      code: "REVERSAL",
      label: "Reversal",
    });
    expect(resolveLedgerDisplayType("PAYBACK", "PAYBACK")).toEqual({
      code: "PAYBACK",
      label: "Payback",
    });
    expect(resolveLedgerDisplayType("LEGAL_FINE")).toEqual({
      code: "LEGAL_FINE",
      label: "Legal Fine",
    });
    expect(normalizeLedgerFilterType("advance")).toBe("ADVANCE");
    expect(normalizeLedgerFilterType("nonexistent")).toBe("ALL");
  });

  it("computes true chronological running balances and opening balances across date filters", () => {
    const entries: RawLedgerEntry[] = [
      // Deliberately out of order to verify chronological sorting
      makeEntry({
        id: "e3",
        createdAt: new Date("2026-10-05T08:00:00+04:00"),
        type: "FINE",
        debitBaisa: 10_000,
        description: "Speeding fine",
      }),
      makeEntry({
        id: "e1",
        createdAt: new Date("2026-10-01T10:00:00+04:00"),
        type: "RENT_CHARGE",
        debitBaisa: 50_000,
        description: "5-day rental",
      }),
      makeEntry({
        id: "e2",
        createdAt: new Date("2026-10-01T12:00:00+04:00"),
        type: "PAYMENT",
        paymentKind: "ADVANCE",
        creditBaisa: 20_000,
        description: "Advance payment",
      }),
      makeEntry({
        id: "e4",
        createdAt: new Date("2026-10-06T14:00:00+04:00"),
        type: "PAYMENT",
        paymentKind: "RECEIPT",
        creditBaisa: 45_000,
        description: "Final receipt",
      }),
      makeEntry({
        id: "e5",
        createdAt: new Date("2026-10-07T09:00:00+04:00"),
        type: "PAYBACK",
        paymentKind: "PAYBACK",
        debitBaisa: 5_000,
        description: "Overpayment refund payback",
      }),
    ];

    const full = buildRunningLedger(entries);
    expect(full.totalDebitBaisa).toBe(65_000);
    expect(full.totalCreditBaisa).toBe(65_000);
    expect(full.closingBalanceBaisa).toBe(0);
    expect(full.pageRows.map((r) => [r.id, r.runningBalanceBaisa])).toEqual([
      ["e1", 50_000],
      ["e2", 30_000],
      ["e3", 40_000],
      ["e4", -5_000],
      ["e5", 0],
    ]);

    // Filter starting 2026-10-05 Oman time: opening balance must be 30_000 (from e1 + e2)
    const { fromDate, toExclusiveDate } = parseOmanDateRange("2026-10-05", "2026-10-06");
    const filtered = buildRunningLedger(entries, { fromDate, toExclusiveDate });
    expect(filtered.openingBalanceBaisa).toBe(30_000);
    expect(filtered.periodDebitBaisa).toBe(10_000);
    expect(filtered.periodCreditBaisa).toBe(45_000);
    expect(filtered.periodClosingBalanceBaisa).toBe(-5_000);
    expect(filtered.filteredRows.map((r) => [r.id, r.runningBalanceBaisa])).toEqual([
      ["e3", 40_000],
      ["e4", -5_000],
    ]);
  });

  it("paginates at 15 per page while preserving cumulative running balance across pages", () => {
    expect(LEDGER_PAGE_SIZE).toBe(15);
    const entries: RawLedgerEntry[] = Array.from({ length: 20 }, (_, i) =>
      makeEntry({
        id: `entry-${String(i + 1).padStart(2, "0")}`,
        createdAt: new Date(Date.UTC(2026, 9, 1, i, 0, 0)),
        debitBaisa: 1_000,
        description: `Charge ${i + 1}`,
      }),
    );

    const page1 = buildRunningLedger(entries, { page: 1 });
    expect(page1.totalPages).toBe(2);
    expect(page1.pageRows).toHaveLength(15);
    expect(page1.pageRows[0]?.runningBalanceBaisa).toBe(1_000);
    expect(page1.pageRows[14]?.runningBalanceBaisa).toBe(15_000);

    const page2 = buildRunningLedger(entries, { page: 2 });
    expect(page2.page).toBe(2);
    expect(page2.pageRows).toHaveLength(5);
    expect(page2.pageRows[0]?.runningBalanceBaisa).toBe(16_000);
    expect(page2.pageRows[4]?.runningBalanceBaisa).toBe(20_000);
  });

  it("summarizes advances, receipts, invoices, fines, paybacks and balance status accurately", () => {
    const due = summarizeCustomerFinancials({
      totalDebitsBaisa: 120_000,
      totalCreditsBaisa: 75_000,
      payments: [
        { kind: "ADVANCE", amountBaisa: 25_000 },
        { kind: "RECEIPT", amountBaisa: 50_000 },
        { kind: "PAYBACK", amountBaisa: 5_000 },
        { kind: "REVERSAL", amountBaisa: 2_000 },
      ],
      invoices: [
        { status: "FINALIZED", grandTotalBaisa: 100_000, balanceBaisa: 45_000 },
        { status: "VOID", grandTotalBaisa: 999_000, balanceBaisa: 999_000 },
      ],
      fines: [{ amountBaisa: 15_000 }],
      extraCharges: [{ amountBaisa: 5_000 }],
    });

    expect(due.advancesBaisa).toBe(25_000);
    expect(due.receiptsBaisa).toBe(50_000);
    expect(due.paybacksBaisa).toBe(5_000);
    expect(due.reversalsBaisa).toBe(2_000);
    expect(due.invoicedBaisa).toBe(100_000);
    expect(due.activeInvoiceCount).toBe(1);
    expect(due.finesAndChargesBaisa).toBe(20_000);
    expect(due.outstandingBalanceBaisa).toBe(45_000);
    expect(due.balanceStatus).toBe("DUE");

    const credit = summarizeCustomerFinancials({
      totalDebitsBaisa: 20_000,
      totalCreditsBaisa: 30_000,
      payments: [],
      invoices: [],
      fines: [],
      extraCharges: [],
    });
    expect(credit.outstandingBalanceBaisa).toBe(-10_000);
    expect(credit.balanceStatus).toBe("CREDIT");
  });

  it("checks expiry dates using Oman calendar day (UTC+04:00)", () => {
    // 2026-11-23T21:00:00Z is already 2026-11-24 01:00 in Oman (UTC+04:00)
    const omanNextDay = new Date("2026-11-23T21:00:00Z");
    expect(isDateExpiredInOman("2026-11-23", omanNextDay)).toBe(true);
    expect(isDateExpiredInOman("2026-11-24", omanNextDay)).toBe(false);
    expect(isDateExpiredInOman(null, omanNextDay)).toBe(false);
  });
});
