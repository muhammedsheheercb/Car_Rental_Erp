"use server";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLogs, customerBlacklist, customerDocuments, customers, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { validateEvidencePhoto } from "@/lib/image-file";
import { putPrivateCustomerDocument } from "@/lib/r2";
import { blacklistEntrySchema, customerSchema } from "@/lib/validation";

const uuidSchema = z.string().uuid();

function revalidateCustomerPaths() {
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/customers`);
    revalidatePath(`/${locale}/customers/blacklist`);
  }
}

export async function saveCustomerAction(input: unknown, id?: string) {
  const actor = await requirePermission("customers", id ? "update" : "create");
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the customer details." };
  const value = parsed.data;
  const databaseValue = {
    ...value,
    email: value.email || null,
    civilIdExpiry: value.civilIdExpiry?.toISOString().slice(0, 10),
    passportExpiry: value.passportExpiry?.toISOString().slice(0, 10),
    visaExpiry: value.visaExpiry?.toISOString().slice(0, 10),
    drivingLicenceExpiry: value.drivingLicenceExpiry.toISOString().slice(0, 10),
  };
  try {
    if (id) {
      await db.transaction(async (tx) => {
        await tx
          .update(customers)
          .set({ ...databaseValue, updatedAt: new Date() })
          .where(eq(customers.id, id));
        await tx.insert(auditLogs).values({
          actorId: actor.id,
          event: "CUSTOMER_UPDATED",
          entityType: "customer",
          entityId: id,
          metadata: { name: value.name, mobile: value.mobile },
        });
      });
      revalidatePath("/en/customers");
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
    revalidatePath("/en/customers");
    return {
      ok: true,
      id: created.id,
      message: "Customer details saved. Add the required documents.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? "A customer with that mobile number already exists."
          : "Could not save customer.",
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
  await requirePermission("customers", "update");
  if (!uuidSchema.safeParse(customerId).success)
    return { ok: false, message: "Invalid customer identifier." };
  if (!["LICENCE_FRONT", "LICENCE_BACK", "SIGNATURE"].includes(type))
    return { ok: false, message: "Invalid document type." };
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    return { ok: false, message: "The document image is invalid." };
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
    revalidatePath("/en/customers");
    return { ok: true, message: "Document uploaded." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not upload document.",
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
  await db
    .update(customerBlacklist)
    .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(customerBlacklist.id, id));
  await db.insert(auditLogs).values({
    actorId: actor.id,
    event: "BLACKLIST_REMOVED",
    entityType: "customer_blacklist",
    entityId: id,
    metadata: { action: "BLACKLIST_REMOVED", active: false },
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
  await requirePermission("customers", "read");
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) throw new Error("Customer not found.");
  const [documents, blacklist] = await Promise.all([
    db.select().from(customerDocuments).where(eq(customerDocuments.customerId, id)),
    db
      .select()
      .from(customerBlacklist)
      .where(eq(customerBlacklist.customerId, id))
      .orderBy(customerBlacklist.createdAt),
  ]);
  return { ...customer, documents, blacklist, activeRentals: [], balance: 0 };
}
export async function setCustomerActiveAction(id: string, active: boolean) {
  const actor = await requirePermission("customers", "update");
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return { ok: false, message: "Customer not found." };
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
  revalidatePath("/en/customers");
  return {
    ok: true,
    message: active ? "Customer activated successfully." : "Customer deactivated successfully.",
  };
}
export async function deleteCustomerAction(id: string) {
  const actor = await requirePermission("customers", "delete");
  const [customerRow] = await db
    .select({ name: customers.name, customerNumber: customers.customerNumber })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  const [documentCounts, blacklistCounts] = await Promise.all([
    db
      .select({ documents: count() })
      .from(customerDocuments)
      .where(eq(customerDocuments.customerId, id)),
    db
      .select({ blacklist: count() })
      .from(customerBlacklist)
      .where(eq(customerBlacklist.customerId, id)),
  ]);
  if ((documentCounts[0]?.documents ?? 0) || (blacklistCounts[0]?.blacklist ?? 0))
    return {
      ok: false,
      message:
        "This customer has documents or blacklist history and cannot be deleted. Deactivate the customer instead.",
    };
  await db.transaction(async (tx) => {
    await tx.delete(customers).where(eq(customers.id, id));
    await tx.insert(auditLogs).values({
      actorId: actor.id,
      event: "CUSTOMER_DELETED",
      entityType: "customer",
      entityId: id,
      metadata: { name: customerRow?.name, customerNumber: customerRow?.customerNumber },
    });
  });
  revalidatePath("/en/customers");
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
