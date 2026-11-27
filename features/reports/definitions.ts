import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
} from "@/features/daily-activity/calculations";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";

export const REPORTS_PAGE_SIZE = 15;
export const REPORT_EXPORT_MAX_ROWS = 10_000;
export const REPORT_PRINT_MAX_ROWS = 2_000;

export const REPORT_SLUGS = [
  "vehicle-list",
  "invoice-list",
  "agreement-list",
  "vehicle-income",
  "vehicle-expense",
  "customer-list",
  "receipt-list",
  "payment-list",
  "daily-activity",
  "service-report",
  "advance-collection",
  "blacklist-register",
] as const;

export type ReportSlug = (typeof REPORT_SLUGS)[number];

export const PAYMENT_MODES = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export type PaymentModeFilter = "ALL" | PaymentMode;

export type StatusOption = {
  value: string;
  label: string;
};

export type ReportDefinition = {
  slug: ReportSlug;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  supportsBranch: boolean;
  supportsStatus: boolean;
  statusLabel: string;
  statusOptions: readonly StatusOption[];
  supportsPaymentMode: boolean;
  supportsDateRange: boolean;
  dateRangeLabel: string;
  searchPlaceholder: string;
};

const ACTIVITY_CATEGORY_STATUS_OPTIONS: readonly StatusOption[] = ACTIVITY_CATEGORIES.filter(
  (c) => c !== "ALL",
).map((c) => ({
  value: c,
  label: ACTIVITY_CATEGORY_LABELS[c],
}));

export const REPORT_CATALOG: Record<ReportSlug, ReportDefinition> = {
  "vehicle-list": {
    slug: "vehicle-list",
    number: 1,
    title: "Vehicle List",
    shortTitle: "1. Vehicle List",
    description:
      "Complete fleet directory with registration, brand/model, branch, odometer, insurance/mulkiya expiry, daily rate, and operational status.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Vehicle Status",
    statusOptions: [
      { value: "AVAILABLE", label: "Available" },
      { value: "INACTIVE", label: "Inactive" },
    ],
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Added Date",
    searchPlaceholder: "Vehicle #, plate, brand, model, chassis, color…",
  },
  "invoice-list": {
    slug: "invoice-list",
    number: 2,
    title: "Invoice List",
    shortTitle: "2. Invoice List",
    description:
      "Issued rental invoices with subtotal, washing/petrol/discount adjustments, grand total, advance/received credits, balance due, and status.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Invoice Status",
    statusOptions: [
      { value: "DRAFT", label: "Draft" },
      { value: "FINALIZED", label: "Finalized" },
      { value: "VOID", label: "Void" },
    ],
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Invoice Date",
    searchPlaceholder: "Invoice #, agreement #, customer, vehicle, remarks…",
  },
  "agreement-list": {
    slug: "agreement-list",
    number: 3,
    title: "Agreement List",
    shortTitle: "3. Agreement List",
    description:
      "Rental agreements and reservations with customer, vehicle, branch, Oman rental period, category, security deposit, and agreement total.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Agreement Status",
    statusOptions: [
      { value: "RESERVED", label: "Reserved" },
      { value: "ACTIVE", label: "Active (On Rent)" },
      { value: "RETURNED", label: "Returned" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Rental Start Date",
    searchPlaceholder: "Agreement #, customer, mobile, vehicle, plate…",
  },
  "vehicle-income": {
    slug: "vehicle-income",
    number: 4,
    title: "Vehicle Income Report",
    shortTitle: "4. Vehicle Income",
    description:
      "Per-vehicle revenue performance summarizing bookings count, billed rent/charges, collected receipts & advances, paybacks, and net collected income in OMR.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Vehicle Status",
    statusOptions: [
      { value: "AVAILABLE", label: "Available" },
      { value: "INACTIVE", label: "Inactive" },
    ],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Booking / Payment Date",
    searchPlaceholder: "Vehicle #, plate, brand, model, branch…",
  },
  "vehicle-expense": {
    slug: "vehicle-expense",
    number: 5,
    title: "Vehicle Expense Report",
    shortTitle: "5. Vehicle Expense",
    description:
      "Recorded vehicle maintenance and service expenses with company vs. customer payer breakdown, vendor, payment mode, odometer, and OMR cost.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Expense Status",
    statusOptions: [
      { value: "COMPLETED", label: "Completed" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "SCHEDULED", label: "Scheduled" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Expense / Service Date",
    searchPlaceholder: "Vehicle #, plate, service type, vendor, note…",
  },
  "customer-list": {
    slug: "customer-list",
    number: 6,
    title: "Customer List",
    shortTitle: "6. Customer List",
    description:
      "Customer directory with contact details, driving licence & identity numbers, booking count, outstanding OMR balance, and active/blacklist status.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Customer Status",
    statusOptions: [
      { value: "ACTIVE", label: "Active" },
      { value: "INACTIVE", label: "Inactive" },
      { value: "BLACKLISTED", label: "Blacklisted" },
    ],
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Registration Date",
    searchPlaceholder: "Customer #, name, mobile, licence, Civil ID, passport…",
  },
  "receipt-list": {
    slug: "receipt-list",
    number: 7,
    title: "Receipt List",
    shortTitle: "7. Receipt List",
    description:
      "All payment receipts collected against rental agreements and customer accounts with receipt number, payment mode, branch, staff, and OMR amount.",
    supportsBranch: true,
    supportsStatus: false,
    statusLabel: "Status",
    statusOptions: [],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Receipt Date",
    searchPlaceholder: "Receipt #, agreement #, customer, reference, staff…",
  },
  "payment-list": {
    slug: "payment-list",
    number: 8,
    title: "Payment List",
    shortTitle: "8. Payment List",
    description:
      "Complete payment register covering advances, receipts, paybacks, and reversals with inflow/outflow direction, payment mode, and net OMR cash flow.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Payment Type",
    statusOptions: [
      { value: "ADVANCE", label: "Advance" },
      { value: "RECEIPT", label: "Receipt" },
      { value: "PAYBACK", label: "Payback" },
      { value: "REVERSAL", label: "Reversal" },
    ],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Transaction Date",
    searchPlaceholder: "Receipt #, agreement #, customer, reference, note…",
  },
  "daily-activity": {
    slug: "daily-activity",
    number: 9,
    title: "Daily Activity Report",
    shortTitle: "9. Daily Activity",
    description:
      "Chronological audit report of system mutations across branches, users, fleet, customers, bookings, rentals, finance, invoices, and services.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Activity Category",
    statusOptions: ACTIVITY_CATEGORY_STATUS_OPTIONS,
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Activity Date",
    searchPlaceholder: "Actor, branch, agreement, vehicle, customer, entity…",
  },
  "service-report": {
    slug: "service-report",
    number: 10,
    title: "Service Report",
    shortTitle: "10. Service Report",
    description:
      "Scheduled, in-progress, completed, and cancelled vehicle services with service type, responsible party, vendor, odometer reading, payment mode, and OMR cost.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Service Status",
    statusOptions: [
      { value: "SCHEDULED", label: "Scheduled" },
      { value: "IN_PROGRESS", label: "In Progress" },
      { value: "COMPLETED", label: "Completed" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Service Date",
    searchPlaceholder: "Vehicle #, plate, service type, vendor, staff…",
  },
  "advance-collection": {
    slug: "advance-collection",
    number: 11,
    title: "Advance Collection Report",
    shortTitle: "11. Advance Collection",
    description:
      "Down payments and advance receipts collected on bookings and rentals with payment mode breakdown, agreement status, branch, and total OMR collected.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Agreement Status",
    statusOptions: [
      { value: "RESERVED", label: "Reserved" },
      { value: "ACTIVE", label: "Active (On Rent)" },
      { value: "RETURNED", label: "Returned" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    supportsPaymentMode: true,
    supportsDateRange: true,
    dateRangeLabel: "Collection Date",
    searchPlaceholder: "Receipt #, agreement #, customer, reference, staff…",
  },
  "blacklist-register": {
    slug: "blacklist-register",
    number: 12,
    title: "Blacklist Register",
    shortTitle: "12. Blacklist Register",
    description:
      "Complete register of active and historical customer blacklist records with reason, description, effective period, recording user, and current status.",
    supportsBranch: true,
    supportsStatus: true,
    statusLabel: "Blacklist Status",
    statusOptions: [
      { value: "ACTIVE", label: "Currently Blacklisted" },
      { value: "REMOVED", label: "Removed / Historical" },
    ],
    supportsPaymentMode: false,
    supportsDateRange: true,
    dateRangeLabel: "Recorded Date",
    searchPlaceholder: "Customer #, name, mobile, licence, reason, description…",
  },
};

export const REPORT_LIST: readonly ReportDefinition[] = REPORT_SLUGS.map(
  (slug) => REPORT_CATALOG[slug],
);

export type ReportBadgeTone = "emerald" | "sky" | "amber" | "red" | "violet" | "neutral";

export type ReportColumn = {
  key: string;
  label: string;
  align?: "start" | "center" | "end";
  mono?: boolean;
};

export type ReportCell = {
  text: string;
  subtext?: string;
  badgeTone?: ReportBadgeTone;
  href?: string | null;
  csvValue?: string;
};

export type ReportRow = {
  id: string;
  cells: Record<string, ReportCell>;
};

export type ReportSummaryCard = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "accent" | "emerald" | "amber" | "red";
};

export function normalizeReportSlug(raw?: string): ReportSlug {
  const candidate = (raw ?? "").trim().toLowerCase();
  if ((REPORT_SLUGS as readonly string[]).includes(candidate)) {
    return candidate as ReportSlug;
  }
  return "vehicle-list";
}

export function normalizeReportStatus(slug: ReportSlug, raw?: string): string {
  const def = REPORT_CATALOG[slug];
  if (!def.supportsStatus) return "ALL";
  const candidate = (raw ?? "ALL").trim().toUpperCase();
  if (!candidate || candidate === "ALL") return "ALL";
  return def.statusOptions.some((opt) => opt.value === candidate) ? candidate : "ALL";
}

export function normalizePaymentMode(raw?: string): PaymentModeFilter {
  const candidate = (raw ?? "ALL").trim().toUpperCase();
  if ((PAYMENT_MODES as readonly string[]).includes(candidate)) {
    return candidate as PaymentMode;
  }
  return "ALL";
}

export function formatPaymentModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  switch (mode) {
    case "BANK_TRANSFER":
      return "Bank Transfer";
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card";
    case "ONLINE":
      return "Online";
    default:
      return mode.replaceAll("_", " ");
  }
}

export function paginateReportRows<T>(
  rows: readonly T[],
  requestedPage = 1,
  pageSize = REPORTS_PAGE_SIZE,
): {
  pageRows: T[];
  totalRows: number;
  page: number;
  totalPages: number;
  pageSize: number;
} {
  const safeSize = Math.max(1, Math.trunc(pageSize) || REPORTS_PAGE_SIZE);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / safeSize));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage) || 1));
  const start = (page - 1) * safeSize;
  return {
    pageRows: rows.slice(start, start + safeSize),
    totalRows,
    page,
    totalPages,
    pageSize: safeSize,
  };
}

/**
 * Escapes a CSV value according to RFC 4180 and neutralizes spreadsheet
 * formula injection (OWASP CSV Injection) for leading =, +, @, tab, CR,
 * or non-numeric leading -.
 */
export function escapeCsvCell(raw: string): string {
  let value = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const leadingTrimmed = value.trimStart();
  const isNegativeNumber = /^-\d+(\.\d+)?$/.test(leadingTrimmed);
  if (
    /^[=+@|\t\n]/.test(value) ||
    /^[=+@|]/.test(leadingTrimmed) ||
    (leadingTrimmed.startsWith("-") && !isNegativeNumber)
  ) {
    value = `'${value}`;
  }
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function serializeReportCsv(
  columns: readonly ReportColumn[],
  rows: readonly ReportRow[],
): string {
  const headerLine = columns.map((col) => escapeCsvCell(col.label)).join(",");
  const dataLines = rows.map((row) =>
    columns
      .map((col) => {
        const cell = row.cells[col.key];
        const value = cell?.csvValue ?? cell?.text ?? "";
        return escapeCsvCell(value);
      })
      .join(","),
  );
  // UTF-8 BOM ensures Microsoft Excel renders Arabic text and OMR currency cleanly.
  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}\r\n`;
}

export function formatReportCsvFilename(slug: ReportSlug, now = new Date()): string {
  const omanDate = formatOmanDateTime(now).slice(0, 10);
  return `muscat-cars-${slug}-${omanDate}.csv`;
}
