"use server";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditLogs,
  customerBlacklist,
  customerDocuments,
  customerLedger,
  customers,
  financeFines,
  payments,
  rentals,
  users,
  vehicleDamageEvidence,
  vehicleServices,
} from "@/db/schema";
import { can, requireIdentity, requirePermission } from "@/lib/auth";
import { validateEvidencePhoto } from "@/lib/image-file";
import { putPrivateCustomerDocument } from "@/lib/r2";
import { blacklistEntrySchema, customerSchema } from "@/lib/validation";

const uuidSchema = z.string().uuid();

function customerUniqueErrorMessage(error: unknown) {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error.cause as { code?: string; constraint?: string } | undefined)
      : undefined;
  const code =
    cause?.code ??
    (error && typeof error === "object" && "code" in error ? String(error.code) : undefined);
  const constraint = cause?.constraint ?? "";
  if (code === "23505") {
    if (constraint.includes("mobile")) return "A customer with that mobile number already exists.";
    if (constraint.includes("driving_licence"))
      return "A customer with that driving licence number already exists.";
    if (constraint.includes("civil_id"))
      return "A customer with that Civil ID number already exists.";
    if (constraint.includes("passport"))
      return "A customer with that passport number already exists.";
    return "A customer with those unique details already exists.";
  }
  return "Could not save customer.";
}

function revalidateCustomerPaths() {
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/customers`);
    revalidatePath(`/${locale}/customers/blacklist`);
  }
}

export async function saveCustomerAction(input: unknown, id?: string) {
  const actor = await requirePermission("customers", id ? "update" : "create");
  if (id && !uuidSchema.safeParse(id).success)
    return { ok: false, message: "Invalid customer identifier." };
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the customer details." };
  const value = parsed.data;
  const databaseValue = {
    ...value,
    email: value.email?.trim() || null,
    remarks: value.remarks?.trim() || null,
    civilIdNumber: value.civilIdNumber?.trim() || null,
    passportNumber: value.passportNumber?.trim() || null,
    visaNumber: value.visaNumber?.trim() || null,
    sponsorDetails: value.sponsorDetails?.trim() || null,
    civilIdExpiry: value.civilIdExpiry ? value.civilIdExpiry.toISOString().slice(0, 10) : null,
    passportExpiry: value.passportExpiry ? value.passportExpiry.toISOString().slice(0, 10) : null,
    visaExpiry: value.visaExpiry ? value.visaExpiry.toISOString().slice(0, 10) : null,
    drivingLicenceExpiry: value.drivingLicenceExpiry.toISOString().slice(0, 10),
  };
  try {
    if (id) {
      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .update(customers)
          .set({ ...databaseValue, updatedAt: new Date() })
          .where(eq(customers.id, id))
          .returning({ id: customers.id });
        if (!rows[0]) return null;
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          event: "CUSTOMER_UPDATED",
          entityType: "customer",
          entityId: id,
          metadata: { name: value.name, mobile: value.mobile },
        });
        return rows[0];
      });
      if (!updated) return { ok: false, message: "Customer not found." };
      revalidateCustomerPaths();
      return { ok: true, id, message: "Customer updated successfully." };
    }
    const customerNumber = `CU-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const [created] = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(customers)
        .values({ ...databaseValue, customerNumber })
        .returning({ id: customers.id });
      if (inserted[0])
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          event: "CUSTOMER_CREATED",
          entityType: "customer",
          entityId: inserted[0].id,
          metadata: { name: value.name, mobile: value.mobile, customerNumber },
        });
      return inserted;
    });
    revalidateCustomerPaths();
    return {
      ok: true,
      id: created.id,
      message: "Customer details saved. Add the required documents.",
    };
  } catch (error) {
    return {
      ok: false,
      message: customerUniqueErrorMessage(error),
    };
  }
}
export async function uploadCustomerDocumentAction(
  customerId: string,
  type: "LICENCE_FRONT" | "LICENCE_BACK" | "SIGNATURE",
  file: File,
  width: number,
  height: number,
) {
  const actor = await requireIdentity();
  if (!can(actor, "customers", "update") && !can(actor, "customers", "create"))
    throw new Error("FORBIDDEN");
  if (!uuidSchema.safeParse(customerId).success)
    return { ok: false, message: "Invalid customer identifier." };
  if (!["LICENCE_FRONT", "LICENCE_BACK", "SIGNATURE"].includes(type))
    return { ok: false, message: "Invalid document type." };
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    return { ok: false, message: "The document image is invalid." };
  const [customerExists] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customerExists) return { ok: false, message: "Customer not found." };
  try {
    await validateEvidencePhoto(file);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Use a JPEG, PNG, or WebP image up to 5 MB.",
    };
  }
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `customers/${customerId}/${type.toLowerCase()}/${randomUUID()}.${extension}`;
  try {
    await putPrivateCustomerDocument(key, file);
    await db
      .insert(customerDocuments)
      .values({
        customerId,
        type,
        objectKey: key,
        contentType: file.type,
        sizeBytes: file.size,
        width,
        height,
      })
      .onConflictDoUpdate({
        target: [customerDocuments.customerId, customerDocuments.type],
        set: {
          objectKey: key,
          contentType: file.type,
          sizeBytes: file.size,
          width,
          height,
          updatedAt: new Date(),
        },
      });
    revalidateCustomerPaths();
    return { ok: true, message: "Document uploaded." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name !== "DrizzleQueryError"
          ? error.message
          : "Could not upload document.",
    };
  }
}
export async function blacklistCustomerAction(input: {
  customerId: string;
  reason: string;
  description: string;
  startsAt?: string;
  endsAt?: string;
}) {
  const actor = await requirePermission("customers", "update");
  if (!uuidSchema.safeParse(input.customerId).success)
    return { ok: false, message: "Select a valid customer." };
  const parsed = blacklistEntrySchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter a reason and description.",
    };
  const value = parsed.data;
  const [active] = await db
    .select({ id: customerBlacklist.id })
    .from(customerBlacklist)
    .where(
      and(eq(customerBlacklist.customerId, input.customerId), eq(customerBlacklist.isActive, true)),
    )
    .limit(1);
  if (active) return { ok: false, message: "This customer is already on the active blacklist." };
  const [created] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(customerBlacklist)
      .values({
        customerId: input.customerId,
        reason: value.reason,
        description: value.description,
        startsAt: value.startsAt ?? null,
        endsAt: value.endsAt ?? null,
        actorId: actor.id,
      })
      .returning({ id: customerBlacklist.id });
    if (inserted[0])
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        event: "BLACKLIST_CREATED",
        entityType: "customer_blacklist",
        entityId: inserted[0].id,
        metadata: {
          action: "BLACKLIST_CREATED",
          customerId: input.customerId,
          reason: value.reason,
        },
      });
    return inserted;
  });
  revalidateCustomerPaths();
  return {
    ok: true,
    message: "Customer added to blacklist.",
    id: created?.id,
  };
}
export async function updateBlacklistEntryAction(input: {
  id: string;
  reason: string;
  description: string;
  startsAt?: string;
  endsAt?: string;
}) {
  const actor = await requirePermission("customers", "update");
  if (!uuidSchema.safeParse(input.id).success)
    return { ok: false, message: "Invalid blacklist record." };
  const parsed = blacklistEntrySchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter valid blacklist details.",
    };
  const value = parsed.data;
  const [existing] = await db
    .select()
    .from(customerBlacklist)
    .where(eq(customerBlacklist.id, input.id))
    .limit(1);
  if (!existing) return { ok: false, message: "Blacklist entry not found." };
  await db.transaction(async (tx) => {
    await tx
      .update(customerBlacklist)
      .set({
        reason: value.reason,
        description: value.description,
        startsAt: value.startsAt ?? null,
        endsAt: value.endsAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(customerBlacklist.id, input.id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BLACKLIST_UPDATED",
      entityType: "customer_blacklist",
      entityId: input.id,
      metadata: {
        action: "BLACKLIST_UPDATED",
        before: {
          reason: existing.reason,
          description: existing.description,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
        },
        after: {
          reason: value.reason,
          description: value.description,
          startsAt: value.startsAt ?? null,
          endsAt: value.endsAt ?? null,
        },
      },
    });
  });
  revalidateCustomerPaths();
  return { ok: true, message: "Blacklist entry updated successfully." };
}
export async function unblacklistCustomerAction(id: string) {
  const actor = await requirePermission("customers", "update");
  if (!uuidSchema.safeParse(id).success) return { ok: false, message: "Invalid blacklist record." };
  const [entry] = await db
    .select({ id: customerBlacklist.id })
    .from(customerBlacklist)
    .where(eq(customerBlacklist.id, id))
    .limit(1);
  if (!entry) return { ok: false, message: "Blacklist entry not found." };
  await db.transaction(async (tx) => {
    await tx
      .update(customerBlacklist)
      .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(customerBlacklist.id, id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "BLACKLIST_REMOVED",
      entityType: "customer_blacklist",
      entityId: id,
      metadata: { action: "BLACKLIST_REMOVED", active: false },
    });
  });
  revalidateCustomerPaths();
  return { ok: true, message: "Customer removed from the active blacklist." };
}
export async function getCustomerBlacklistHistoryAction(customerId: string) {
  await requirePermission("customers", "read");
  if (!uuidSchema.safeParse(customerId).success) throw new Error("Invalid customer.");
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      customerNumber: customers.customerNumber,
      mobile: customers.mobile,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) throw new Error("Customer not found.");
  const entries = await db
    .select({
      id: customerBlacklist.id,
      reason: customerBlacklist.reason,
      description: customerBlacklist.description,
      startsAt: customerBlacklist.startsAt,
      endsAt: customerBlacklist.endsAt,
      isActive: customerBlacklist.isActive,
      createdAt: customerBlacklist.createdAt,
      updatedAt: customerBlacklist.updatedAt,
      deactivatedAt: customerBlacklist.deactivatedAt,
      recordedBy: users.displayName,
    })
    .from(customerBlacklist)
    .leftJoin(users, eq(users.id, customerBlacklist.actorId))
    .where(eq(customerBlacklist.customerId, customerId))
    .orderBy(desc(customerBlacklist.createdAt));
  return {
    customer,
    entries: entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      deactivatedAt: entry.deactivatedAt?.toISOString() ?? null,
    })),
  };
}
export async function getCustomerDetailsAction(id: string) {
  const actor = await requirePermission("customers", "read");
  if (!uuidSchema.safeParse(id).success) throw new Error("Invalid customer.");
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) throw new Error("Customer not found.");
  const isSuper = actor.role === "SUPER_ADMIN";
  const ledgerBranchScope = isSuper
    ? undefined
    : actor.branchIds.length
      ? or(inArray(rentals.branchId, actor.branchIds), inArray(payments.branchId, actor.branchIds))
      : sql`false`;
  const [documents, blacklist, activeRentals, ledgerSum] = await Promise.all([
    db
      .select({
        id: customerDocuments.id,
        type: customerDocuments.type,
        contentType: customerDocuments.contentType,
        sizeBytes: customerDocuments.sizeBytes,
        width: customerDocuments.width,
        height: customerDocuments.height,
      })
      .from(customerDocuments)
      .where(eq(customerDocuments.customerId, id)),
    db
      .select()
      .from(customerBlacklist)
      .where(eq(customerBlacklist.customerId, id))
      .orderBy(customerBlacklist.createdAt),
    db
      .select({
        id: rentals.id,
        agreementNumber: rentals.agreementNumber,
        expectedReturnAt: rentals.expectedReturnAt,
      })
      .from(rentals)
      .where(
        and(
          eq(rentals.customerId, id),
          eq(rentals.status, "ACTIVE"),
          isSuper
            ? undefined
            : actor.branchIds.length
              ? inArray(rentals.branchId, actor.branchIds)
              : sql`false`,
        ),
      ),
    db
      .select({
        balance: sql<number>`coalesce(sum(${customerLedger.debitBaisa}::bigint - ${customerLedger.creditBaisa}::bigint), 0)::bigint`,
      })
      .from(customerLedger)
      .leftJoin(rentals, eq(rentals.id, customerLedger.rentalId))
      .leftJoin(payments, eq(payments.id, customerLedger.paymentId))
      .where(and(eq(customerLedger.customerId, id), ledgerBranchScope)),
  ]);
  return {
    ...customer,
    documents,
    blacklist,
    activeRentals: activeRentals.map((r) => ({
      ...r,
      expectedReturnAt: r.expectedReturnAt.toISOString(),
    })),
    balance: Number(ledgerSum[0]?.balance ?? 0),
  };
}
export async function setCustomerActiveAction(id: string, active: boolean) {
  const actor = await requirePermission("customers", "update");
  if (!uuidSchema.safeParse(id).success)
    return { ok: false, message: "Invalid customer identifier." };
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return { ok: false, message: "Customer not found." };
  if (!active) {
    const [commitment] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.customerId, id), inArray(rentals.status, ["ACTIVE", "RESERVED"])))
      .limit(1);
    if (commitment)
      return {
        ok: false,
        message: "Customer has an active rental or pending reservation and cannot be deactivated.",
      };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(customers)
      .set({ isActive: active, deactivatedAt: active ? null : new Date(), updatedAt: new Date() })
      .where(eq(customers.id, id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: active ? "CUSTOMER_UPDATED" : "CUSTOMER_DEACTIVATED",
      entityType: "customer",
      entityId: id,
      metadata: { active, name: customer.name, customerNumber: customer.customerNumber },
    });
  });
  revalidateCustomerPaths();
  return {
    ok: true,
    message: active ? "Customer activated successfully." : "Customer deactivated successfully.",
  };
}
export async function deleteCustomerAction(id: string) {
  const actor = await requirePermission("customers", "delete");
  if (!uuidSchema.safeParse(id).success)
    return { ok: false, message: "Invalid customer identifier." };
  const [customerRow] = await db
    .select({ name: customers.name, customerNumber: customers.customerNumber })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customerRow) return { ok: false, message: "Customer not found." };
  const [
    documentCounts,
    blacklistCounts,
    rentalCounts,
    paymentCounts,
    ledgerCounts,
    fineCounts,
    serviceCounts,
    damageCounts,
  ] = await Promise.all([
    db.select({ n: count() }).from(customerDocuments).where(eq(customerDocuments.customerId, id)),
    db.select({ n: count() }).from(customerBlacklist).where(eq(customerBlacklist.customerId, id)),
    db.select({ n: count() }).from(rentals).where(eq(rentals.customerId, id)),
    db.select({ n: count() }).from(payments).where(eq(payments.customerId, id)),
    db.select({ n: count() }).from(customerLedger).where(eq(customerLedger.customerId, id)),
    db.select({ n: count() }).from(financeFines).where(eq(financeFines.customerId, id)),
    db.select({ n: count() }).from(vehicleServices).where(eq(vehicleServices.customerId, id)),
    db
      .select({ n: count() })
      .from(vehicleDamageEvidence)
      .where(eq(vehicleDamageEvidence.customerId, id)),
  ]);
  if (
    (documentCounts[0]?.n ?? 0) ||
    (blacklistCounts[0]?.n ?? 0) ||
    (rentalCounts[0]?.n ?? 0) ||
    (paymentCounts[0]?.n ?? 0) ||
    (ledgerCounts[0]?.n ?? 0) ||
    (fineCounts[0]?.n ?? 0) ||
    (serviceCounts[0]?.n ?? 0) ||
    (damageCounts[0]?.n ?? 0)
  )
    return {
      ok: false,
      message:
        "This customer has operational, financial, document, or blacklist history and cannot be deleted. Deactivate the customer instead.",
    };
  try {
    await db.transaction(async (tx) => {
      await tx.delete(customers).where(eq(customers.id, id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        event: "CUSTOMER_DELETED",
        entityType: "customer",
        entityId: id,
        metadata: { name: customerRow.name, customerNumber: customerRow.customerNumber },
      });
    });
  } catch {
    return {
      ok: false,
      message:
        "This customer has linked records and cannot be deleted. Deactivate the customer instead.",
    };
  }
  revalidateCustomerPaths();
  return { ok: true, message: "Customer deleted successfully." };
}
export async function searchCustomersAction(q: string) {
  await requirePermission("customers", "read");
  const term = q.trim();
  if (!term) return [];
  return db
    .select({
      id: customers.id,
      name: customers.name,
      number: customers.customerNumber,
      mobile: customers.mobile,
    })
    .from(customers)
    .where(
      and(
        eq(customers.isActive, true),
        or(
          ilike(customers.name, `%${term}%`),
          ilike(customers.customerNumber, `%${term}%`),
          ilike(customers.mobile, `%${term}%`),
          ilike(customers.civilIdNumber, `%${term}%`),
          ilike(customers.passportNumber, `%${term}%`),
          ilike(customers.drivingLicenceNumber, `%${term}%`),
        ),
      ),
    )
    .limit(10);
}
