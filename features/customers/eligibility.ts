import "server-only";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { customerBlacklist } from "@/db/schema";

/** Call this inside the booking/rental confirmation transaction before any reservation is created. */
export async function assertCustomerCanBeBooked(customerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [entry] = await db
    .select({ reason: customerBlacklist.reason })
    .from(customerBlacklist)
    .where(
      and(
        eq(customerBlacklist.customerId, customerId),
        eq(customerBlacklist.isActive, true),
        or(isNull(customerBlacklist.startsAt), lte(customerBlacklist.startsAt, today)),
        or(isNull(customerBlacklist.endsAt), gte(customerBlacklist.endsAt, today)),
      ),
    )
    .limit(1);
  if (entry)
    throw new Error(`Booking blocked: this customer is blacklisted. Reason: ${entry.reason}`);
}
