export const LEDGER_PAGE_SIZE = 15;

export const LEDGER_FILTER_TYPES = [
  "ALL",
  "RENT_CHARGE",
  "DEPOSIT",
  "ADVANCE",
  "RECEIPT",
  "PAYBACK",
  "REVERSAL",
  "FINE",
  "LEGAL_FINE",
  "DAMAGE",
  "ADJUSTMENT",
] as const;

export type LedgerFilterType = (typeof LEDGER_FILTER_TYPES)[number];

export type RawLedgerEntry = {
  id: string;
  createdAt: Date;
  type:
    | "RENT_CHARGE"
    | "DEPOSIT"
    | "PAYMENT"
    | "PAYBACK"
    | "FINE"
    | "LEGAL_FINE"
    | "DAMAGE"
    | "ADJUSTMENT";
  paymentKind?: "ADVANCE" | "RECEIPT" | "PAYBACK" | "REVERSAL" | null;
  paymentMethod?: "CASH" | "CARD" | "BANK_TRANSFER" | "ONLINE" | null;
  rentalId: string | null;
  agreementNumber: string | null;
  paymentId: string | null;
  receiptNumber: string | null;
  branchName: string | null;
  description: string;
  debitBaisa: number;
  creditBaisa: number;
};

type ComputedLedgerEntry = RawLedgerEntry & {
  displayType: Exclude<LedgerFilterType, "ALL">;
  displayLabel: string;
  runningBalanceBaisa: number;
};

export function resolveLedgerDisplayType(
  ledgerType: RawLedgerEntry["type"],
  paymentKind?: RawLedgerEntry["paymentKind"],
): { code: Exclude<LedgerFilterType, "ALL">; label: string } {
  if (ledgerType === "PAYMENT") {
    if (paymentKind === "ADVANCE") return { code: "ADVANCE", label: "Advance" };
    return { code: "RECEIPT", label: "Receipt" };
  }
  if (ledgerType === "PAYBACK") {
    if (paymentKind === "REVERSAL") return { code: "REVERSAL", label: "Reversal" };
    return { code: "PAYBACK", label: "Payback" };
  }
  switch (ledgerType) {
    case "RENT_CHARGE":
      return { code: "RENT_CHARGE", label: "Rent Charge" };
    case "DEPOSIT":
      return { code: "DEPOSIT", label: "Deposit" };
    case "FINE":
      return { code: "FINE", label: "Fine" };
    case "LEGAL_FINE":
      return { code: "LEGAL_FINE", label: "Legal Fine" };
    case "DAMAGE":
      return { code: "DAMAGE", label: "Damage" };
    case "ADJUSTMENT":
      return { code: "ADJUSTMENT", label: "Adjustment" };
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseValidIsoDate(raw?: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!ISO_DATE_RE.test(trimmed)) return "";
  const [y, m, d] = trimmed.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return "";
  }
  return trimmed;
}

/**
 * Parses inclusive Oman calendar dates (YYYY-MM-DD, Asia/Muscat UTC+04:00) into UTC Date bounds.
 * `toExclusiveDate` is the start of the day AFTER `to` in Oman time.
 */
export function parseOmanDateRange(
  fromRaw?: string,
  toRaw?: string,
): {
  validFrom: string;
  validTo: string;
  fromDate?: Date;
  toExclusiveDate?: Date;
} {
  let validFrom = parseValidIsoDate(fromRaw);
  let validTo = parseValidIsoDate(toRaw);
  if (validFrom && validTo && validFrom > validTo) {
    [validFrom, validTo] = [validTo, validFrom];
  }
  const fromDate = validFrom ? new Date(`${validFrom}T00:00:00+04:00`) : undefined;
  let toExclusiveDate: Date | undefined;
  if (validTo) {
    const startOfTo = new Date(`${validTo}T00:00:00+04:00`);
    toExclusiveDate = new Date(startOfTo.getTime() + 86_400_000);
  }
  return { validFrom, validTo, fromDate, toExclusiveDate };
}

export function normalizeLedgerFilterType(raw?: string): LedgerFilterType {
  const candidate = (raw ?? "ALL").toUpperCase();
  return LEDGER_FILTER_TYPES.includes(candidate as LedgerFilterType)
    ? (candidate as LedgerFilterType)
    : "ALL";
}

export function buildRunningLedger(
  entries: readonly RawLedgerEntry[],
  options: {
    fromDate?: Date;
    toExclusiveDate?: Date;
    typeFilter?: LedgerFilterType;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const pageSize = Math.max(1, options.pageSize ?? LEDGER_PAGE_SIZE);
  const typeFilter = options.typeFilter ?? "ALL";

  const chronological = [...entries].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  let runningBalanceBaisa = 0;
  let totalDebitBaisa = 0;
  let totalCreditBaisa = 0;
  let openingBalanceBaisa = 0;

  const withRunning: ComputedLedgerEntry[] = [];
  for (const row of chronological) {
    const debit = Math.trunc(Number(row.debitBaisa) || 0);
    const credit = Math.trunc(Number(row.creditBaisa) || 0);
    totalDebitBaisa += debit;
    totalCreditBaisa += credit;
    runningBalanceBaisa += debit - credit;

    if (options.fromDate && row.createdAt < options.fromDate) {
      openingBalanceBaisa = runningBalanceBaisa;
    }

    const { code, label } = resolveLedgerDisplayType(row.type, row.paymentKind);
    withRunning.push({
      ...row,
      debitBaisa: debit,
      creditBaisa: credit,
      displayType: code,
      displayLabel: label,
      runningBalanceBaisa,
    });
  }

  const filteredRows = withRunning.filter((row) => {
    if (options.fromDate && row.createdAt < options.fromDate) return false;
    if (options.toExclusiveDate && row.createdAt >= options.toExclusiveDate) return false;
    if (typeFilter !== "ALL" && row.displayType !== typeFilter) return false;
    return true;
  });

  let periodDebitBaisa = 0;
  let periodCreditBaisa = 0;
  for (const row of filteredRows) {
    periodDebitBaisa += row.debitBaisa;
    periodCreditBaisa += row.creditBaisa;
  }

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(options.page ?? 1) || 1));
  const start = (page - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  const periodClosingBalanceBaisa = filteredRows.length
    ? filteredRows[filteredRows.length - 1].runningBalanceBaisa
    : openingBalanceBaisa;

  return {
    totalEntries: withRunning.length,
    totalDebitBaisa,
    totalCreditBaisa,
    closingBalanceBaisa: runningBalanceBaisa,
    openingBalanceBaisa,
    periodDebitBaisa,
    periodCreditBaisa,
    periodClosingBalanceBaisa,
    filteredRows,
    pageRows,
    totalFiltered,
    page,
    totalPages,
    pageSize,
  };
}

export function summarizeCustomerFinancials(input: {
  totalDebitsBaisa: number;
  totalCreditsBaisa: number;
  payments: readonly { kind: string; amountBaisa: number }[];
  invoices: readonly { status: string; grandTotalBaisa: number; balanceBaisa: number }[];
  fines: readonly { amountBaisa: number }[];
  extraCharges: readonly { amountBaisa: number }[];
}) {
  let advancesBaisa = 0;
  let advanceCount = 0;
  let receiptsBaisa = 0;
  let receiptCount = 0;
  let paybacksBaisa = 0;
  let paybackCount = 0;
  let reversalsBaisa = 0;
  let reversalCount = 0;

  for (const p of input.payments) {
    const amount = Math.trunc(Number(p.amountBaisa) || 0);
    if (p.kind === "ADVANCE") {
      advancesBaisa += amount;
      advanceCount += 1;
    } else if (p.kind === "RECEIPT") {
      receiptsBaisa += amount;
      receiptCount += 1;
    } else if (p.kind === "PAYBACK") {
      paybacksBaisa += amount;
      paybackCount += 1;
    } else if (p.kind === "REVERSAL") {
      reversalsBaisa += amount;
      reversalCount += 1;
    }
  }

  let invoicedBaisa = 0;
  let activeInvoiceCount = 0;
  for (const inv of input.invoices) {
    if (inv.status === "VOID") continue;
    invoicedBaisa += Math.trunc(Number(inv.grandTotalBaisa) || 0);
    activeInvoiceCount += 1;
  }

  const finesBaisa = input.fines.reduce(
    (sum, f) => sum + (Math.trunc(Number(f.amountBaisa)) || 0),
    0,
  );
  const extraChargesBaisa = input.extraCharges.reduce(
    (sum, c) => sum + (Math.trunc(Number(c.amountBaisa)) || 0),
    0,
  );

  const outstandingBalanceBaisa = input.totalDebitsBaisa - input.totalCreditsBaisa;

  return {
    advancesBaisa,
    advanceCount,
    receiptsBaisa,
    receiptCount,
    paybacksBaisa,
    paybackCount,
    reversalsBaisa,
    reversalCount,
    invoicedBaisa,
    activeInvoiceCount,
    finesBaisa,
    fineCount: input.fines.length,
    extraChargesBaisa,
    extraChargeCount: input.extraCharges.length,
    finesAndChargesBaisa: finesBaisa + extraChargesBaisa,
    totalDebitsBaisa: input.totalDebitsBaisa,
    totalCreditsBaisa: input.totalCreditsBaisa,
    outstandingBalanceBaisa,
    balanceStatus:
      outstandingBalanceBaisa > 0
        ? ("DUE" as const)
        : outstandingBalanceBaisa < 0
          ? ("CREDIT" as const)
          : ("SETTLED" as const),
  };
}

export function formatOmanDateTimeDisplay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Muscat",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isDateExpiredInOman(isoDate: string | null | undefined, now = new Date()): boolean {
  if (!isoDate || !ISO_DATE_RE.test(isoDate)) return false;
  const todayOman = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return isoDate < todayOman;
}
