import "server-only";
import { type AnyColumn, and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db/client";
import {
  branches,
  customerBlacklist,
  customerLedger,
  customers,
  financeFines,
  invoices,
  payments,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  users,
  vehicleBrands,
  vehicleModels,
  vehicles,
} from "@/db/schema";
import type { Identity } from "@/lib/auth";
import {
  buildRunningLedger,
  LEDGER_PAGE_SIZE,
  normalizeLedgerFilterType,
  parseOmanDateRange,
  type RawLedgerEntry,
  summarizeCustomerFinancials,
} from "./calculations";

const uuidSchema = z.string().uuid();

export async function searchLedgerCustomers(query: string, limit = 50) {
  const q = query.trim();
  const where = q
    ? or(
        ilike(customers.name, `%${q}%`),
        ilike(customers.mobile, `%${q}%`),
        ilike(customers.customerNumber, `%${q}%`),
        ilike(customers.drivingLicenceNumber, `%${q}%`),
        ilike(customers.civilIdNumber, `%${q}%`),
        ilike(customers.passportNumber, `%${q}%`),
      )
    : undefined;

  return db
    .select({
      id: customers.id,
      customerNumber: customers.customerNumber,
      name: customers.name,
      mobile: customers.mobile,
      drivingLicenceNumber: customers.drivingLicenceNumber,
      isActive: customers.isActive,
      blacklistId: customerBlacklist.id,
      blacklistReason: customerBlacklist.reason,
    })
    .from(customers)
    .leftJoin(
      customerBlacklist,
      and(eq(customerBlacklist.customerId, customers.id), eq(customerBlacklist.isActive, true)),
    )
    .where(where)
    .orderBy(asc(customers.name))
    .limit(limit);
}

export async function loadCustomerLedger(
  customerId: string,
  actor: Identity,
  options: {
    from?: string;
    to?: string;
    type?: string;
    page?: number;
  } = {},
) {
  if (!uuidSchema.safeParse(customerId).success) return null;

  const [customerRow] = await db
    .select({
      customer: customers,
      blacklistId: customerBlacklist.id,
      blacklistReason: customerBlacklist.reason,
      blacklistDescription: customerBlacklist.description,
      blacklistStartsAt: customerBlacklist.startsAt,
      blacklistEndsAt: customerBlacklist.endsAt,
    })
    .from(customers)
    .leftJoin(
      customerBlacklist,
      and(eq(customerBlacklist.customerId, customers.id), eq(customerBlacklist.isActive, true)),
    )
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customerRow) return null;

  const isSuper = actor.role === "SUPER_ADMIN";
  const hasBranches = actor.branchIds.length > 0;
  const branchScope = (col: AnyColumn) =>
    isSuper ? undefined : hasBranches ? inArray(col, actor.branchIds) : sql`false`;

  const ledgerBranchScope = isSuper
    ? undefined
    : hasBranches
      ? or(inArray(rentals.branchId, actor.branchIds), inArray(payments.branchId, actor.branchIds))
      : sql`false`;

  const rentalBranches = alias(branches, "rental_branches");
  const paymentBranches = alias(branches, "payment_branches");

  const [bookingRows, paymentRows, invoiceRows, fineRows, rawLedgerRows] = await Promise.all([
    db
      .select({
        id: rentals.id,
        agreementNumber: rentals.agreementNumber,
        status: rentals.status,
        startsAt: rentals.startsAt,
        expectedReturnAt: rentals.expectedReturnAt,
        actualReturnAt: rentals.actualReturnAt,
        pricingPeriod: rentals.pricingPeriod,
        rentDuration: rentals.rentDuration,
        pickupOdometerKm: rentals.pickupOdometerKm,
        returnOdometerKm: rentals.returnOdometerKm,
        depositBaisa: rentals.depositBaisa,
        subtotalBaisa: rentals.subtotalBaisa,
        taxBaisa: rentals.taxBaisa,
        totalBaisa: rentals.totalBaisa,
        branchId: rentals.branchId,
        branchName: branches.name,
        vehicleId: vehicles.id,
        vehicleNumber: vehicles.vehicleNumber,
        registrationNumber: vehicles.registrationNumber,
        vehicleColor: vehicles.color,
        vehicleYear: vehicles.year,
        brandName: vehicleBrands.name,
        modelName: vehicleModels.name,
      })
      .from(rentals)
      .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
      .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
      .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .innerJoin(branches, eq(branches.id, rentals.branchId))
      .where(and(eq(rentals.customerId, customerId), branchScope(rentals.branchId)))
      .orderBy(desc(rentals.startsAt)),

    db
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
        rentalId: payments.rentalId,
        agreementNumber: rentals.agreementNumber,
        branchId: payments.branchId,
        branchName: branches.name,
        recordedByName: users.displayName,
      })
      .from(payments)
      .leftJoin(rentals, eq(rentals.id, payments.rentalId))
      .innerJoin(branches, eq(branches.id, payments.branchId))
      .innerJoin(users, eq(users.id, payments.recordedBy))
      .where(and(eq(payments.customerId, customerId), branchScope(payments.branchId)))
      .orderBy(desc(payments.receivedAt)),

    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        rentalId: invoices.rentalId,
        agreementNumber: rentals.agreementNumber,
        branchId: invoices.branchId,
        branchName: branches.name,
        status: invoices.status,
        subtotalBaisa: invoices.subtotalBaisa,
        washingBaisa: invoices.washingBaisa,
        petrolBaisa: invoices.petrolBaisa,
        discountBaisa: invoices.discountBaisa,
        grandTotalBaisa: invoices.grandTotalBaisa,
        advanceBaisa: invoices.advanceBaisa,
        receivedBaisa: invoices.receivedBaisa,
        balanceBaisa: invoices.balanceBaisa,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .innerJoin(rentals, eq(rentals.id, invoices.rentalId))
      .innerJoin(branches, eq(branches.id, invoices.branchId))
      .where(and(eq(rentals.customerId, customerId), branchScope(invoices.branchId)))
      .orderBy(desc(invoices.createdAt)),

    db
      .select({
        id: financeFines.id,
        kind: financeFines.kind,
        rentalId: financeFines.rentalId,
        agreementNumber: rentals.agreementNumber,
        vehicleNumber: vehicles.vehicleNumber,
        registrationNumber: vehicles.registrationNumber,
        branchId: financeFines.branchId,
        branchName: branches.name,
        dateFrom: financeFines.dateFrom,
        dateTo: financeFines.dateTo,
        amountBaisa: financeFines.amountBaisa,
        details: financeFines.details,
        remarks: financeFines.remarks,
        createdAt: financeFines.createdAt,
      })
      .from(financeFines)
      .innerJoin(rentals, eq(rentals.id, financeFines.rentalId))
      .innerJoin(vehicles, eq(vehicles.id, financeFines.vehicleId))
      .innerJoin(branches, eq(branches.id, financeFines.branchId))
      .where(
        and(
          eq(financeFines.customerId, customerId),
          eq(financeFines.isDeleted, false),
          branchScope(financeFines.branchId),
        ),
      )
      .orderBy(desc(financeFines.createdAt)),

    db
      .select({
        id: customerLedger.id,
        createdAt: customerLedger.createdAt,
        type: customerLedger.type,
        debitBaisa: customerLedger.debitBaisa,
        creditBaisa: customerLedger.creditBaisa,
        description: customerLedger.description,
        rentalId: customerLedger.rentalId,
        agreementNumber: rentals.agreementNumber,
        paymentId: customerLedger.paymentId,
        receiptNumber: payments.receiptNumber,
        paymentKind: payments.kind,
        paymentMethod: payments.method,
        rentalBranchName: rentalBranches.name,
        paymentBranchName: paymentBranches.name,
      })
      .from(customerLedger)
      .leftJoin(rentals, eq(rentals.id, customerLedger.rentalId))
      .leftJoin(payments, eq(payments.id, customerLedger.paymentId))
      .leftJoin(rentalBranches, eq(rentalBranches.id, rentals.branchId))
      .leftJoin(paymentBranches, eq(paymentBranches.id, payments.branchId))
      .where(and(eq(customerLedger.customerId, customerId), ledgerBranchScope))
      .orderBy(asc(customerLedger.createdAt), asc(customerLedger.id)),
  ]);

  const rentalIds = bookingRows.map((b) => b.id);
  const [swapVehicleRows, additionalChargeRows] = rentalIds.length
    ? await Promise.all([
        db
          .select({
            rentalId: rentalVehicleSwaps.rentalId,
            agreementNumber: rentals.agreementNumber,
            transferredAt: rentalVehicleSwaps.transferredAt,
            vehicleId: vehicles.id,
            vehicleNumber: vehicles.vehicleNumber,
            registrationNumber: vehicles.registrationNumber,
            vehicleColor: vehicles.color,
            vehicleYear: vehicles.year,
            brandName: vehicleBrands.name,
            modelName: vehicleModels.name,
            branchName: branches.name,
          })
          .from(rentalVehicleSwaps)
          .innerJoin(rentals, eq(rentals.id, rentalVehicleSwaps.rentalId))
          .innerJoin(vehicles, eq(vehicles.id, rentalVehicleSwaps.previousVehicleId))
          .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
          .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
          .innerJoin(branches, eq(branches.id, vehicles.branchId))
          .where(inArray(rentalVehicleSwaps.rentalId, rentalIds))
          .orderBy(desc(rentalVehicleSwaps.transferredAt)),
        db
          .select({
            id: rentalCharges.id,
            rentalId: rentalCharges.rentalId,
            agreementNumber: rentals.agreementNumber,
            type: rentalCharges.type,
            component: rentalCharges.component,
            description: rentalCharges.description,
            amountBaisa: rentalCharges.amountBaisa,
            createdAt: rentalCharges.createdAt,
          })
          .from(rentalCharges)
          .innerJoin(rentals, eq(rentals.id, rentalCharges.rentalId))
          .where(inArray(rentalCharges.rentalId, rentalIds))
          .orderBy(desc(rentalCharges.createdAt)),
      ])
    : [[], []];

  // Exclude base rental charges and finance_fines duplicates (component === "FINE") so
  // Additional Charges accurately captures excess KM, late/overdue fees, washing, petrol, damage & adjustments.
  const extraCharges = additionalChargeRows.filter(
    (c) => c.component !== "RENTAL" && c.component !== "FINE",
  );

  // Build deduplicated active & historical vehicles rented list (including swapped vehicles)
  type RentedVehicleSummary = {
    vehicleId: string;
    vehicleNumber: string;
    registrationNumber: string;
    brandName: string;
    modelName: string;
    year: number;
    color: string;
    branchName: string;
    usageStatus: "ACTIVE" | "RESERVED" | "HISTORICAL";
    rentalCount: number;
    lastUsedAt: Date;
    swappedFrom: boolean;
  };
  const vehicleMap = new Map<string, RentedVehicleSummary>();

  for (const b of bookingRows) {
    const status: RentedVehicleSummary["usageStatus"] =
      b.status === "ACTIVE" ? "ACTIVE" : b.status === "RESERVED" ? "RESERVED" : "HISTORICAL";
    const existing = vehicleMap.get(b.vehicleId);
    if (!existing) {
      vehicleMap.set(b.vehicleId, {
        vehicleId: b.vehicleId,
        vehicleNumber: b.vehicleNumber,
        registrationNumber: b.registrationNumber,
        brandName: b.brandName,
        modelName: b.modelName,
        year: b.vehicleYear,
        color: b.vehicleColor,
        branchName: b.branchName,
        usageStatus: status,
        rentalCount: 1,
        lastUsedAt: b.startsAt,
        swappedFrom: false,
      });
    } else {
      existing.rentalCount += 1;
      if (b.startsAt > existing.lastUsedAt) existing.lastUsedAt = b.startsAt;
      if (status === "ACTIVE") existing.usageStatus = "ACTIVE";
      else if (status === "RESERVED" && existing.usageStatus === "HISTORICAL")
        existing.usageStatus = "RESERVED";
    }
  }

  for (const s of swapVehicleRows) {
    const existing = vehicleMap.get(s.vehicleId);
    if (!existing) {
      vehicleMap.set(s.vehicleId, {
        vehicleId: s.vehicleId,
        vehicleNumber: s.vehicleNumber,
        registrationNumber: s.registrationNumber,
        brandName: s.brandName,
        modelName: s.modelName,
        year: s.vehicleYear,
        color: s.vehicleColor,
        branchName: s.branchName,
        usageStatus: "HISTORICAL",
        rentalCount: 1,
        lastUsedAt: s.transferredAt,
        swappedFrom: true,
      });
    } else {
      existing.rentalCount += 1;
      if (s.transferredAt > existing.lastUsedAt) existing.lastUsedAt = s.transferredAt;
    }
  }

  const rentedVehicles = [...vehicleMap.values()].sort((a, b) => {
    const rank = { ACTIVE: 0, RESERVED: 1, HISTORICAL: 2 };
    if (rank[a.usageStatus] !== rank[b.usageStatus])
      return rank[a.usageStatus] - rank[b.usageStatus];
    return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
  });

  const dateRange = parseOmanDateRange(options.from, options.to);
  const typeFilter = normalizeLedgerFilterType(options.type);

  const normalizedLedger: RawLedgerEntry[] = rawLedgerRows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    type: row.type,
    paymentKind: row.paymentKind,
    paymentMethod: row.paymentMethod,
    rentalId: row.rentalId,
    agreementNumber: row.agreementNumber,
    paymentId: row.paymentId,
    receiptNumber: row.receiptNumber,
    branchName: row.rentalBranchName ?? row.paymentBranchName ?? null,
    description: row.description,
    debitBaisa: Number(row.debitBaisa) || 0,
    creditBaisa: Number(row.creditBaisa) || 0,
  }));

  const ledger = buildRunningLedger(normalizedLedger, {
    fromDate: dateRange.fromDate,
    toExclusiveDate: dateRange.toExclusiveDate,
    typeFilter,
    page: options.page ?? 1,
    pageSize: LEDGER_PAGE_SIZE,
  });

  const financials = summarizeCustomerFinancials({
    totalDebitsBaisa: ledger.totalDebitBaisa,
    totalCreditsBaisa: ledger.totalCreditBaisa,
    payments: paymentRows,
    invoices: invoiceRows,
    fines: fineRows,
    extraCharges,
  });

  return {
    customer: customerRow.customer,
    blacklist: customerRow.blacklistId
      ? {
          id: customerRow.blacklistId,
          reason: customerRow.blacklistReason ?? "",
          description: customerRow.blacklistDescription ?? "",
          startsAt: customerRow.blacklistStartsAt,
          endsAt: customerRow.blacklistEndsAt,
        }
      : null,
    filters: {
      from: dateRange.validFrom,
      to: dateRange.validTo,
      type: typeFilter,
    },
    financials,
    ledger,
    rentedVehicles,
    bookings: bookingRows,
    advances: paymentRows.filter((p) => p.kind === "ADVANCE"),
    receipts: paymentRows.filter((p) => p.kind === "RECEIPT" || p.kind === "REVERSAL"),
    paybacks: paymentRows.filter((p) => p.kind === "PAYBACK"),
    invoices: invoiceRows,
    fines: fineRows,
    extraCharges,
  };
}
