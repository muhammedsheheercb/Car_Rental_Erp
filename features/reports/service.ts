import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditLogs,
  branches,
  customerBlacklist,
  customerLedger,
  customers,
  invoices,
  paymentCorrections,
  payments,
  rentals,
  roles,
  serviceExpenses,
  userBranches,
  userRoles,
  users,
  vehicleBrands,
  vehicleInsurance,
  vehicleModels,
  vehiclePricing,
  vehicleRegistrations,
  vehicleServices,
  vehicles,
} from "@/db/schema";
import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_EVENT_META,
  allowedActivityEventsForActor,
  formatActivitySummary,
  formatEntityTypeLabel,
  resolveActivityHref,
  resolveActivityScopeMode,
  resolveEffectiveActivityEvent,
  resolveFilteredActivityEvents,
} from "@/features/daily-activity/calculations";
import { formatOmanDateTimeDisplay, parseOmanDateRange } from "@/features/ledger/calculations";
import { formatOMR } from "@/features/rentals/calculations";
import { can, type Identity } from "@/lib/auth";
import {
  formatPaymentModeLabel,
  normalizePaymentMode,
  normalizeReportSlug,
  normalizeReportStatus,
  type PaymentModeFilter,
  paginateReportRows,
  REPORT_CATALOG,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_PRINT_MAX_ROWS,
  REPORTS_PAGE_SIZE,
  type ReportBadgeTone,
  type ReportColumn,
  type ReportDefinition,
  type ReportRow,
  type ReportSlug,
  type ReportSummaryCard,
} from "./definitions";

const uuidSchema = z.string().uuid();

const effectiveEventSql = sql<string>`CASE
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED'
    AND ${auditLogs.metadata}->>'action' IN ('BLACKLIST_CREATED','BLACKLIST_UPDATED','BLACKLIST_REMOVED','BOOKING_UPDATED','BOOKING_DELETED')
    THEN ${auditLogs.metadata}->>'action'
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED' AND ${auditLogs.entityType} = 'customer'
    THEN CASE WHEN ${auditLogs.metadata}->>'active' = 'false' THEN 'CUSTOMER_DEACTIVATED' ELSE 'CUSTOMER_UPDATED' END
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED' AND ${auditLogs.entityType} = 'customer_blacklist'
    THEN 'BLACKLIST_UPDATED'
  ELSE ${auditLogs.event}::text
END`;

type ReportFiltersInput = {
  report?: string;
  q?: string;
  branchId?: string;
  status?: string;
  paymentMode?: string;
  from?: string;
  to?: string;
  page?: number;
};

type ReportMode = "page" | "print" | "export";

type ReportQueryContext = {
  actor: Identity;
  locale: string;
  isSuper: boolean;
  permittedBranchIds: string[];
  branchId: string;
  status: string;
  paymentMode: PaymentModeFilter;
  q: string;
  fromDate?: Date;
  toExclusiveDate?: Date;
};

type BuiltReportData = {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryCard[];
};

type LoadedReport = {
  definition: ReportDefinition;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryCard[];
  totalRows: number;
  page: number;
  totalPages: number;
  pageSize: number;
  truncated: boolean;
  branches: { id: string; name: string; code: string }[];
  filters: {
    report: ReportSlug;
    q: string;
    branchId: string;
    status: string;
    paymentMode: PaymentModeFilter;
    from: string;
    to: string;
  };
};

function rentalStatusTone(status: string): ReportBadgeTone {
  switch (status) {
    case "ACTIVE":
      return "emerald";
    case "RESERVED":
      return "amber";
    case "RETURNED":
      return "sky";
    case "CANCELLED":
      return "red";
    default:
      return "neutral";
  }
}

function invoiceStatusTone(status: string): ReportBadgeTone {
  switch (status) {
    case "FINALIZED":
      return "emerald";
    case "DRAFT":
      return "amber";
    case "VOID":
      return "red";
    default:
      return "neutral";
  }
}

function serviceStatusTone(status: string): ReportBadgeTone {
  switch (status) {
    case "COMPLETED":
      return "emerald";
    case "IN_PROGRESS":
      return "sky";
    case "SCHEDULED":
      return "amber";
    case "CANCELLED":
      return "red";
    default:
      return "neutral";
  }
}

function paymentKindTone(kind: string): ReportBadgeTone {
  switch (kind) {
    case "ADVANCE":
    case "RECEIPT":
      return "emerald";
    case "PAYBACK":
      return "amber";
    case "REVERSAL":
      return "red";
    default:
      return "neutral";
  }
}

function matchesSearch(
  q: string,
  fields: readonly (string | number | null | undefined)[],
): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some(
    (f) => f !== null && f !== undefined && String(f).toLowerCase().includes(needle),
  );
}

function baisaToNumber(value: number | string | null | undefined): number {
  return Math.trunc(Number(value) || 0);
}

/** 1. Vehicle List */
async function buildVehicleListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(vehicles.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(vehicles.branchId, ctx.branchId));
  if (ctx.status === "AVAILABLE") {
    conditions.push(and(eq(vehicles.isActive, true), eq(vehicles.status, "AVAILABLE")) as SQL);
  } else if (ctx.status === "INACTIVE") {
    conditions.push(eq(vehicles.isActive, false));
  }
  if (ctx.fromDate) conditions.push(gte(vehicles.createdAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(vehicles.createdAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      year: vehicles.year,
      color: vehicles.color,
      fuelType: vehicles.fuelType,
      gearbox: vehicles.gearbox,
      chassisNumber: vehicles.chassisNumber,
      currentOdometerKm: vehicles.currentOdometerKm,
      status: vehicles.status,
      isActive: vehicles.isActive,
      purchaseDate: vehicles.purchaseDate,
      brandName: vehicleBrands.name,
      modelName: vehicleModels.name,
      branchName: branches.name,
      branchCode: branches.code,
      insuranceValidUntil: vehicleInsurance.validUntil,
      mulkiyaExpiryDate: vehicleRegistrations.mulkiyaExpiryDate,
      dailyRateBaisa: vehiclePricing.listRentBaisa,
    })
    .from(vehicles)
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .innerJoin(branches, eq(branches.id, vehicles.branchId))
    .leftJoin(vehicleInsurance, eq(vehicleInsurance.vehicleId, vehicles.id))
    .leftJoin(vehicleRegistrations, eq(vehicleRegistrations.vehicleId, vehicles.id))
    .leftJoin(
      vehiclePricing,
      and(eq(vehiclePricing.vehicleId, vehicles.id), eq(vehiclePricing.period, "DAILY")),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(vehicles.vehicleNumber));

  const filtered = raw.filter((v) =>
    matchesSearch(ctx.q, [
      v.vehicleNumber,
      v.registrationNumber,
      v.brandName,
      v.modelName,
      v.color,
      v.chassisNumber,
      v.branchName,
      v.branchCode,
      v.fuelType,
    ]),
  );

  let availableCount = 0;
  let inactiveCount = 0;
  let totalDailyRate = 0;
  let rateCount = 0;

  for (const v of filtered) {
    if (v.isActive && v.status === "AVAILABLE") availableCount += 1;
    else if (!v.isActive) inactiveCount += 1;
    const rate = baisaToNumber(v.dailyRateBaisa);
    if (rate > 0) {
      totalDailyRate += rate;
      rateCount += 1;
    }
  }
  const avgDailyBaisa = rateCount ? Math.round(totalDailyRate / rateCount) : 0;
  const canFleet = can(ctx.actor, "fleet", "read");

  const columns: ReportColumn[] = [
    { key: "vehicle", label: "Vehicle / Plate", mono: true },
    { key: "model", label: "Brand & Model" },
    { key: "branch", label: "Branch" },
    { key: "odometer", label: "Odometer (km)", align: "end", mono: true },
    { key: "docs", label: "Insurance / Mulkiya", mono: true },
    { key: "dailyRate", label: "Daily Rate", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((v) => {
    const rate = baisaToNumber(v.dailyRateBaisa);
    return {
      id: v.id,
      cells: {
        vehicle: {
          text: v.vehicleNumber,
          subtext: v.registrationNumber,
          href: canFleet ? `/${ctx.locale}/fleet` : null,
          csvValue: `${v.vehicleNumber} (${v.registrationNumber})`,
        },
        model: {
          text: `${v.brandName} ${v.modelName}`,
          subtext: `${v.year} · ${v.color} · ${v.gearbox}`,
          csvValue: `${v.brandName} ${v.modelName} (${v.year}, ${v.color})`,
        },
        branch: {
          text: v.branchName,
          subtext: v.branchCode,
          csvValue: `${v.branchName} (${v.branchCode})`,
        },
        odometer: {
          text: v.currentOdometerKm.toLocaleString("en-US"),
          csvValue: String(v.currentOdometerKm),
        },
        docs: {
          text: `Ins: ${v.insuranceValidUntil ?? "—"}`,
          subtext: `Mulk: ${v.mulkiyaExpiryDate ?? "—"}`,
          csvValue: `Ins: ${v.insuranceValidUntil ?? "—"} / Mulkiya: ${v.mulkiyaExpiryDate ?? "—"}`,
        },
        dailyRate: {
          text: rate > 0 ? formatOMR(rate) : "—",
          csvValue: rate > 0 ? formatOMR(rate) : "0.000",
        },
        status: {
          text: !v.isActive ? "INACTIVE" : v.status === "AVAILABLE" ? "AVAILABLE" : "ON RENT",
          badgeTone: !v.isActive ? "neutral" : v.status === "AVAILABLE" ? "emerald" : "amber",
        },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      { label: "Total Vehicles", value: String(filtered.length), detail: "Matching fleet records" },
      {
        label: "Available",
        value: String(availableCount),
        detail: "Active fleet units",
        tone: "emerald",
      },
      {
        label: "Inactive",
        value: String(inactiveCount),
        detail: "Deactivated fleet units",
      },
      {
        label: "Avg Daily Rate",
        value: formatOMR(avgDailyBaisa),
        detail: "Configured daily list rate",
        tone: "accent",
      },
    ],
  };
}

/** 2. Invoice List */
async function buildInvoiceListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(invoices.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(invoices.branchId, ctx.branchId));
  if (ctx.status !== "ALL") {
    conditions.push(eq(invoices.status, ctx.status as "DRAFT" | "FINALIZED" | "VOID"));
  }
  if (ctx.fromDate) conditions.push(gte(invoices.createdAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(invoices.createdAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      subtotalBaisa: invoices.subtotalBaisa,
      washingBaisa: invoices.washingBaisa,
      petrolBaisa: invoices.petrolBaisa,
      discountBaisa: invoices.discountBaisa,
      grandTotalBaisa: invoices.grandTotalBaisa,
      advanceBaisa: invoices.advanceBaisa,
      receivedBaisa: invoices.receivedBaisa,
      balanceBaisa: invoices.balanceBaisa,
      remarks: invoices.remarks,
      createdAt: invoices.createdAt,
      rentalId: rentals.id,
      agreementNumber: rentals.agreementNumber,
      customerId: customers.id,
      customerName: customers.name,
      customerNumber: customers.customerNumber,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(invoices)
    .innerJoin(rentals, eq(rentals.id, invoices.rentalId))
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .innerJoin(branches, eq(branches.id, invoices.branchId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(invoices.createdAt), desc(invoices.id));

  const filtered = raw.filter((inv) =>
    matchesSearch(ctx.q, [
      inv.invoiceNumber,
      inv.agreementNumber,
      inv.customerName,
      inv.customerNumber,
      inv.vehicleNumber,
      inv.registrationNumber,
      inv.branchName,
      inv.remarks,
    ]),
  );

  let activeGrandTotal = 0;
  let activeCollected = 0;
  let activeBalance = 0;
  let voidCount = 0;

  for (const inv of filtered) {
    if (inv.status === "VOID") {
      voidCount += 1;
      continue;
    }
    if (ctx.status !== "DRAFT" && inv.status === "DRAFT") continue;
    activeGrandTotal += baisaToNumber(inv.grandTotalBaisa);
    activeCollected += baisaToNumber(inv.advanceBaisa) + baisaToNumber(inv.receivedBaisa);
    activeBalance += baisaToNumber(inv.balanceBaisa);
  }

  const canFinance = can(ctx.actor, "finance", "read");
  const canRentals = can(ctx.actor, "rentals", "read");

  const columns: ReportColumn[] = [
    { key: "invoice", label: "Invoice # / Date", mono: true },
    { key: "agreement", label: "Agreement / Vehicle", mono: true },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "subtotal", label: "Subtotal", align: "end", mono: true },
    { key: "grandTotal", label: "Grand Total", align: "end", mono: true },
    { key: "paid", label: "Advance + Recv", align: "end", mono: true },
    { key: "balance", label: "Balance Due", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((inv) => {
    const subtotal = baisaToNumber(inv.subtotalBaisa);
    const grandTotal = baisaToNumber(inv.grandTotalBaisa);
    const paid = baisaToNumber(inv.advanceBaisa) + baisaToNumber(inv.receivedBaisa);
    const balance = baisaToNumber(inv.balanceBaisa);
    return {
      id: inv.id,
      cells: {
        invoice: {
          text: inv.invoiceNumber,
          subtext: formatOmanDateTimeDisplay(inv.createdAt),
          href: canFinance ? `/${ctx.locale}/invoices/${inv.id}` : null,
          csvValue: `${inv.invoiceNumber} (${formatOmanDateTimeDisplay(inv.createdAt)})`,
        },
        agreement: {
          text: inv.agreementNumber,
          subtext: `${inv.vehicleNumber} · ${inv.registrationNumber}`,
          href: canRentals ? `/${ctx.locale}/rentals/${inv.rentalId}` : null,
          csvValue: `${inv.agreementNumber} (${inv.registrationNumber})`,
        },
        customer: {
          text: inv.customerName,
          subtext: inv.customerNumber,
          csvValue: `${inv.customerName} (${inv.customerNumber})`,
        },
        branch: {
          text: inv.branchName,
          subtext: inv.branchCode,
          csvValue: inv.branchName,
        },
        subtotal: { text: formatOMR(subtotal) },
        grandTotal: { text: formatOMR(grandTotal) },
        paid: { text: formatOMR(paid) },
        balance: { text: formatOMR(balance) },
        status: { text: inv.status, badgeTone: invoiceStatusTone(inv.status) },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Invoices",
        value: String(filtered.length),
        detail: voidCount
          ? `${voidCount} void excluded from OMR totals`
          : "All active/draft invoices",
      },
      {
        label: "Active Grand Total",
        value: formatOMR(activeGrandTotal),
        detail: "Non-void invoiced total",
        tone: "accent",
      },
      {
        label: "Total Collected",
        value: formatOMR(activeCollected),
        detail: "Advances + invoice receipts",
        tone: "emerald",
      },
      {
        label: "Total Balance Due",
        value: formatOMR(activeBalance),
        detail: "Remaining invoice balance",
        tone: activeBalance > 0 ? "amber" : "emerald",
      },
    ],
  };
}

/** 3. Agreement List */
async function buildAgreementListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(rentals.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(rentals.branchId, ctx.branchId));
  if (ctx.status !== "ALL") {
    conditions.push(
      eq(rentals.status, ctx.status as "RESERVED" | "ACTIVE" | "RETURNED" | "CANCELLED"),
    );
  }
  if (ctx.fromDate) conditions.push(gte(rentals.startsAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(rentals.startsAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: rentals.id,
      agreementNumber: rentals.agreementNumber,
      status: rentals.status,
      pricingPeriod: rentals.pricingPeriod,
      rentDuration: rentals.rentDuration,
      startsAt: rentals.startsAt,
      expectedReturnAt: rentals.expectedReturnAt,
      actualReturnAt: rentals.actualReturnAt,
      depositBaisa: rentals.depositBaisa,
      totalBaisa: rentals.totalBaisa,
      customerId: customers.id,
      customerName: customers.name,
      customerMobile: customers.mobile,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      brandName: vehicleBrands.name,
      modelName: vehicleModels.name,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(rentals)
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .innerJoin(branches, eq(branches.id, rentals.branchId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(rentals.startsAt), desc(rentals.id));

  const filtered = raw.filter((r) =>
    matchesSearch(ctx.q, [
      r.agreementNumber,
      r.customerName,
      r.customerMobile,
      r.vehicleNumber,
      r.registrationNumber,
      r.brandName,
      r.modelName,
      r.branchName,
    ]),
  );

  let activeOrReserved = 0;
  let returnedCount = 0;
  let cancelledCount = 0;
  let totalValueBaisa = 0;
  let totalDepositBaisa = 0;

  for (const r of filtered) {
    if (r.status === "ACTIVE" || r.status === "RESERVED") activeOrReserved += 1;
    else if (r.status === "RETURNED") returnedCount += 1;
    else if (r.status === "CANCELLED") cancelledCount += 1;
    if (r.status !== "CANCELLED") {
      totalValueBaisa += baisaToNumber(r.totalBaisa);
      totalDepositBaisa += baisaToNumber(r.depositBaisa);
    }
  }

  const canRentals = can(ctx.actor, "rentals", "read");

  const columns: ReportColumn[] = [
    { key: "agreement", label: "Agreement # / Type", mono: true },
    { key: "customer", label: "Customer" },
    { key: "vehicle", label: "Vehicle / Plate" },
    { key: "branch", label: "Branch" },
    { key: "period", label: "Period (Oman)", mono: true },
    { key: "deposit", label: "Deposit", align: "end", mono: true },
    { key: "total", label: "Agreement Total", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((r) => {
    const endAt = r.actualReturnAt ?? r.expectedReturnAt;
    return {
      id: r.id,
      cells: {
        agreement: {
          text: r.agreementNumber,
          subtext: `${r.pricingPeriod} × ${r.rentDuration}`,
          href: canRentals ? `/${ctx.locale}/rentals/${r.id}` : null,
          csvValue: `${r.agreementNumber} (${r.pricingPeriod} x ${r.rentDuration})`,
        },
        customer: {
          text: r.customerName,
          subtext: r.customerMobile,
          csvValue: `${r.customerName} (${r.customerMobile})`,
        },
        vehicle: {
          text: `${r.brandName} ${r.modelName}`,
          subtext: `${r.vehicleNumber} · ${r.registrationNumber}`,
          csvValue: `${r.brandName} ${r.modelName} (${r.vehicleNumber} / ${r.registrationNumber})`,
        },
        branch: {
          text: r.branchName,
          subtext: r.branchCode,
          csvValue: r.branchName,
        },
        period: {
          text: formatOmanDateTimeDisplay(r.startsAt),
          subtext: `${r.actualReturnAt ? "Ret" : "Due"}: ${formatOmanDateTimeDisplay(endAt)}`,
          csvValue: `${formatOmanDateTimeDisplay(r.startsAt)} to ${formatOmanDateTimeDisplay(endAt)}`,
        },
        deposit: { text: formatOMR(baisaToNumber(r.depositBaisa)) },
        total: { text: formatOMR(baisaToNumber(r.totalBaisa)) },
        status: { text: r.status, badgeTone: rentalStatusTone(r.status) },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Agreements",
        value: String(filtered.length),
        detail: "Matching bookings & rentals",
      },
      {
        label: "Active / Reserved",
        value: String(activeOrReserved),
        detail: `${returnedCount} returned · ${cancelledCount} cancelled`,
        tone: "emerald",
      },
      {
        label: "Security Deposits",
        value: formatOMR(totalDepositBaisa),
        detail: "Non-cancelled agreements",
      },
      {
        label: "Total Agreement Value",
        value: formatOMR(totalValueBaisa),
        detail: "Excluding cancelled agreements",
        tone: "accent",
      },
    ],
  };
}

/** 4. Vehicle Income Report */
async function buildVehicleIncomeReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const vehicleConds: SQL[] = [];
  if (!ctx.isSuper) {
    vehicleConds.push(
      ctx.permittedBranchIds.length
        ? inArray(vehicles.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) vehicleConds.push(eq(vehicles.branchId, ctx.branchId));
  if (ctx.status !== "ALL") {
    vehicleConds.push(eq(vehicles.status, ctx.status as "AVAILABLE" | "INACTIVE"));
  }

  const vehicleRows = await db
    .select({
      id: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      status: vehicles.status,
      brandName: vehicleBrands.name,
      modelName: vehicleModels.name,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(vehicles)
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .innerJoin(branches, eq(branches.id, vehicles.branchId))
    .where(vehicleConds.length ? and(...vehicleConds) : undefined)
    .orderBy(asc(vehicles.vehicleNumber));

  const filteredVehicles = vehicleRows.filter((v) =>
    matchesSearch(ctx.q, [
      v.vehicleNumber,
      v.registrationNumber,
      v.brandName,
      v.modelName,
      v.branchName,
      v.branchCode,
    ]),
  );

  const vehicleIds = filteredVehicles.map((v) => v.id);

  const rentalConds: SQL[] = [];
  if (vehicleIds.length) rentalConds.push(inArray(rentals.vehicleId, vehicleIds));
  if (!ctx.isSuper) {
    rentalConds.push(
      ctx.permittedBranchIds.length
        ? inArray(rentals.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) rentalConds.push(eq(rentals.branchId, ctx.branchId));
  if (ctx.fromDate) rentalConds.push(gte(rentals.startsAt, ctx.fromDate));
  if (ctx.toExclusiveDate) rentalConds.push(lt(rentals.startsAt, ctx.toExclusiveDate));

  const paymentConds: SQL[] = [];
  if (vehicleIds.length) paymentConds.push(inArray(rentals.vehicleId, vehicleIds));
  if (!ctx.isSuper) {
    paymentConds.push(
      ctx.permittedBranchIds.length
        ? inArray(payments.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) paymentConds.push(eq(payments.branchId, ctx.branchId));
  if (ctx.paymentMode !== "ALL") paymentConds.push(eq(payments.method, ctx.paymentMode));
  if (ctx.fromDate) paymentConds.push(gte(payments.receivedAt, ctx.fromDate));
  if (ctx.toExclusiveDate) paymentConds.push(lt(payments.receivedAt, ctx.toExclusiveDate));

  const [rentalRows, paymentRows] = vehicleIds.length
    ? await Promise.all([
        db
          .select({
            vehicleId: rentals.vehicleId,
            status: rentals.status,
            totalBaisa: rentals.totalBaisa,
          })
          .from(rentals)
          .where(and(...rentalConds)),
        db
          .select({
            vehicleId: rentals.vehicleId,
            direction: payments.direction,
            amountBaisa: payments.amountBaisa,
          })
          .from(payments)
          .innerJoin(rentals, eq(rentals.id, payments.rentalId))
          .where(and(...paymentConds)),
      ])
    : [[], []];

  const statsMap = new Map<
    string,
    { bookings: number; billedBaisa: number; collectedBaisa: number; paybacksBaisa: number }
  >();
  for (const v of filteredVehicles) {
    statsMap.set(v.id, { bookings: 0, billedBaisa: 0, collectedBaisa: 0, paybacksBaisa: 0 });
  }
  for (const r of rentalRows) {
    if (r.status === "CANCELLED") continue;
    const entry = statsMap.get(r.vehicleId);
    if (!entry) continue;
    entry.bookings += 1;
    entry.billedBaisa += baisaToNumber(r.totalBaisa);
  }
  for (const p of paymentRows) {
    const entry = statsMap.get(p.vehicleId);
    if (!entry) continue;
    const amount = baisaToNumber(p.amountBaisa);
    if (p.direction === "RECEIPT") entry.collectedBaisa += amount;
    else entry.paybacksBaisa += amount;
  }

  const enriched = filteredVehicles
    .map((v) => {
      const s = statsMap.get(v.id) ?? {
        bookings: 0,
        billedBaisa: 0,
        collectedBaisa: 0,
        paybacksBaisa: 0,
      };
      return { ...v, ...s, netIncomeBaisa: s.collectedBaisa - s.paybacksBaisa };
    })
    .sort((a, b) => {
      if (b.netIncomeBaisa !== a.netIncomeBaisa) return b.netIncomeBaisa - a.netIncomeBaisa;
      if (b.billedBaisa !== a.billedBaisa) return b.billedBaisa - a.billedBaisa;
      return a.vehicleNumber.localeCompare(b.vehicleNumber);
    });

  let totalBookings = 0;
  let totalBilled = 0;
  let totalCollected = 0;
  let totalPaybacks = 0;
  for (const row of enriched) {
    totalBookings += row.bookings;
    totalBilled += row.billedBaisa;
    totalCollected += row.collectedBaisa;
    totalPaybacks += row.paybacksBaisa;
  }
  const totalNet = totalCollected - totalPaybacks;

  const columns: ReportColumn[] = [
    { key: "vehicle", label: "Vehicle / Plate", mono: true },
    { key: "model", label: "Brand & Model" },
    { key: "branch", label: "Branch" },
    { key: "bookings", label: "Bookings", align: "end", mono: true },
    { key: "billed", label: "Billed Total", align: "end", mono: true },
    { key: "collected", label: "Receipts & Adv.", align: "end", mono: true },
    { key: "paybacks", label: "Paybacks / Rev.", align: "end", mono: true },
    { key: "netIncome", label: "Net Collected", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = enriched.map((v) => ({
    id: v.id,
    cells: {
      vehicle: {
        text: v.vehicleNumber,
        subtext: v.registrationNumber,
        csvValue: `${v.vehicleNumber} (${v.registrationNumber})`,
      },
      model: { text: `${v.brandName} ${v.modelName}` },
      branch: { text: v.branchName, subtext: v.branchCode, csvValue: v.branchName },
      bookings: { text: String(v.bookings) },
      billed: { text: formatOMR(v.billedBaisa) },
      collected: { text: formatOMR(v.collectedBaisa) },
      paybacks: { text: formatOMR(v.paybacksBaisa) },
      netIncome: { text: formatOMR(v.netIncomeBaisa) },
      status: {
        text: v.status,
        badgeTone: v.status === "AVAILABLE" ? "emerald" : "neutral",
      },
    },
  }));

  return {
    columns,
    rows,
    summary: [
      {
        label: "Vehicles Reported",
        value: String(enriched.length),
        detail: `${totalBookings} non-cancelled bookings`,
      },
      { label: "Total Billed", value: formatOMR(totalBilled), detail: "Agreement rent & charges" },
      {
        label: "Gross Collected",
        value: formatOMR(totalCollected),
        detail: `Paybacks/reversals: ${formatOMR(totalPaybacks)}`,
      },
      {
        label: "Net Vehicle Income",
        value: formatOMR(totalNet),
        detail:
          ctx.paymentMode !== "ALL"
            ? `Mode: ${formatPaymentModeLabel(ctx.paymentMode)}`
            : "Receipts & advances less paybacks",
        tone: "emerald",
      },
    ],
  };
}

/** 5. Vehicle Expense Report */
async function buildVehicleExpenseReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const effectiveBranch = sql<string>`COALESCE(${vehicleServices.branchId}, ${vehicles.branchId})`;
  const effectiveDate = sql<Date>`COALESCE(${vehicleServices.completedAt}, ${serviceExpenses.createdAt}, ${vehicleServices.createdAt})`;
  const effectiveMode = sql<
    string | null
  >`COALESCE(${serviceExpenses.paymentMode}, ${vehicleServices.paymentMode})`;

  const conditions: SQL[] = [
    sql`(${serviceExpenses.id} IS NOT NULL OR ${vehicleServices.costBaisa} > 0)`,
  ];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? sql`${effectiveBranch} IN (${sql.join(
            ctx.permittedBranchIds.map((b) => sql`${b}`),
            sql`, `,
          )})`
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(sql`${effectiveBranch} = ${ctx.branchId}`);
  if (ctx.status !== "ALL") {
    conditions.push(
      eq(
        vehicleServices.status,
        ctx.status as "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
      ),
    );
  }
  if (ctx.paymentMode !== "ALL") {
    conditions.push(sql`${effectiveMode} = ${ctx.paymentMode}`);
  }
  if (ctx.fromDate) conditions.push(sql`${effectiveDate} >= ${ctx.fromDate}`);
  if (ctx.toExclusiveDate) conditions.push(sql`${effectiveDate} < ${ctx.toExclusiveDate}`);

  const raw = await db
    .select({
      id: vehicleServices.id,
      status: vehicleServices.status,
      serviceType: vehicleServices.type,
      serviceBy: vehicleServices.serviceBy,
      vendor: vehicleServices.vendor,
      note: vehicleServices.note,
      odometerKm: vehicleServices.serviceOdometerKm,
      kmReading: vehicleServices.kmReading,
      serviceCostBaisa: vehicleServices.costBaisa,
      servicePaymentMode: vehicleServices.paymentMode,
      completedAt: vehicleServices.completedAt,
      createdAt: vehicleServices.createdAt,
      expenseAmountBaisa: serviceExpenses.amountBaisa,
      expensePaidBy: serviceExpenses.paidBy,
      expensePaymentMode: serviceExpenses.paymentMode,
      expenseCreatedAt: serviceExpenses.createdAt,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      brandName: vehicleBrands.name,
      modelName: vehicleModels.name,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(vehicleServices)
    .innerJoin(vehicles, eq(vehicles.id, vehicleServices.vehicleId))
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .leftJoin(serviceExpenses, eq(serviceExpenses.serviceId, vehicleServices.id))
    .leftJoin(branches, sql`${branches.id} = ${effectiveBranch}`)
    .where(and(...conditions))
    .orderBy(desc(effectiveDate), desc(vehicleServices.id));

  const filtered = raw.filter((e) =>
    matchesSearch(ctx.q, [
      e.vehicleNumber,
      e.registrationNumber,
      e.brandName,
      e.modelName,
      e.serviceType,
      e.vendor,
      e.note,
      e.branchName,
    ]),
  );

  let companyPaid = 0;
  let customerPaid = 0;
  for (const e of filtered) {
    const amount = baisaToNumber(e.expenseAmountBaisa ?? e.serviceCostBaisa);
    const payer = e.expensePaidBy ?? e.serviceBy;
    if (payer === "CUSTOMER") customerPaid += amount;
    else companyPaid += amount;
  }
  const totalExpense = companyPaid + customerPaid;

  const columns: ReportColumn[] = [
    { key: "date", label: "Date (Oman)", mono: true },
    { key: "vehicle", label: "Vehicle / Plate", mono: true },
    { key: "branch", label: "Branch" },
    { key: "serviceType", label: "Expense / Vendor" },
    { key: "paidBy", label: "Paid By", align: "center" },
    { key: "paymentMode", label: "Payment Mode" },
    { key: "odometer", label: "Odometer (km)", align: "end", mono: true },
    { key: "cost", label: "Expense (OMR)", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((e) => {
    const amount = baisaToNumber(e.expenseAmountBaisa ?? e.serviceCostBaisa);
    const payer = e.expensePaidBy ?? e.serviceBy;
    const mode = e.expensePaymentMode ?? e.servicePaymentMode;
    const when = e.completedAt ?? e.expenseCreatedAt ?? e.createdAt;
    const odo = e.odometerKm ?? e.kmReading;
    return {
      id: e.id,
      cells: {
        date: { text: formatOmanDateTimeDisplay(when) },
        vehicle: {
          text: `${e.vehicleNumber} · ${e.registrationNumber}`,
          subtext: `${e.brandName} ${e.modelName}`,
          csvValue: `${e.vehicleNumber} (${e.registrationNumber}) ${e.brandName} ${e.modelName}`,
        },
        branch: { text: e.branchName ?? "—", subtext: e.branchCode ?? undefined },
        serviceType: {
          text: e.serviceType.replaceAll("_", " "),
          subtext: e.vendor || e.note || undefined,
          csvValue: [e.serviceType.replaceAll("_", " "), e.vendor].filter(Boolean).join(" - "),
        },
        paidBy: {
          text: payer,
          badgeTone: payer === "COMPANY" ? "amber" : "sky",
        },
        paymentMode: { text: formatPaymentModeLabel(mode) },
        odometer: { text: odo !== null ? odo.toLocaleString("en-US") : "—" },
        cost: { text: formatOMR(amount) },
        status: { text: e.status, badgeTone: serviceStatusTone(e.status) },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Expense Records",
        value: String(filtered.length),
        detail: "Vehicle maintenance expenses",
      },
      {
        label: "Company Paid",
        value: formatOMR(companyPaid),
        detail: "Direct fleet operating expense",
        tone: "amber",
      },
      {
        label: "Customer Paid",
        value: formatOMR(customerPaid),
        detail: "Recovered / customer-funded",
      },
      {
        label: "Total Vehicle Expense",
        value: formatOMR(totalExpense),
        detail: "Combined maintenance spend",
        tone: "red",
      },
    ],
  };
}

/** 6. Customer List */
async function buildCustomerListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const custConds: SQL[] = [];
  if (ctx.fromDate) custConds.push(gte(customers.createdAt, ctx.fromDate));
  if (ctx.toExclusiveDate) custConds.push(lt(customers.createdAt, ctx.toExclusiveDate));

  const rentalScopeConds: SQL[] = [];
  if (!ctx.isSuper) {
    rentalScopeConds.push(
      ctx.permittedBranchIds.length
        ? inArray(rentals.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) rentalScopeConds.push(eq(rentals.branchId, ctx.branchId));

  const ledgerBranchScope = ctx.isSuper
    ? ctx.branchId
      ? or(eq(rentals.branchId, ctx.branchId), eq(payments.branchId, ctx.branchId))
      : undefined
    : ctx.permittedBranchIds.length
      ? ctx.branchId
        ? or(eq(rentals.branchId, ctx.branchId), eq(payments.branchId, ctx.branchId))
        : or(
            inArray(rentals.branchId, ctx.permittedBranchIds),
            inArray(payments.branchId, ctx.permittedBranchIds),
          )
      : sql`false`;

  const [customerRows, rentalCounts, ledgerRows] = await Promise.all([
    db
      .select({
        id: customers.id,
        customerNumber: customers.customerNumber,
        name: customers.name,
        mobile: customers.mobile,
        email: customers.email,
        drivingLicenceNumber: customers.drivingLicenceNumber,
        drivingLicenceExpiry: customers.drivingLicenceExpiry,
        civilIdNumber: customers.civilIdNumber,
        passportNumber: customers.passportNumber,
        isActive: customers.isActive,
        createdAt: customers.createdAt,
        blacklistId: customerBlacklist.id,
        blacklistReason: customerBlacklist.reason,
      })
      .from(customers)
      .leftJoin(
        customerBlacklist,
        and(eq(customerBlacklist.customerId, customers.id), eq(customerBlacklist.isActive, true)),
      )
      .where(custConds.length ? and(...custConds) : undefined)
      .orderBy(asc(customers.name)),
    db
      .select({
        customerId: rentals.customerId,
        bookings: sql<number>`count(*)::int`,
      })
      .from(rentals)
      .where(rentalScopeConds.length ? and(...rentalScopeConds) : undefined)
      .groupBy(rentals.customerId),
    db
      .select({
        customerId: customerLedger.customerId,
        balanceBaisa: sql<number>`coalesce(sum(${customerLedger.debitBaisa} - ${customerLedger.creditBaisa}), 0)::bigint`,
      })
      .from(customerLedger)
      .leftJoin(rentals, eq(rentals.id, customerLedger.rentalId))
      .leftJoin(payments, eq(payments.id, customerLedger.paymentId))
      .where(ledgerBranchScope)
      .groupBy(customerLedger.customerId),
  ]);

  const bookingsByCustomer = new Map(rentalCounts.map((r) => [r.customerId, Number(r.bookings)]));
  const balanceByCustomer = new Map(
    ledgerRows.map((l) => [l.customerId, baisaToNumber(l.balanceBaisa)]),
  );

  // Deduplicate if a customer somehow had multiple active blacklist rows
  const deduped = new Map<string, (typeof customerRows)[number]>();
  for (const row of customerRows) {
    if (!deduped.has(row.id)) deduped.set(row.id, row);
  }

  const filtered = [...deduped.values()].filter((c) => {
    const bookings = bookingsByCustomer.get(c.id) ?? 0;
    if (ctx.branchId && bookings === 0) return false;
    const isBlacklisted = Boolean(c.blacklistId);
    if (ctx.status === "BLACKLISTED" && !isBlacklisted) return false;
    if (ctx.status === "ACTIVE" && (!c.isActive || isBlacklisted)) return false;
    if (ctx.status === "INACTIVE" && (c.isActive || isBlacklisted)) return false;
    return matchesSearch(ctx.q, [
      c.customerNumber,
      c.name,
      c.mobile,
      c.email,
      c.drivingLicenceNumber,
      c.civilIdNumber,
      c.passportNumber,
      c.blacklistReason,
    ]);
  });

  let activeCount = 0;
  let blacklistedCount = 0;
  let totalOutstandingBaisa = 0;
  for (const c of filtered) {
    if (c.blacklistId) blacklistedCount += 1;
    else if (c.isActive) activeCount += 1;
    totalOutstandingBaisa += balanceByCustomer.get(c.id) ?? 0;
  }

  const canLedger = can(ctx.actor, "customers", "read") && can(ctx.actor, "finance", "read");

  const columns: ReportColumn[] = [
    { key: "customer", label: "Customer # / Name" },
    { key: "contact", label: "Mobile / Email" },
    { key: "licence", label: "Driving Licence", mono: true },
    { key: "identity", label: "Civil ID / Passport", mono: true },
    { key: "bookings", label: "Bookings", align: "end", mono: true },
    { key: "balance", label: "Outstanding Balance", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((c) => {
    const bookings = bookingsByCustomer.get(c.id) ?? 0;
    const balance = balanceByCustomer.get(c.id) ?? 0;
    const statusLabel = c.blacklistId ? "BLACKLISTED" : c.isActive ? "ACTIVE" : "INACTIVE";
    return {
      id: c.id,
      cells: {
        customer: {
          text: c.name,
          subtext: c.customerNumber,
          href: canLedger ? `/${ctx.locale}/ledger?customerId=${c.id}` : null,
          csvValue: `${c.name} (${c.customerNumber})`,
        },
        contact: {
          text: c.mobile,
          subtext: c.email ?? undefined,
          csvValue: [c.mobile, c.email].filter(Boolean).join(" / "),
        },
        licence: {
          text: c.drivingLicenceNumber,
          subtext: `Exp: ${c.drivingLicenceExpiry}`,
          csvValue: `${c.drivingLicenceNumber} (Exp ${c.drivingLicenceExpiry})`,
        },
        identity: {
          text: c.civilIdNumber || c.passportNumber || "—",
          subtext: c.civilIdNumber && c.passportNumber ? `PP: ${c.passportNumber}` : undefined,
          csvValue: [c.civilIdNumber, c.passportNumber].filter(Boolean).join(" / ") || "—",
        },
        bookings: { text: String(bookings) },
        balance: { text: formatOMR(balance) },
        status: {
          text: statusLabel,
          badgeTone: c.blacklistId ? "red" : c.isActive ? "emerald" : "neutral",
        },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Customers",
        value: String(filtered.length),
        detail: "Matching customer profiles",
      },
      {
        label: "Active",
        value: String(activeCount),
        detail: "Eligible non-blacklisted",
        tone: "emerald",
      },
      {
        label: "Blacklisted",
        value: String(blacklistedCount),
        detail: "Restricted from new bookings",
        tone: blacklistedCount > 0 ? "red" : "default",
      },
      {
        label: "Net Outstanding",
        value: formatOMR(totalOutstandingBaisa),
        detail: "Aggregate ledger balance",
        tone: totalOutstandingBaisa > 0 ? "amber" : "emerald",
      },
    ],
  };
}

/** 7. Receipt List */
async function buildReceiptListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [eq(payments.kind, "RECEIPT"), isNull(paymentCorrections.id)];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(payments.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(payments.branchId, ctx.branchId));
  if (ctx.paymentMode !== "ALL") conditions.push(eq(payments.method, ctx.paymentMode));
  if (ctx.fromDate) conditions.push(gte(payments.receivedAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(payments.receivedAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: payments.id,
      receiptNumber: payments.receiptNumber,
      method: payments.method,
      amountBaisa: payments.amountBaisa,
      reference: payments.reference,
      note: payments.note,
      receivedAt: payments.receivedAt,
      rentalId: rentals.id,
      agreementNumber: rentals.agreementNumber,
      customerName: customers.name,
      customerNumber: customers.customerNumber,
      branchName: branches.name,
      branchCode: branches.code,
      staffName: users.displayName,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .innerJoin(branches, eq(branches.id, payments.branchId))
    .innerJoin(users, eq(users.id, payments.recordedBy))
    .leftJoin(rentals, eq(rentals.id, payments.rentalId))
    .leftJoin(paymentCorrections, eq(paymentCorrections.originalPaymentId, payments.id))
    .where(and(...conditions))
    .orderBy(desc(payments.receivedAt), desc(payments.id));

  const filtered = raw.filter((p) =>
    matchesSearch(ctx.q, [
      p.receiptNumber,
      p.agreementNumber,
      p.customerName,
      p.customerNumber,
      p.reference,
      p.note,
      p.staffName,
      p.branchName,
    ]),
  );

  let cashTotal = 0;
  let nonCashTotal = 0;
  for (const p of filtered) {
    const amount = baisaToNumber(p.amountBaisa);
    if (p.method === "CASH") cashTotal += amount;
    else nonCashTotal += amount;
  }
  const grandTotal = cashTotal + nonCashTotal;
  const canPrintReceipt = can(ctx.actor, "finance", "print");
  const canRentals = can(ctx.actor, "rentals", "read");

  const columns: ReportColumn[] = [
    { key: "receipt", label: "Receipt # / Date", mono: true },
    { key: "agreement", label: "Agreement", mono: true },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "method", label: "Payment Mode" },
    { key: "reference", label: "Reference / Note" },
    { key: "staff", label: "Recorded By" },
    { key: "amount", label: "Amount (OMR)", align: "end", mono: true },
  ];

  const rows: ReportRow[] = filtered.map((p) => ({
    id: p.id,
    cells: {
      receipt: {
        text: p.receiptNumber,
        subtext: formatOmanDateTimeDisplay(p.receivedAt),
        href: canPrintReceipt ? `/${ctx.locale}/documents/receipt/${p.id}` : null,
        csvValue: `${p.receiptNumber} (${formatOmanDateTimeDisplay(p.receivedAt)})`,
      },
      agreement: {
        text: p.agreementNumber ?? "—",
        href: canRentals && p.rentalId ? `/${ctx.locale}/rentals/${p.rentalId}` : null,
      },
      customer: {
        text: p.customerName,
        subtext: p.customerNumber,
        csvValue: `${p.customerName} (${p.customerNumber})`,
      },
      branch: { text: p.branchName, subtext: p.branchCode, csvValue: p.branchName },
      method: { text: formatPaymentModeLabel(p.method), badgeTone: "sky" },
      reference: {
        text: p.reference || p.note || "—",
        subtext: p.reference && p.note ? p.note : undefined,
        csvValue: [p.reference, p.note].filter(Boolean).join(" - ") || "—",
      },
      staff: { text: p.staffName },
      amount: { text: formatOMR(baisaToNumber(p.amountBaisa)) },
    },
  }));

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Receipts",
        value: String(filtered.length),
        detail: "Collected receipt vouchers",
      },
      { label: "Cash Receipts", value: formatOMR(cashTotal), detail: "Collected in cash" },
      {
        label: "Card / Bank / Online",
        value: formatOMR(nonCashTotal),
        detail: "Non-cash receipts",
      },
      {
        label: "Total Collected",
        value: formatOMR(grandTotal),
        detail: "All matching receipts",
        tone: "emerald",
      },
    ],
  };
}

/** 8. Payment List */
async function buildPaymentListReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(payments.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(payments.branchId, ctx.branchId));
  if (ctx.status !== "ALL") {
    conditions.push(
      eq(payments.kind, ctx.status as "ADVANCE" | "RECEIPT" | "PAYBACK" | "REVERSAL"),
    );
  }
  if (ctx.paymentMode !== "ALL") conditions.push(eq(payments.method, ctx.paymentMode));
  if (ctx.fromDate) conditions.push(gte(payments.receivedAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(payments.receivedAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: payments.id,
      receiptNumber: payments.receiptNumber,
      kind: payments.kind,
      direction: payments.direction,
      method: payments.method,
      amountBaisa: payments.amountBaisa,
      reference: payments.reference,
      note: payments.note,
      receivedAt: payments.receivedAt,
      rentalId: rentals.id,
      agreementNumber: rentals.agreementNumber,
      customerName: customers.name,
      customerNumber: customers.customerNumber,
      branchName: branches.name,
      branchCode: branches.code,
      staffName: users.displayName,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .innerJoin(branches, eq(branches.id, payments.branchId))
    .innerJoin(users, eq(users.id, payments.recordedBy))
    .leftJoin(rentals, eq(rentals.id, payments.rentalId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(payments.receivedAt), desc(payments.id));

  const filtered = raw.filter((p) =>
    matchesSearch(ctx.q, [
      p.receiptNumber,
      p.kind,
      p.agreementNumber,
      p.customerName,
      p.customerNumber,
      p.reference,
      p.note,
      p.staffName,
      p.branchName,
    ]),
  );

  let inflows = 0;
  let outflows = 0;
  for (const p of filtered) {
    const amount = baisaToNumber(p.amountBaisa);
    if (p.direction === "RECEIPT") inflows += amount;
    else outflows += amount;
  }
  const netFlow = inflows - outflows;
  const canPrintReceipt = can(ctx.actor, "finance", "print");
  const canRentals = can(ctx.actor, "rentals", "read");

  const columns: ReportColumn[] = [
    { key: "receipt", label: "Voucher # / Date", mono: true },
    { key: "kind", label: "Type", align: "center" },
    { key: "direction", label: "Direction", align: "center" },
    { key: "agreement", label: "Agreement", mono: true },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "method", label: "Mode" },
    { key: "staff", label: "Recorded By" },
    { key: "amount", label: "Amount (OMR)", align: "end", mono: true },
  ];

  const rows: ReportRow[] = filtered.map((p) => ({
    id: p.id,
    cells: {
      receipt: {
        text: p.receiptNumber,
        subtext: formatOmanDateTimeDisplay(p.receivedAt),
        href: canPrintReceipt ? `/${ctx.locale}/documents/receipt/${p.id}` : null,
        csvValue: `${p.receiptNumber} (${formatOmanDateTimeDisplay(p.receivedAt)})`,
      },
      kind: { text: p.kind, badgeTone: paymentKindTone(p.kind) },
      direction: {
        text: p.direction === "RECEIPT" ? "INFLOW" : "OUTFLOW",
        badgeTone: p.direction === "RECEIPT" ? "emerald" : "amber",
      },
      agreement: {
        text: p.agreementNumber ?? "—",
        href: canRentals && p.rentalId ? `/${ctx.locale}/rentals/${p.rentalId}` : null,
      },
      customer: {
        text: p.customerName,
        subtext: p.customerNumber,
        csvValue: `${p.customerName} (${p.customerNumber})`,
      },
      branch: { text: p.branchName, subtext: p.branchCode, csvValue: p.branchName },
      method: { text: formatPaymentModeLabel(p.method) },
      staff: { text: p.staffName },
      amount: { text: formatOMR(baisaToNumber(p.amountBaisa)) },
    },
  }));

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Transactions",
        value: String(filtered.length),
        detail: "Advances, receipts, paybacks, reversals",
      },
      {
        label: "Total Inflows",
        value: formatOMR(inflows),
        detail: "Advances + receipts",
        tone: "emerald",
      },
      {
        label: "Total Outflows",
        value: formatOMR(outflows),
        detail: "Paybacks + reversals",
        tone: "amber",
      },
      {
        label: "Net Cash Flow",
        value: formatOMR(netFlow),
        detail: "Inflows minus outflows",
        tone: netFlow >= 0 ? "accent" : "red",
      },
    ],
  };
}

/** 9. Daily Activity Report */
async function buildDailyActivityReport(
  ctx: ReportQueryContext,
  maxRows: number,
): Promise<BuiltReportData> {
  const scopeMode = resolveActivityScopeMode(ctx.actor);
  const allowedEvents = allowedActivityEventsForActor(ctx.actor);
  const filteredEvents = resolveFilteredActivityEvents(ctx.status, allowedEvents);

  const columns: ReportColumn[] = [
    { key: "date", label: "Date / Time (Oman)", mono: true },
    { key: "activity", label: "Activity" },
    { key: "actor", label: "Actor" },
    { key: "branch", label: "Branch" },
    { key: "entity", label: "Entity" },
    { key: "details", label: "Details" },
  ];

  if (!filteredEvents.length) {
    return {
      columns,
      rows: [],
      summary: [
        { label: "Total Activities", value: "0", detail: "No permitted activities match" },
        { label: "Distinct Actors", value: "0" },
        { label: "Branches Touched", value: "0" },
        {
          label: "Visibility Scope",
          value: scopeMode === "ALL" ? "Super Admin" : "Permitted Scope",
        },
      ],
    };
  }

  const conditions: SQL[] = [
    sql`${effectiveEventSql} IN (${sql.join(
      filteredEvents.map((e) => sql`${e}`),
      sql`, `,
    )})`,
  ];

  if (scopeMode === "BRANCH_ADMIN") {
    const [superRows, branchUserRows] = await Promise.all([
      db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(roles.name, "SUPER_ADMIN")),
      ctx.permittedBranchIds.length
        ? db
            .select({ userId: userBranches.userId })
            .from(userBranches)
            .where(inArray(userBranches.branchId, ctx.permittedBranchIds))
        : Promise.resolve([]),
    ]);
    const superAdminIds = [...new Set(superRows.map((r) => r.userId))];
    const superSet = new Set(superAdminIds);
    const permittedUserIds = [
      ...new Set([
        ctx.actor.id,
        ...branchUserRows.map((r) => r.userId).filter((id) => !superSet.has(id)),
      ]),
    ];
    const nonSuperActor = superAdminIds.length
      ? or(isNull(auditLogs.actorId), notInArray(auditLogs.actorId, superAdminIds))
      : undefined;
    if (ctx.permittedBranchIds.length) {
      const scopeCond = or(
        nonSuperActor
          ? and(inArray(auditLogs.branchId, ctx.permittedBranchIds), nonSuperActor)
          : inArray(auditLogs.branchId, ctx.permittedBranchIds),
        and(isNull(auditLogs.branchId), inArray(auditLogs.actorId, permittedUserIds)),
      );
      if (scopeCond) conditions.push(scopeCond);
    } else {
      const ownGlobal = and(isNull(auditLogs.branchId), eq(auditLogs.actorId, ctx.actor.id));
      if (ownGlobal) conditions.push(ownGlobal);
    }
  } else if (scopeMode === "SELF") {
    conditions.push(eq(auditLogs.actorId, ctx.actor.id));
    if (ctx.permittedBranchIds.length) {
      const ownBranch = or(
        isNull(auditLogs.branchId),
        inArray(auditLogs.branchId, ctx.permittedBranchIds),
      );
      if (ownBranch) conditions.push(ownBranch);
    } else {
      conditions.push(isNull(auditLogs.branchId));
    }
  }

  if (ctx.branchId) conditions.push(eq(auditLogs.branchId, ctx.branchId));
  if (ctx.fromDate) conditions.push(gte(auditLogs.createdAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(auditLogs.createdAt, ctx.toExclusiveDate));
  if (ctx.q) {
    const pattern = `%${ctx.q}%`;
    const searchCond = or(
      ilike(users.displayName, pattern),
      ilike(users.username, pattern),
      ilike(branches.name, pattern),
      ilike(branches.code, pattern),
      ilike(auditLogs.entityType, pattern),
      ilike(auditLogs.entityId, pattern),
      sql`${effectiveEventSql} ILIKE ${pattern}`,
      sql`${auditLogs.metadata}::text ILIKE ${pattern}`,
    );
    if (searchCond) conditions.push(searchCond);
  }

  const raw = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      event: auditLogs.event,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      actorId: auditLogs.actorId,
      actorName: users.displayName,
      actorUsername: users.username,
      branchId: auditLogs.branchId,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(branches, eq(branches.id, auditLogs.branchId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(maxRows + 1);

  const actorSet = new Set<string>();
  const branchSet = new Set<string>();

  const rows: ReportRow[] = raw.map((row) => {
    if (row.actorId) actorSet.add(row.actorId);
    if (row.branchId) branchSet.add(row.branchId);
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const effectiveEvent = resolveEffectiveActivityEvent(row.event, row.entityType, metadata);
    const meta = ACTIVITY_EVENT_META[effectiveEvent];
    const displayInput = {
      effectiveEvent,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata,
    };
    const summaryText = formatActivitySummary(displayInput);
    const href = resolveActivityHref(ctx.locale, displayInput, ctx.actor);
    const actorDisplay = row.actorName ?? (row.actorId ? "Former user" : "System / Guest");

    return {
      id: row.id,
      cells: {
        date: { text: formatOmanDateTimeDisplay(row.createdAt) },
        activity: {
          text: meta.label,
          subtext: ACTIVITY_CATEGORY_LABELS[meta.category],
          badgeTone: meta.tone,
          csvValue: `${meta.label} (${ACTIVITY_CATEGORY_LABELS[meta.category]})`,
        },
        actor: {
          text: actorDisplay,
          subtext: row.actorUsername ? `@${row.actorUsername}` : undefined,
          csvValue: row.actorUsername ? `${actorDisplay} (@${row.actorUsername})` : actorDisplay,
        },
        branch: {
          text: row.branchName ?? "Global / System",
          subtext: row.branchCode ?? undefined,
          csvValue: row.branchName ?? "Global / System",
        },
        entity: { text: formatEntityTypeLabel(row.entityType) },
        details: { text: summaryText, href },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Activities",
        value: String(Math.min(rows.length, maxRows)),
        detail: "Matching audit events",
        tone: "accent",
      },
      { label: "Distinct Actors", value: String(actorSet.size), detail: "Active users in feed" },
      { label: "Branches Touched", value: String(branchSet.size), detail: "Branch-scoped entries" },
      {
        label: "Visibility Scope",
        value:
          scopeMode === "ALL"
            ? "All Branches"
            : scopeMode === "BRANCH_ADMIN"
              ? "Permitted Branches"
              : "Own Activity",
        detail: "RBAC-enforced audit feed",
      },
    ],
  };
}

/** 10. Service Report */
async function buildServiceReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const effectiveBranch = sql<string>`COALESCE(${vehicleServices.branchId}, ${vehicles.branchId})`;
  const effectiveDate = sql<Date>`COALESCE(${vehicleServices.completedAt}, ${vehicleServices.outAt}, ${vehicleServices.createdAt})`;

  const conditions: SQL[] = [];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? sql`${effectiveBranch} IN (${sql.join(
            ctx.permittedBranchIds.map((b) => sql`${b}`),
            sql`, `,
          )})`
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(sql`${effectiveBranch} = ${ctx.branchId}`);
  if (ctx.status !== "ALL") {
    conditions.push(
      eq(
        vehicleServices.status,
        ctx.status as "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
      ),
    );
  }
  if (ctx.paymentMode !== "ALL") {
    conditions.push(eq(vehicleServices.paymentMode, ctx.paymentMode));
  }
  if (ctx.fromDate) conditions.push(sql`${effectiveDate} >= ${ctx.fromDate}`);
  if (ctx.toExclusiveDate) conditions.push(sql`${effectiveDate} < ${ctx.toExclusiveDate}`);

  const raw = await db
    .select({
      id: vehicleServices.id,
      status: vehicleServices.status,
      type: vehicleServices.type,
      serviceBy: vehicleServices.serviceBy,
      vendor: vehicleServices.vendor,
      note: vehicleServices.note,
      dueDate: vehicleServices.dueDate,
      dueOdometerKm: vehicleServices.dueOdometerKm,
      kmReading: vehicleServices.kmReading,
      serviceOdometerKm: vehicleServices.serviceOdometerKm,
      paymentMode: vehicleServices.paymentMode,
      costBaisa: vehicleServices.costBaisa,
      completedAt: vehicleServices.completedAt,
      outAt: vehicleServices.outAt,
      createdAt: vehicleServices.createdAt,
      vehicleNumber: vehicles.vehicleNumber,
      registrationNumber: vehicles.registrationNumber,
      brandName: vehicleBrands.name,
      modelName: vehicleModels.name,
      branchName: branches.name,
      branchCode: branches.code,
      staffName: users.displayName,
    })
    .from(vehicleServices)
    .innerJoin(vehicles, eq(vehicles.id, vehicleServices.vehicleId))
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .leftJoin(branches, sql`${branches.id} = ${effectiveBranch}`)
    .leftJoin(users, eq(users.id, vehicleServices.createdBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(effectiveDate), desc(vehicleServices.id));

  const filtered = raw.filter((s) =>
    matchesSearch(ctx.q, [
      s.vehicleNumber,
      s.registrationNumber,
      s.brandName,
      s.modelName,
      s.type,
      s.vendor,
      s.note,
      s.staffName,
      s.branchName,
    ]),
  );

  let completedCount = 0;
  let openCount = 0;
  let totalCostBaisa = 0;
  for (const s of filtered) {
    if (s.status === "COMPLETED") completedCount += 1;
    else if (s.status === "SCHEDULED" || s.status === "IN_PROGRESS") openCount += 1;
    totalCostBaisa += baisaToNumber(s.costBaisa);
  }
  const canFleet = can(ctx.actor, "fleet", "read");

  const columns: ReportColumn[] = [
    { key: "date", label: "Date / Due (Oman)", mono: true },
    { key: "vehicle", label: "Vehicle / Plate", mono: true },
    { key: "branch", label: "Branch" },
    { key: "serviceType", label: "Service Type" },
    { key: "vendor", label: "Vendor / Notes" },
    { key: "odometer", label: "Odometer / Due KM", align: "end", mono: true },
    { key: "paymentMode", label: "Payment Mode" },
    { key: "cost", label: "Cost (OMR)", align: "end", mono: true },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((s) => {
    const when = s.completedAt ?? s.outAt ?? s.createdAt;
    const odo = s.serviceOdometerKm ?? s.kmReading;
    return {
      id: s.id,
      cells: {
        date: {
          text: formatOmanDateTimeDisplay(when),
          subtext: s.dueDate ? `Due: ${s.dueDate}` : undefined,
          csvValue: formatOmanDateTimeDisplay(when),
        },
        vehicle: {
          text: `${s.vehicleNumber} · ${s.registrationNumber}`,
          subtext: `${s.brandName} ${s.modelName}`,
          href: canFleet ? `/${ctx.locale}/service` : null,
          csvValue: `${s.vehicleNumber} (${s.registrationNumber}) ${s.brandName} ${s.modelName}`,
        },
        branch: { text: s.branchName ?? "—", subtext: s.branchCode ?? undefined },
        serviceType: {
          text: s.type.replaceAll("_", " "),
          subtext: `By: ${s.serviceBy}`,
          csvValue: `${s.type.replaceAll("_", " ")} (${s.serviceBy})`,
        },
        vendor: {
          text: s.vendor || "—",
          subtext: s.note || undefined,
          csvValue: [s.vendor, s.note].filter(Boolean).join(" - ") || "—",
        },
        odometer: {
          text: odo !== null ? `${odo.toLocaleString("en-US")} km` : "—",
          subtext: s.dueOdometerKm
            ? `Due: ${s.dueOdometerKm.toLocaleString("en-US")} km`
            : undefined,
          csvValue: odo !== null ? String(odo) : "—",
        },
        paymentMode: { text: formatPaymentModeLabel(s.paymentMode) },
        cost: { text: formatOMR(baisaToNumber(s.costBaisa)) },
        status: { text: s.status, badgeTone: serviceStatusTone(s.status) },
      },
    };
  });

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Services",
        value: String(filtered.length),
        detail: "All maintenance records",
      },
      {
        label: "Completed",
        value: String(completedCount),
        detail: "Closed service logs",
        tone: "emerald",
      },
      {
        label: "Scheduled / In Progress",
        value: String(openCount),
        detail: "Upcoming & active",
        tone: "amber",
      },
      {
        label: "Total Service Cost",
        value: formatOMR(totalCostBaisa),
        detail: "Recorded service cost",
        tone: "accent",
      },
    ],
  };
}

/** 11. Advance Collection Report */
async function buildAdvanceCollectionReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [eq(payments.kind, "ADVANCE"), isNull(paymentCorrections.id)];
  if (!ctx.isSuper) {
    conditions.push(
      ctx.permittedBranchIds.length
        ? inArray(payments.branchId, ctx.permittedBranchIds)
        : sql`false`,
    );
  }
  if (ctx.branchId) conditions.push(eq(payments.branchId, ctx.branchId));
  if (ctx.status !== "ALL") {
    conditions.push(
      eq(rentals.status, ctx.status as "RESERVED" | "ACTIVE" | "RETURNED" | "CANCELLED"),
    );
  }
  if (ctx.paymentMode !== "ALL") conditions.push(eq(payments.method, ctx.paymentMode));
  if (ctx.fromDate) conditions.push(gte(payments.receivedAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(payments.receivedAt, ctx.toExclusiveDate));

  const raw = await db
    .select({
      id: payments.id,
      receiptNumber: payments.receiptNumber,
      method: payments.method,
      amountBaisa: payments.amountBaisa,
      reference: payments.reference,
      note: payments.note,
      receivedAt: payments.receivedAt,
      rentalId: rentals.id,
      agreementNumber: rentals.agreementNumber,
      rentalStatus: rentals.status,
      customerName: customers.name,
      customerNumber: customers.customerNumber,
      branchName: branches.name,
      branchCode: branches.code,
      staffName: users.displayName,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .innerJoin(branches, eq(branches.id, payments.branchId))
    .innerJoin(users, eq(users.id, payments.recordedBy))
    .leftJoin(rentals, eq(rentals.id, payments.rentalId))
    .leftJoin(paymentCorrections, eq(paymentCorrections.originalPaymentId, payments.id))
    .where(and(...conditions))
    .orderBy(desc(payments.receivedAt), desc(payments.id));

  const filtered = raw.filter((p) =>
    matchesSearch(ctx.q, [
      p.receiptNumber,
      p.agreementNumber,
      p.customerName,
      p.customerNumber,
      p.reference,
      p.note,
      p.staffName,
      p.branchName,
    ]),
  );

  let cashTotal = 0;
  let nonCashTotal = 0;
  for (const p of filtered) {
    const amount = baisaToNumber(p.amountBaisa);
    if (p.method === "CASH") cashTotal += amount;
    else nonCashTotal += amount;
  }
  const grandTotal = cashTotal + nonCashTotal;
  const canPrintReceipt = can(ctx.actor, "finance", "print");
  const canRentals = can(ctx.actor, "rentals", "read");

  const columns: ReportColumn[] = [
    { key: "receipt", label: "Advance # / Date", mono: true },
    { key: "agreement", label: "Agreement", mono: true },
    { key: "rentalStatus", label: "Booking Status", align: "center" },
    { key: "customer", label: "Customer" },
    { key: "branch", label: "Branch" },
    { key: "method", label: "Payment Mode" },
    { key: "staff", label: "Recorded By" },
    { key: "amount", label: "Advance (OMR)", align: "end", mono: true },
  ];

  const rows: ReportRow[] = filtered.map((p) => ({
    id: p.id,
    cells: {
      receipt: {
        text: p.receiptNumber,
        subtext: formatOmanDateTimeDisplay(p.receivedAt),
        href: canPrintReceipt ? `/${ctx.locale}/documents/receipt/${p.id}` : null,
        csvValue: `${p.receiptNumber} (${formatOmanDateTimeDisplay(p.receivedAt)})`,
      },
      agreement: {
        text: p.agreementNumber ?? "—",
        href: canRentals && p.rentalId ? `/${ctx.locale}/rentals/${p.rentalId}` : null,
      },
      rentalStatus: {
        text: p.rentalStatus ?? "—",
        badgeTone: p.rentalStatus ? rentalStatusTone(p.rentalStatus) : "neutral",
      },
      customer: {
        text: p.customerName,
        subtext: p.customerNumber,
        csvValue: `${p.customerName} (${p.customerNumber})`,
      },
      branch: { text: p.branchName, subtext: p.branchCode, csvValue: p.branchName },
      method: { text: formatPaymentModeLabel(p.method), badgeTone: "sky" },
      staff: { text: p.staffName },
      amount: { text: formatOMR(baisaToNumber(p.amountBaisa)) },
    },
  }));

  return {
    columns,
    rows,
    summary: [
      {
        label: "Advance Receipts",
        value: String(filtered.length),
        detail: "Down payments & advances",
      },
      { label: "Cash Advances", value: formatOMR(cashTotal), detail: "Collected in cash" },
      {
        label: "Card / Bank / Online",
        value: formatOMR(nonCashTotal),
        detail: "Non-cash advances",
      },
      {
        label: "Total Advances",
        value: formatOMR(grandTotal),
        detail: "Total advance collection",
        tone: "emerald",
      },
    ],
  };
}

/** 12. Blacklist Register */
async function buildBlacklistRegisterReport(ctx: ReportQueryContext): Promise<BuiltReportData> {
  const conditions: SQL[] = [];
  if (ctx.status === "ACTIVE") conditions.push(eq(customerBlacklist.isActive, true));
  else if (ctx.status === "REMOVED") conditions.push(eq(customerBlacklist.isActive, false));
  if (ctx.fromDate) conditions.push(gte(customerBlacklist.createdAt, ctx.fromDate));
  if (ctx.toExclusiveDate) conditions.push(lt(customerBlacklist.createdAt, ctx.toExclusiveDate));

  const [raw, branchCustomerRows] = await Promise.all([
    db
      .select({
        id: customerBlacklist.id,
        customerId: customerBlacklist.customerId,
        reason: customerBlacklist.reason,
        description: customerBlacklist.description,
        startsAt: customerBlacklist.startsAt,
        endsAt: customerBlacklist.endsAt,
        isActive: customerBlacklist.isActive,
        deactivatedAt: customerBlacklist.deactivatedAt,
        createdAt: customerBlacklist.createdAt,
        customerNumber: customers.customerNumber,
        customerName: customers.name,
        mobile: customers.mobile,
        drivingLicenceNumber: customers.drivingLicenceNumber,
        actorName: users.displayName,
      })
      .from(customerBlacklist)
      .innerJoin(customers, eq(customers.id, customerBlacklist.customerId))
      .leftJoin(users, eq(users.id, customerBlacklist.actorId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(customerBlacklist.createdAt), desc(customerBlacklist.id)),
    ctx.branchId
      ? db
          .select({ customerId: rentals.customerId })
          .from(rentals)
          .where(eq(rentals.branchId, ctx.branchId))
      : Promise.resolve(null),
  ]);

  const branchCustomerSet = branchCustomerRows
    ? new Set(branchCustomerRows.map((r) => r.customerId))
    : null;

  const filtered = raw.filter((entry) => {
    if (branchCustomerSet && !branchCustomerSet.has(entry.customerId)) return false;
    return matchesSearch(ctx.q, [
      entry.customerNumber,
      entry.customerName,
      entry.mobile,
      entry.drivingLicenceNumber,
      entry.reason,
      entry.description,
      entry.actorName,
    ]);
  });

  let activeCount = 0;
  let removedCount = 0;
  const distinctCustomers = new Set<string>();
  for (const entry of filtered) {
    distinctCustomers.add(entry.customerId);
    if (entry.isActive) activeCount += 1;
    else removedCount += 1;
  }

  const canCustomers = can(ctx.actor, "customers", "read");

  const columns: ReportColumn[] = [
    { key: "recorded", label: "Recorded (Oman)", mono: true },
    { key: "customer", label: "Customer" },
    { key: "contact", label: "Mobile / Licence", mono: true },
    { key: "reason", label: "Reason" },
    { key: "description", label: "Details" },
    { key: "period", label: "Effective Period", mono: true },
    { key: "actor", label: "Recorded By" },
    { key: "status", label: "Status", align: "center" },
  ];

  const rows: ReportRow[] = filtered.map((entry) => ({
    id: entry.id,
    cells: {
      recorded: { text: formatOmanDateTimeDisplay(entry.createdAt) },
      customer: {
        text: entry.customerName,
        subtext: entry.customerNumber,
        href: canCustomers ? `/${ctx.locale}/customers/blacklist` : null,
        csvValue: `${entry.customerName} (${entry.customerNumber})`,
      },
      contact: {
        text: entry.mobile,
        subtext: entry.drivingLicenceNumber,
        csvValue: `${entry.mobile} / ${entry.drivingLicenceNumber}`,
      },
      reason: { text: entry.reason },
      description: { text: entry.description },
      period: {
        text:
          entry.startsAt || entry.endsAt
            ? `${entry.startsAt ?? "—"} → ${entry.endsAt ?? "Indefinite"}`
            : "Indefinite",
      },
      actor: { text: entry.actorName ?? "System" },
      status: {
        text: entry.isActive ? "ACTIVE" : "REMOVED",
        badgeTone: entry.isActive ? "red" : "neutral",
      },
    },
  }));

  return {
    columns,
    rows,
    summary: [
      {
        label: "Total Records",
        value: String(filtered.length),
        detail: "Active + historical entries",
      },
      {
        label: "Currently Blacklisted",
        value: String(activeCount),
        detail: "Active restrictions",
        tone: activeCount > 0 ? "red" : "emerald",
      },
      {
        label: "Removed / Historical",
        value: String(removedCount),
        detail: "Cleared blacklist logs",
      },
      {
        label: "Distinct Customers",
        value: String(distinctCustomers.size),
        detail: "Unique customers listed",
      },
    ],
  };
}

export async function loadReport(
  actor: Identity,
  locale: string,
  rawFilters: ReportFiltersInput = {},
  mode: ReportMode = "page",
): Promise<LoadedReport> {
  const reportSlug = normalizeReportSlug(rawFilters.report);
  const definition = REPORT_CATALOG[reportSlug];
  const status = normalizeReportStatus(reportSlug, rawFilters.status);
  const paymentMode = definition.supportsPaymentMode
    ? normalizePaymentMode(rawFilters.paymentMode)
    : "ALL";
  const q = (rawFilters.q ?? "").trim().slice(0, 120);
  const { validFrom, validTo, fromDate, toExclusiveDate } = parseOmanDateRange(
    rawFilters.from,
    rawFilters.to,
  );
  const requestedPage = Math.max(1, Math.trunc(rawFilters.page ?? 1) || 1);

  const isSuper = actor.role === "SUPER_ADMIN";
  const branchOptions = isSuper
    ? await db
        .select({ id: branches.id, name: branches.name, code: branches.code })
        .from(branches)
        .orderBy(asc(branches.name))
    : actor.branchIds.length
      ? await db
          .select({ id: branches.id, name: branches.name, code: branches.code })
          .from(branches)
          .where(inArray(branches.id, actor.branchIds))
          .orderBy(asc(branches.name))
      : [];

  const permittedBranchIds = branchOptions.map((b) => b.id);
  const permittedBranchSet = new Set(permittedBranchIds);
  const rawBranchId = (rawFilters.branchId ?? "").trim();
  const branchIsUuid = Boolean(rawBranchId && uuidSchema.safeParse(rawBranchId).success);
  const validBranchId = branchIsUuid && permittedBranchSet.has(rawBranchId) ? rawBranchId : "";
  const unauthorizedBranchProbe = branchIsUuid && !permittedBranchSet.has(rawBranchId);

  const filters = {
    report: reportSlug,
    q,
    branchId: validBranchId,
    status,
    paymentMode,
    from: validFrom,
    to: validTo,
  };

  if (unauthorizedBranchProbe) {
    return {
      definition,
      columns: [],
      rows: [],
      summary: [{ label: "Total Records", value: "0", detail: "Branch outside permitted scope" }],
      totalRows: 0,
      page: 1,
      totalPages: 1,
      pageSize: REPORTS_PAGE_SIZE,
      truncated: false,
      branches: branchOptions,
      filters,
    };
  }

  const ctx: ReportQueryContext = {
    actor,
    locale,
    isSuper,
    permittedBranchIds,
    branchId: validBranchId,
    status,
    paymentMode,
    q,
    fromDate,
    toExclusiveDate,
  };

  const maxRows =
    mode === "export"
      ? REPORT_EXPORT_MAX_ROWS
      : mode === "print"
        ? REPORT_PRINT_MAX_ROWS
        : REPORT_EXPORT_MAX_ROWS;

  let built: BuiltReportData;
  switch (reportSlug) {
    case "vehicle-list":
      built = await buildVehicleListReport(ctx);
      break;
    case "invoice-list":
      built = await buildInvoiceListReport(ctx);
      break;
    case "agreement-list":
      built = await buildAgreementListReport(ctx);
      break;
    case "vehicle-income":
      built = await buildVehicleIncomeReport(ctx);
      break;
    case "vehicle-expense":
      built = await buildVehicleExpenseReport(ctx);
      break;
    case "customer-list":
      built = await buildCustomerListReport(ctx);
      break;
    case "receipt-list":
      built = await buildReceiptListReport(ctx);
      break;
    case "payment-list":
      built = await buildPaymentListReport(ctx);
      break;
    case "daily-activity":
      built = await buildDailyActivityReport(ctx, maxRows);
      break;
    case "service-report":
      built = await buildServiceReport(ctx);
      break;
    case "advance-collection":
      built = await buildAdvanceCollectionReport(ctx);
      break;
    case "blacklist-register":
      built = await buildBlacklistRegisterReport(ctx);
      break;
  }

  if (mode === "page") {
    const paged = paginateReportRows(built.rows, requestedPage, REPORTS_PAGE_SIZE);
    return {
      definition,
      columns: built.columns,
      rows: paged.pageRows,
      summary: built.summary,
      totalRows: paged.totalRows,
      page: paged.page,
      totalPages: paged.totalPages,
      pageSize: paged.pageSize,
      truncated: false,
      branches: branchOptions,
      filters,
    };
  }

  const truncated = built.rows.length > maxRows;
  const limitedRows = truncated ? built.rows.slice(0, maxRows) : built.rows;

  return {
    definition,
    columns: built.columns,
    rows: limitedRows,
    summary: built.summary,
    totalRows: built.rows.length,
    page: 1,
    totalPages: 1,
    pageSize: limitedRows.length || REPORTS_PAGE_SIZE,
    truncated,
    branches: branchOptions,
    filters,
  };
}
