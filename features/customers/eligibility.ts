import "server-only";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { customerBlacklist, customerDocuments, customers } from "@/db/schema";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";

/** Call this inside the booking/rental confirmation transaction before any reservation is created. */
type QueryExecutor = Pick<typeof db, "select">;
export async function assertCustomerCanBeBooked(customerId: string, executor: QueryExecutor = db) {
  const today = formatOmanDateTime(new Date()).slice(0, 10);
  const [customer] = await executor
    .select({
      licenceExpiry: customers.drivingLicenceExpiry,
      civilExpiry: customers.civilIdExpiry,
      passportExpiry: customers.passportExpiry,
      visaExpiry: customers.visaExpiry,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.isActive, true)))
    .limit(1);
  if (!customer) throw new Error("Booking blocked: customer is inactive or does not exist.");
  if (customer.licenceExpiry < today)
    throw new Error("Booking blocked: driving licence has expired.");
  const validIdentity = [customer.civilExpiry, customer.passportExpiry, customer.visaExpiry].some(
    (expiry) => expiry && expiry >= today,
  );
  if (!validIdentity)
    throw new Error("Booking blocked: a current Civil ID, passport, or visa is required.");
  const documents = await executor
    .select({ type: customerDocuments.type })
    .from(customerDocuments)
    .where(
      and(
        eq(customerDocuments.customerId, customerId),
        inArray(customerDocuments.type, ["LICENCE_FRONT", "LICENCE_BACK", "SIGNATURE"]),
      ),
    );
  const required = new Set(["LICENCE_FRONT", "LICENCE_BACK", "SIGNATURE"]);
  for (const document of documents) required.delete(document.type);
  if (required.size > 0)
    throw new Error(
      "Booking blocked: licence front/back images and customer signature are required.",
    );
  const [entry] = await executor
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
