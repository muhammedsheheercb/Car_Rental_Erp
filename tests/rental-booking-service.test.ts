import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerLedger, payments, rentals } from "@/db/schema";
import { createReservation } from "@/features/rentals/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
  committed: false,
  failPayment: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/customers/eligibility", () => ({ assertCustomerCanBeBooked: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  can: (actor: Identity, module: string, action: string, branchId?: string) =>
    actor.role === "SUPER_ADMIN" ||
    ((!branchId || actor.branchIds.includes(branchId)) &&
      actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => {
          const result = fixture.reads.shift() ?? [];
          const query = {
            from: () => query,
            where: () => query,
            limit: () => Promise.resolve(result),
            for: () => Promise.resolve(result),
          };
          return query;
        },
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => {
            const execute = async () => {
              if (fixture.failPayment && table === payments)
                throw new Error("Receipt storage failed");
              fixture.writes.push({ table, value });
              return [{ ...value, id: "record-id" }];
            };
            return {
              returning: execute,
              // biome-ignore lint/suspicious/noThenProperty: Drizzle insert builders are intentionally awaitable.
              then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
                execute().then(resolve, reject),
            };
          },
        }),
      };
      try {
        const result = await callback(tx);
        fixture.committed = true;
        return result;
      } catch (error) {
        fixture.writes = [];
        throw error;
      }
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const input = {
  customerId: id,
  vehicleId: id,
  branchId: id,
  pickupBranchId: id,
  returnBranchId: id,
  startsAt: "2026-08-22T14:30",
  pricingPeriod: "WEEKLY",
  rentDuration: "2",
  dailyRateBaisa: "100000",
  includedKm: "200",
  freeKm: "50",
  pickupOdometerKm: "1000",
  excessKmChargeBaisa: "100",
  lateFeeBaisa: "0",
  depositBaisa: "10000",
  downPaymentBaisa: "30000",
  paymentMode: "CARD",
};
const actor: Identity = {
  id,
  username: "admin",
  displayName: "Admin",
  role: "SUPER_ADMIN",
  branchIds: [],
  permissions: new Set(),
  mustChangePassword: false,
};
beforeEach(() => {
  fixture.reads = [
    [{ id, isActive: true, status: "AVAILABLE", branchId: id, currentOdometerKm: 1000 }],
    [
      {
        listRentBaisa: 100000,
        minimumRentBaisa: 80000,
        includedKm: 200,
        excessKmChargeBaisa: 100,
        lateFeeBaisa: 0,
      },
    ],
    [],
    [{ listRentBaisa: 20000 }],
  ];
  fixture.writes = [];
  fixture.committed = false;
  fixture.failPayment = false;
});
describe("reservation financial workflow", () => {
  it("records a payment receipt and ledger credit linked to the reservation and actor", async () => {
    await createReservation(
      { ...input, createdBy: "forged-user", expectedReturnAt: "1900-01-01" },
      actor,
    );
    const booking = fixture.writes.find((write) => write.table === rentals)?.value;
    expect(booking?.createdBy).toBe(actor.id);
    expect(booking?.expectedReturnAt).toEqual(new Date("2026-09-05T10:30:00Z"));
    expect(booking?.totalBaisa).toBe(200000);
    const receipt = fixture.writes.find((write) => write.table === payments)?.value;
    expect(receipt).toMatchObject({
      rentalId: "record-id",
      recordedBy: actor.id,
      amountBaisa: 30000,
      method: "CARD",
      direction: "RECEIPT",
    });
    expect(
      fixture.writes.find(
        (write) => write.table === customerLedger && write.value.type === "PAYMENT",
      )?.value,
    ).toMatchObject({ rentalId: "record-id", paymentId: "record-id", creditBaisa: 30000 });
    expect(fixture.committed).toBe(true);
  });
  it("creates no receipt for zero down payment", async () => {
    await createReservation({ ...input, downPaymentBaisa: "0" }, actor);
    expect(fixture.writes.some((write) => write.table === payments)).toBe(false);
  });
  it("rejects overpayment before writing a reservation or receipt", async () => {
    await expect(
      createReservation({ ...input, downPaymentBaisa: "210001" }, actor),
    ).rejects.toThrow("Down payment");
    expect(fixture.writes).toHaveLength(0);
    expect(fixture.committed).toBe(false);
  });
  it("rolls back the booking when receipt creation fails", async () => {
    fixture.failPayment = true;
    await expect(createReservation(input, actor)).rejects.toThrow("Receipt storage failed");
    expect(fixture.committed).toBe(false);
    expect(fixture.writes).toHaveLength(0);
  });
  it("rejects reservations/rentals reported by the locked conflict query", async () => {
    fixture.reads[2] = [{ id: "conflicting-reservation" }];
    await expect(createReservation(input, actor)).rejects.toThrow("already reserved");
    expect(fixture.writes).toHaveLength(0);
  });
  it("rejects stale configured KM allowances", async () => {
    await expect(createReservation({ ...input, includedKm: "201" }, actor)).rejects.toThrow(
      "pricing has changed",
    );
  });
  it("requires an admin role for price overrides even with a granted override permission", async () => {
    const user = {
      ...actor,
      role: "USER" as const,
      branchIds: [id],
      permissions: new Set(["rentals:create", "rentals:override_price"]),
    };
    await expect(createReservation({ ...input, dailyRateBaisa: "90000" }, user)).rejects.toThrow(
      "authorized admin",
    );
  });
  it("blocks forged branch access", async () => {
    const user = {
      ...actor,
      role: "USER" as const,
      branchIds: [],
      permissions: new Set(["rentals:create"]),
    };
    await expect(createReservation(input, user)).rejects.toThrow("FORBIDDEN");
  });
});
