import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { branches, customers, rentals, users, vehicles } from "@/db/schema";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";
import type { Identity } from "@/lib/auth";
export async function bookingRows(actor: Identity) {
  return db
    .select({
      rental: rentals,
      customer: customers,
      vehicle: vehicles,
      branch: branches.name,
      user: users.displayName,
    })
    .from(rentals)
    .innerJoin(customers, eq(customers.id, rentals.customerId))
    .innerJoin(vehicles, eq(vehicles.id, rentals.vehicleId))
    .innerJoin(branches, eq(branches.id, rentals.branchId))
    .innerJoin(users, eq(users.id, rentals.createdBy))
    .where(actor.role === "SUPER_ADMIN" ? undefined : inArray(rentals.branchId, actor.branchIds));
}
export function bookingOption(row: Awaited<ReturnType<typeof bookingRows>>[number]) {
  const { rental: r, customer: c, vehicle: v } = row;
  return {
    id: r.id,
    name: `${r.agreementNumber} · ${c.name} · ${v.vehicleNumber} · ${v.registrationNumber}`,
    vehicleId: v.id,
    from: formatOmanDateTime(r.startsAt),
    to: formatOmanDateTime(r.actualReturnAt ?? r.expectedReturnAt),
    snapshot: {
      "Booking Number": r.agreementNumber,
      "Out Date / Time (Oman)": formatOmanDateTime(r.startsAt),
      "Registration Number": v.registrationNumber,
      "Customer Name": c.name,
      Address: c.address,
      Mobile: c.mobile,
      "Starting KM": r.pickupOdometerKm,
      User: row.user,
      "Return Date (Oman)": formatOmanDateTime(r.actualReturnAt ?? r.expectedReturnAt),
      "Ending KM": r.returnOdometerKm,
      Branch: row.branch,
    },
  };
}
export const financeModules: Record<
  string,
  { title: string; kind: "ADVANCE" | "RECEIPT" | "PAYBACK" | "NORMAL" | "LEGAL" }
> = {
  advance: { title: "Advance", kind: "ADVANCE" },
  payback: { title: "Payback", kind: "PAYBACK" },
  receipts: { title: "Receipts", kind: "RECEIPT" },
  fine: { title: "Fine", kind: "NORMAL" },
  "legal-fine": { title: "Legal Fine", kind: "LEGAL" },
};
