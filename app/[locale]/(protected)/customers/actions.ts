"use server";
import { randomUUID } from "node:crypto";
import { and, count, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { auditLogs, customerBlacklist, customerDocuments, customers } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { customerSchema } from "@/lib/validation";

export async function saveCustomerAction(input: unknown, id?: string) {
  await requirePermission("customers", id ? "update" : "create");
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
    if (id)
      await db
        .update(customers)
        .set({ ...databaseValue, updatedAt: new Date() })
        .where(eq(customers.id, id));
    else
      await db.insert(customers).values({
        ...databaseValue,
        customerNumber: `CU-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      });
    revalidatePath("/en/customers");
    return {
      ok: true,
      message: id ? "Customer updated successfully." : "Customer created successfully.",
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
export async function blacklistCustomerAction(input: {
  customerId: string;
  reason: string;
  description: string;
  startsAt?: string;
  endsAt?: string;
}) {
  const actor = await requirePermission("customers", "update");
  if (!input.customerId || !input.reason.trim() || !input.description.trim())
    return { ok: false, message: "Select a customer and enter a reason and description." };
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt)
    return { ok: false, message: "End date cannot be before the start date." };
  const [active] = await db
    .select({ id: customerBlacklist.id })
    .from(customerBlacklist)
    .where(
      and(eq(customerBlacklist.customerId, input.customerId), eq(customerBlacklist.isActive, true)),
    )
    .limit(1);
  if (active) return { ok: false, message: "This customer is already on the active blacklist." };
  await db.insert(customerBlacklist).values({
    customerId: input.customerId,
    reason: input.reason.trim(),
    description: input.description.trim(),
    startsAt: input.startsAt || null,
    endsAt: input.endsAt || null,
    actorId: actor.id,
  });
  revalidatePath("/en/customers");
  revalidatePath("/en/customers/blacklist");
  return {
    ok: true,
    message: "Customer added to blacklist.",
    id: (
      await db
        .select({ id: customerBlacklist.id })
        .from(customerBlacklist)
        .where(
          and(
            eq(customerBlacklist.customerId, input.customerId),
            eq(customerBlacklist.isActive, true),
          ),
        )
        .limit(1)
    )[0]?.id,
  };
}
export async function unblacklistCustomerAction(id: string) {
  const actor = await requirePermission("customers", "update");
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
    event: "VEHICLE_UPDATED",
    entityType: "customer_blacklist",
    entityId: id,
    metadata: { active: false },
  });
  revalidatePath("/en/customers");
  revalidatePath("/en/customers/blacklist");
  return { ok: true, message: "Customer removed from the active blacklist." };
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
      event: "VEHICLE_UPDATED",
      entityType: "customer",
      entityId: id,
      metadata: { active },
    });
  });
  revalidatePath("/en/customers");
  return {
    ok: true,
    message: active ? "Customer activated successfully." : "Customer deactivated successfully.",
  };
}
export async function deleteCustomerAction(id: string) {
  await requirePermission("customers", "delete");
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
  await db.delete(customers).where(eq(customers.id, id));
  revalidatePath("/en/customers");
  return { ok: true, message: "Customer deleted successfully." };
}
export async function searchCustomersAction(q: string) {
  await requirePermission("customers", "read");
  if (!q.trim()) return [];
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
          ilike(customers.name, `%${q}%`),
          ilike(customers.customerNumber, `%${q}%`),
          ilike(customers.mobile, `%${q}%`),
        ),
      ),
    )
    .limit(10);
}
