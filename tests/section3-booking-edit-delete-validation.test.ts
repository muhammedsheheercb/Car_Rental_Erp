import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerLedger, rentalCharges, rentals } from "@/db/schema";
import { deleteBooking, updateBooking } from "@/features/rentals/lifecycle";
import type { Identity } from "@/lib/auth";
import { bookingUpdateSchema, sanitizeReturnTo } from "@/lib/validation";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; op: "insert" | "update" | "delete"; value?: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ putPrivateCustomerDocument: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  can: (actor: Identity, module: string, action: string, branch?: string) =>
    actor.role === "SUPER_ADMIN" ||
    ((!branch || actor.branchIds.includes(branch)) && actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const rows = fixture.reads.shift() ?? [];
    const query = {
      from: () => query,
      where: () => query,
      limit: () => Promise.resolve(rows),
      for: () => Promise.resolve(rows),
    };
    return query;
  };
  return {
    db: {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          select,
          insert: (table: unknown) => ({
            values: async (value: unknown) => {
              fixture.writes.push({ table, op: "insert", value });
            },
          }),
          update: (table: unknown) => ({
            set: (value: unknown) => ({
              where: async () => {
                fixture.writes.push({ table, op: "update", value });
              },
            }),
          }),
          delete: (table: unknown) => ({
            where: async () => {
              fixture.writes.push({ table, op: "delete" });
            },
          }),
        }),
    },
  };
});

const ID = "00000000-0000-4000-8000-000000000001";
const BRANCH_A = "00000000-0000-4000-8000-000000000010";
const BRANCH_B = "00000000-0000-4000-8000-000000000020";

const superAdmin: Identity = {
  id: ID,
  username: "owner",
  displayName: "System Owner",
  role: "SUPER_ADMIN",
  branchIds: [],
  permissions: new Set(),
  mustChangePassword: false,
};

const baseRental = {
  id: ID,
  agreementNumber: "OMR-20261123-TEST0001",
  customerId: ID,
  vehicleId: ID,
  branchId: BRANCH_A,
  pickupBranchId: BRANCH_A,
  returnBranchId: BRANCH_A,
  status: "RESERVED" as const,
  startsAt: new Date("2026-12-01T06:00:00Z"),
  expectedReturnAt: new Date("2026-12-02T06:00:00Z"),
  pricingPeriod: "DAILY" as const,
  rentDuration: 1,
  additionalDayRentBaisa: 20000,
  dailyRateBaisa: 20000,
  includedKm: 200,
  freeKm: 0,
  openKm: false,
  excessKmChargeBaisa: 100,
  lateFeeBaisa: 2000,
  pickupOdometerKm: 10000,
  subtotalBaisa: 20000,
  taxBaisa: 0,
  totalBaisa: 20000,
};

const baseVehicle = { id: ID, currentOdometerKm: 10000 };

describe("sanitizeReturnTo & bookingUpdateSchema (§21)", () => {
  it("accepts only safe same-origin relative returnTo paths", () => {
    expect(sanitizeReturnTo("/en/rentals")).toBe("/en/rentals");
    expect(sanitizeReturnTo("/ar/rentals?vehicleId=123")).toBe("/ar/rentals?vehicleId=123");
    expect(sanitizeReturnTo("https://evil.example/phish")).toBeUndefined();
    expect(sanitizeReturnTo("//evil.example/phish")).toBeUndefined();
    expect(sanitizeReturnTo("/en/rentals\r\nSet-Cookie: bad")).toBeUndefined();
    expect(sanitizeReturnTo("/en\\rentals")).toBeUndefined();
  });

  it("validates booking edit form payloads", () => {
    const parsed = bookingUpdateSchema.safeParse({
      rentalId: ID,
      pickupBranchId: BRANCH_A,
      returnBranchId: BRANCH_B,
      startsAt: "2026-12-05T10:00",
      pricingPeriod: "DAILY",
      rentDuration: "3",
      pickupOdometerKm: "10500",
      freeKm: "50",
      openKm: "on",
      notes: "  Airport delivery  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.openKm).toBe(true);
      expect(parsed.data.notes).toBe("Airport delivery");
      expect(parsed.data.rentDuration).toBe(3);
    }
  });
});

describe("updateBooking & deleteBooking lifecycle rules (§21)", () => {
  beforeEach(() => {
    fixture.reads = [];
    fixture.writes = [];
  });

  it("updates a RESERVED booking duration and posts a rent adjustment to charges and ledger", async () => {
    fixture.reads = [[baseRental], [baseVehicle], [baseRental], []];
    await updateBooking(
      {
        rentalId: ID,
        pickupBranchId: BRANCH_A,
        returnBranchId: BRANCH_A,
        startsAt: "2026-12-01T10:00",
        pricingPeriod: "DAILY",
        rentDuration: 2,
        pickupOdometerKm: 10000,
        freeKm: 25,
        openKm: false,
        notes: "Extended reservation to 2 days",
      },
      superAdmin,
    );
    expect(
      fixture.writes.some(
        (w) =>
          w.table === rentalCharges &&
          w.op === "insert" &&
          (w.value as { amountBaisa: number }).amountBaisa === 20000,
      ),
    ).toBe(true);
    expect(
      fixture.writes.some(
        (w) =>
          w.table === customerLedger &&
          w.op === "insert" &&
          (w.value as { debitBaisa: number }).debitBaisa === 20000,
      ),
    ).toBe(true);
  });

  it("blocks RESERVED booking edit when updated dates conflict with another booking", async () => {
    fixture.reads = [[baseRental], [baseVehicle], [baseRental], [{ id: "conflict-id" }]];
    await expect(
      updateBooking(
        {
          rentalId: ID,
          pickupBranchId: BRANCH_A,
          returnBranchId: BRANCH_A,
          startsAt: "2026-12-01T10:00",
          pricingPeriod: "DAILY",
          rentDuration: 3,
          pickupOdometerKm: 10000,
          freeKm: 0,
          openKm: false,
        },
        superAdmin,
      ),
    ).rejects.toThrow("conflict");
  });

  it("allows safe updates on an ACTIVE booking without altering start dates", async () => {
    const activeRental = { ...baseRental, status: "ACTIVE" as const };
    fixture.reads = [[activeRental], [baseVehicle], [activeRental]];
    await updateBooking(
      {
        rentalId: ID,
        pickupBranchId: BRANCH_A,
        returnBranchId: BRANCH_B,
        freeKm: 100,
        openKm: true,
        notes: "Return at branch B",
      },
      superAdmin,
    );
    const rentalUpdate = fixture.writes.find((w) => w.table === rentals && w.op === "update");
    expect(rentalUpdate?.value).toMatchObject({
      returnBranchId: BRANCH_B,
      freeKm: 100,
      openKm: true,
    });
  });

  it("deletes a clean RESERVED booking with no financial or operational records", async () => {
    fixture.reads = [[baseRental], [baseVehicle], [baseRental], [], [], [], [], [], [], [], []];
    await deleteBooking(ID, superAdmin);
    expect(fixture.writes.some((w) => w.table === rentals && w.op === "delete")).toBe(true);
    expect(fixture.writes.some((w) => w.table === customerLedger && w.op === "delete")).toBe(true);
  });

  it("blocks deleting a RESERVED booking that already has a payment", async () => {
    fixture.reads = [
      [baseRental],
      [baseVehicle],
      [baseRental],
      [{ id: "payment-1" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ];
    await expect(deleteBooking(ID, superAdmin)).rejects.toThrow("cannot be deleted");
    expect(fixture.writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("blocks deleting an ACTIVE booking and enforces rentals:delete permission", async () => {
    const activeRental = { ...baseRental, status: "ACTIVE" as const };
    fixture.reads = [[activeRental], [baseVehicle], [activeRental]];
    await expect(deleteBooking(ID, superAdmin)).rejects.toThrow("Only pending reservations");

    const staffWithoutDelete: Identity = {
      ...superAdmin,
      role: "USER",
      branchIds: [BRANCH_A],
      permissions: new Set(["rentals:read", "rentals:update"]),
    };
    fixture.reads = [[baseRental]];
    await expect(deleteBooking(ID, staffWithoutDelete)).rejects.toThrow("FORBIDDEN");
  });
});
