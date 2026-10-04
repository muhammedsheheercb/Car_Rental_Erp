import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { PrintableDocument } from "@/components/print-document";
import { db } from "@/db/client";
import {
  branches,
  customers,
  financeFines,
  invoices,
  payments,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  users,
  vehicleBrands,
  vehicles,
} from "@/db/schema";
import { totals } from "@/features/finance/service";
import { omrInput } from "@/features/invoices/calculations";
import { invoicePayments } from "@/features/invoices/service";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import { documentSignature } from "@/features/signatures/service";
import { can, type Identity } from "@/lib/auth";
export const DOCUMENT_KINDS = ["agreement", "invoice", "legal-fine", "receipt"] as const;
export async function loadDocument(
  kind: string,
  id: string,
  actor: Identity,
): Promise<PrintableDocument | null> {
  if (
    !DOCUMENT_KINDS.includes(kind as (typeof DOCUMENT_KINDS)[number]) ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const module = kind === "agreement" ? "rentals" : "finance";
  if (!can(actor, module, "read") || !can(actor, module, "print")) return null;
  const [record] =
    kind === "invoice"
      ? await db.select().from(invoices).where(eq(invoices.id, id))
      : kind === "legal-fine"
        ? await db
            .select()
            .from(financeFines)
            .where(and(eq(financeFines.id, id), eq(financeFines.kind, "LEGAL")))
        : kind === "receipt"
          ? await db.select().from(payments).where(eq(payments.id, id))
          : [];
  const rentalId = kind === "agreement" ? id : record?.rentalId;
  if (!rentalId) return null;
  const [row] = await db
    .select({ r: rentals, c: customers, v: vehicles, brand: vehicleBrands.name, b: branches })
    .from(rentals)
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .innerJoin(vehicleBrands, eq(vehicleBrands.id, vehicles.brandId))
    .innerJoin(branches, eq(branches.id, rentals.branchId))
    .where(eq(rentals.id, rentalId));
  if (
    !row ||
    !can(actor, module, "read", row.r.branchId) ||
    !can(actor, module, "print", row.r.branchId)
  )
    return null;
  if (
    record &&
    "branchId" in record &&
    (!can(actor, module, "read", record.branchId) || !can(actor, module, "print", record.branchId))
  )
    return null;
  const { r, c, v, b } = row;
  const creator = record
    ? "recordedBy" in record
      ? record.recordedBy
      : record.createdBy
    : r.createdBy;
  const names = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [creator, ...(r.returnedBy ? [r.returnedBy] : [])]));
  const name = (id: string | null) => names.find((u) => u.id === id)?.name ?? "";
  const returned = r.status === "RETURNED" || r.actualReturnAt !== null;
  const [printerSignature, creatorSignature, returnSignature] = await Promise.all([
    documentSignature(actor.id),
    creator === actor.id ? Promise.resolve(null) : documentSignature(creator),
    returned ? documentSignature(r.returnedBy) : null,
  ]);
  const signatures = [
    { label: "Customer Signature", name: c.name, src: null },
    ...(returned
      ? [
          {
            label: "Return Received By",
            name: name(r.returnedBy),
            src: returnSignature?.src ?? null,
          },
        ]
      : []),
    {
      label: "Authorized Staff Signature",
      name: printerSignature || !creatorSignature ? actor.displayName : name(creator),
      src: printerSignature?.src ?? creatorSignature?.src ?? null,
    },
  ];
  const at = (date: Date | string | null | undefined) =>
    date
      ? formatOmanDateTime(typeof date === "string" ? new Date(date) : date).replace("T", " ")
      : "—";
  let fields: [string, string][] = [
    ["Booking Number", r.agreementNumber],
    ["Booking Date / Time", at(r.startsAt)],
    ["Customer Name", c.name],
    ["Mobile", c.mobile],
    ["Address", c.address],
    ["Civil Number", c.civilIdNumber ?? "—"],
    ["Licence Number", c.drivingLicenceNumber],
    ["Vehicle / Brand", `${v.vehicleNumber} / ${row.brand}`],
    ["Registration Number", v.registrationNumber],
    ["Rental Type / Duration", `${r.pricingPeriod} / ${r.rentDuration}`],
    ["Starting KM", String(r.pickupOdometerKm ?? "—")],
    ["Ending KM", String(r.returnOdometerKm ?? "—")],
    ["Expected Return", at(r.expectedReturnAt)],
    ["Actual Return", at(r.actualReturnAt)],
    ["KM Maximum / Free KM", `${r.includedKm} / ${r.freeKm}`],
    [
      "Rate / Excess KM Rate (OMR)",
      `${omrInput(r.dailyRateBaisa)} / ${omrInput(r.excessKmChargeBaisa)}`,
    ],
  ];
  const d: PrintableDocument = {
    title: "Rental Agreement",
    number: r.agreementNumber,
    status: r.status,
    branch: b.name,
    location: b.location,
    issuedAt: at(r.createdAt),
    fields,
    charges: [],
    totals: [],
    remarks: r.notes ?? "",
    preparedBy: name(creator),
    printedBy: actor.displayName,
    printedAt: at(new Date()),
    returned,
    signatures,
  };
  if (kind === "agreement") {
    const [charges, financial, paid, swaps] = await Promise.all([
      db
        .select()
        .from(rentalCharges)
        .where(eq(rentalCharges.rentalId, r.id))
        .orderBy(asc(rentalCharges.createdAt)),
      totals(db, r.id),
      invoicePayments(db, r.id),
      db
        .select()
        .from(rentalVehicleSwaps)
        .where(eq(rentalVehicleSwaps.rentalId, r.id))
        .orderBy(asc(rentalVehicleSwaps.transferredAt)),
    ]);
    d.charges = charges.map((ch) => ({
      id: ch.id,
      label: `${ch.component.replaceAll("_", " ")} — ${ch.description}`,
      amount: omrInput(ch.amountBaisa),
    }));
    d.totals = [
      ["Rental Total", omrInput(r.totalBaisa)],
      ["Security Deposit", omrInput(r.depositBaisa)],
      ["Advance", omrInput(paid.advance)],
      ["Received", omrInput(paid.received)],
      ["Balance", omrInput(financial.balance)],
    ];
    d.transfers = swaps.map((s) => ({
      id: s.id,
      at: at(s.transferredAt),
      from: String(
        (s.snapshot.previousVehicle as { registrationNumber?: string })?.registrationNumber ?? "—",
      ),
      to: String(
        (s.snapshot.newVehicle as { registrationNumber?: string })?.registrationNumber ?? "—",
      ),
      km: `${s.startingKm}–${s.endingKm}; new ${s.newStartingKm}`,
    }));
  } else if (kind === "invoice" && record && "grandTotalBaisa" in record) {
    d.title = "Invoice / Bill";
    d.number = record.invoiceNumber;
    d.status = record.status;
    d.issuedAt = at(record.createdAt);
    d.remarks = record.remarks ?? "";
    const snapshot = record.snapshot as {
      booking?: typeof r;
      customer?: typeof c;
      vehicle?: typeof v;
      charges?: { id: string; component: string; description: string; amountBaisa: number }[];
      depositBaisa?: number;
      ledgerAdjustmentsBaisa?: number;
    };
    if (snapshot.booking && snapshot.customer && snapshot.vehicle) {
      const sr = snapshot.booking;
      fields = [
        ["Booking Number", sr.agreementNumber],
        ["Booking Date / Time", at(sr.startsAt)],
        ["Customer Name", snapshot.customer.name],
        ["Mobile", snapshot.customer.mobile],
        ["Address", snapshot.customer.address],
        ["Registration Number", snapshot.vehicle.registrationNumber],
        ["Rental Type", sr.pricingPeriod],
        ["Starting KM", String(sr.pickupOdometerKm ?? "—")],
        ["Ending KM", String(sr.returnOdometerKm ?? "—")],
        ["Expected Return", at(sr.expectedReturnAt)],
        ["Actual Return", at(sr.actualReturnAt)],
        ["Rate (OMR)", omrInput(sr.dailyRateBaisa)],
      ];
      d.fields = fields;
    }
    d.charges = [
      ...(snapshot.charges ?? []).map((ch) => ({
        id: ch.id,
        label: `${ch.component.replaceAll("_", " ")} — ${ch.description}`,
        amount: omrInput(ch.amountBaisa),
      })),
      { id: "washing", label: "Additional Washing", amount: omrInput(record.washingBaisa) },
      { id: "petrol", label: "Additional Petrol", amount: omrInput(record.petrolBaisa) },
      { id: "discount", label: "Discount", amount: omrInput(-record.discountBaisa) },
    ];
    d.totals = [
      ["Grand Total", omrInput(record.grandTotalBaisa)],
      ["Security Deposit (included)", omrInput(snapshot.depositBaisa ?? 0)],
      ["Advance Received", omrInput(record.advanceBaisa)],
      ["Received", omrInput(record.receivedBaisa)],
      ["Ledger Adjustments / Refund Credits", omrInput(snapshot.ledgerAdjustmentsBaisa ?? 0)],
      ["Balance at Issue", omrInput(record.balanceBaisa)],
    ];
  } else if (kind === "legal-fine" && record && "bookingSnapshot" in record) {
    d.title = "Legal Fine";
    d.number = `LF-${record.id.toUpperCase()}`;
    d.status = record.isDeleted ? "DELETED / HISTORY RETAINED" : "RECORDED";
    d.issuedAt = at(record.createdAt);
    const snap = record.bookingSnapshot;
    d.fields = Object.entries(snap).map(([k, value]) => [
      k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      value == null
        ? "—"
        : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
          ? at(value)
          : String(value),
    ]);
    d.fields.push(["Date From", at(record.dateFrom)], ["Date To", at(record.dateTo)]);
    d.charges = [{ id: record.id, label: record.details, amount: omrInput(record.amountBaisa) }];
    d.totals = [["Legal Fine Amount", omrInput(record.amountBaisa)]];
    d.remarks = record.remarks ?? "";
  } else if (kind === "receipt" && record && "receiptNumber" in record) {
    d.title = "Receipt";
    d.number = record.receiptNumber;
    d.status = record.kind;
    d.issuedAt = at(record.receivedAt);
    d.fields.push(["Payment Mode", record.method], ["Reference", record.reference ?? "—"]);
    d.charges = [
      {
        id: record.id,
        label: `${record.kind} — ${record.direction}`,
        amount: omrInput(record.amountBaisa),
      },
    ];
    d.totals = [["Amount", omrInput(record.amountBaisa)]];
    d.remarks = record.note ?? "";
  }
  return d;
}
