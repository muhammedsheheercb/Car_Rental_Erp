import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  customerLedger,
  rentalCancellations,
  rentalCharges,
  rentalExtensions,
  rentals,
  vehicleDamageEvidence,
} from "@/db/schema";
import {
  cancelAgreement,
  extendContract,
  recordDamage,
  returnContract,
} from "@/features/rentals/lifecycle";
import type { Identity } from "@/lib/auth";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
  committed: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({ putPrivateCustomerDocument: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  can: (actor: Identity, module: string, action: string, branch?: string) =>
    actor.role === "SUPER_ADMIN" ||
    ((!branch || actor.branchIds.includes(branch)) && actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const previousWrites = [...state.writes];
      const tx = {
        select: () => {
          const rows = state.reads.shift() ?? [];
          const query = {
            from: () => query,
            where: () => query,
            limit: () => Promise.resolve(rows),
            for: () => Promise.resolve(rows),
          };
          return query;
        },
        insert: (table: unknown) => ({
          values: async (value: Record<string, unknown>) => {
            state.writes.push({ table, value });
          },
        }),
        update: (table: unknown) => ({
          set: (value: Record<string, unknown>) => ({
            where: async () => {
              state.writes.push({ table, value });
            },
          }),
        }),
        delete: () => {
          throw new Error("Financial/history deletion is forbidden in lifecycle operations.");
        },
      };
      try {
        const result = await callback(tx);
        state.committed = true;
        return result;
      } catch (error) {
        state.writes = previousWrites;
        throw error;
      }
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const actor: Identity = {
  id,
  username: "admin",
  displayName: "Admin",
  role: "SUPER_ADMIN",
  branchIds: [],
  permissions: new Set(),
  mustChangePassword: false,
};
const now = new Date("2026-10-01T08:00:00Z");
const rental = {
  id,
  branchId: id,
  vehicleId: id,
  customerId: id,
  status: "ACTIVE",
  pricingPeriod: "DAILY",
  startsAt: new Date(now.getTime() - 86400000),
  expectedReturnAt: new Date(now.getTime() + 7200000),
  createdAt: new Date(now.getTime() - 600000),
  pickupOdometerKm: 1000,
  cancellationWindowMinutes: 15,
  dailyRateBaisa: 20000,
  additionalDayRentBaisa: 20000,
  subtotalBaisa: 20000,
  totalBaisa: 20000,
  taxBaisa: 0,
  rentDuration: 1,
  lateFeeBaisa: 2000,
  lateGraceMinutes: 60,
  lateWindowHours: 4,
  overdueFineBaisa: 5000,
  includedKm: 200,
  freeKm: 50,
  openKm: false,
  excessKmChargeBaisa: 100,
};
const vehicle = { id, currentOdometerKm: 1000, isActive: true, status: "INACTIVE" };
const prepare = (value = rental) => {
  state.reads = [[value], [vehicle], [value], []];
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  state.writes = [];
  state.committed = false;
  prepare();
});
afterEach(() => vi.useRealTimers());
describe("contract lifecycle transactions", () => {
  it("stores approved extension history, moves the deadline, and posts additional rent", async () => {
    await extendContract(
      { rentalId: id, duration: 2, remarks: "Approved customer request", additionalRentBaisa: 0 },
      actor,
    );
    expect(state.writes.find((write) => write.table === rentalExtensions)?.value).toMatchObject({
      previousExpectedReturnAt: rental.expectedReturnAt,
      newExpectedReturnAt: new Date("2026-10-03T10:00:00Z"),
      additionalRentBaisa: 40000,
      approvedBy: id,
      duration: 2,
    });
    expect(state.writes.find((write) => write.table === rentals)?.value).toMatchObject({
      totalBaisa: 60000,
      rentDuration: 3,
    });
    expect(state.writes.find((write) => write.table === rentalCharges)?.value).toMatchObject({
      component: "RENTAL",
      amountBaisa: 40000,
    });
    expect(state.writes.find((write) => write.table === customerLedger)?.value).toMatchObject({
      debitBaisa: 40000,
    });
  });
  it("rejects extensions without approval or for inactive contracts", async () => {
    const user = {
      ...actor,
      role: "USER" as const,
      branchIds: [id],
      permissions: new Set(["rentals:update"]),
    };
    await expect(
      extendContract({ rentalId: id, duration: 1, remarks: "Request" }, user),
    ).rejects.toThrow("approval");
    prepare({ ...rental, status: "RESERVED" });
    await expect(
      extendContract({ rentalId: id, duration: 1, remarks: "Request" }, actor),
    ).rejects.toThrow("active");
  });
  it("rejects conflicting extensions without posting charges", async () => {
    state.reads[3] = [{ id: "another-reservation" }];
    await expect(
      extendContract({ rentalId: id, duration: 1, remarks: "Request" }, actor),
    ).rejects.toThrow("conflicts");
    expect(state.writes).toHaveLength(0);
  });
  it("cancels with history while never deleting any existing financial entries", async () => {
    await cancelAgreement(
      {
        rentalId: id,
        confirmed: "on",
        startingKm: 1000,
        endingKm: 1100,
        remarks: "Customer request",
      },
      actor,
    );
    expect(state.writes.find((write) => write.table === rentalCancellations)?.value).toMatchObject({
      previousStatus: "ACTIVE",
      remarks: "Customer request",
      cancelledBy: id,
      overridden: false,
    });
    expect(state.writes.find((write) => write.table === rentals)?.value).toMatchObject({
      status: "CANCELLED",
    });
    expect(
      state.writes.some((write) => write.table === rentalCharges || write.table === customerLedger),
    ).toBe(false);
  });
  it("enforces normal-user cutoff and allows an audited admin override", async () => {
    const old = { ...rental, createdAt: new Date(now.getTime() - 900001) };
    const input = {
      rentalId: id,
      confirmed: "on",
      startingKm: 1000,
      endingKm: 1000,
      remarks: "Request",
    };
    const user = {
      ...actor,
      role: "USER" as const,
      branchIds: [id],
      permissions: new Set(["rentals:update"]),
    };
    prepare(old);
    await expect(cancelAgreement(input, user)).rejects.toThrow("expired");
    prepare(old);
    await cancelAgreement(input, actor);
    expect(
      state.writes.find((write) => write.table === rentalCancellations)?.value.overridden,
    ).toBe(true);
  });
  it("prevents repeat cancellation and odometer/confirmation tampering", async () => {
    const input = {
      rentalId: id,
      confirmed: "on",
      startingKm: 1000,
      endingKm: 1000,
      remarks: "Request",
    };
    prepare({ ...rental, status: "CANCELLED" });
    await expect(cancelAgreement(input, actor)).rejects.toThrow("Only");
    prepare();
    await expect(cancelAgreement({ ...input, startingKm: 0 }, actor)).rejects.toThrow(
      "Starting KM",
    );
    await expect(cancelAgreement({ ...input, confirmed: undefined }, actor)).rejects.toThrow();
  });
  it("posts additional rent, hourly fee, and overdue fine as separate financial components on return", async () => {
    prepare({
      ...rental,
      startsAt: new Date(now.getTime() - 50 * 3600000),
      expectedReturnAt: new Date(now.getTime() - 26 * 3600000),
    });
    await returnContract({ rentalId: id, returnedAt: "2026-10-01T12:00", endingKm: "1000" }, actor);
    const charges = state.writes
      .filter((write) => write.table === rentalCharges)
      .map((write) => [write.value.component, write.value.amountBaisa]);
    expect(charges).toEqual([
      ["RENTAL", 20000],
      ["LATE_FEE", 2000],
      ["OVERDUE_FINE", 5000],
    ]);
    expect(state.writes.find((write) => write.table === rentals)?.value).toMatchObject({
      status: "RETURNED",
      totalBaisa: 47000,
    });
  });
  it("uses the extended valid deadline without posting covered-period penalties", async () => {
    await returnContract({ rentalId: id, returnedAt: "2026-10-01T12:00", endingKm: "1000" }, actor);
    expect(state.writes.some((write) => write.table === rentalCharges)).toBe(false);
    expect(state.writes.find((write) => write.table === rentals)?.value.totalBaisa).toBe(20000);
  });
  it("blocks evidence in the wrong lifecycle phase and retains derived associations", async () => {
    const photo = new File([new Uint8Array([255, 216, 255, 0])], "photo.jpg", {
      type: "image/jpeg",
    });
    const input = {
      rentalId: id,
      phase: "BEFORE_RENTAL",
      location: "Left door",
      description: "Existing scratch",
      customerId: "forged",
      vehicleId: "forged",
    };
    await expect(recordDamage(input, photo, actor)).rejects.toThrow("before checkout");
    prepare({ ...rental, status: "RESERVED" });
    await recordDamage(input, photo, actor);
    expect(
      state.writes.find((write) => write.table === vehicleDamageEvidence)?.value,
    ).toMatchObject({ phase: "BEFORE_RENTAL", vehicleId: id, customerId: id, recordedBy: id });
    prepare();
    await expect(recordDamage({ ...input, phase: "AFTER_RETURN" }, photo, actor)).rejects.toThrow(
      "returned",
    );
    prepare({ ...rental, status: "RETURNED" });
    await recordDamage({ ...input, phase: "AFTER_RETURN" }, photo, actor);
    expect(state.writes.filter((write) => write.table === vehicleDamageEvidence)).toHaveLength(2);
  });
  it("rejects an image MIME spoof", async () => {
    const file = new File(["not an image"], "spoof.jpg", { type: "image/jpeg" });
    await expect(
      recordDamage(
        { rentalId: id, phase: "BEFORE_RENTAL", location: "Door", description: "Scratch" },
        file,
        actor,
      ),
    ).rejects.toThrow("format");
  });
});

it("rejects a stale return that locked the previous vehicle before a swap", async () => {
  state.reads = [
    [rental],
    [vehicle],
    [{ ...rental, vehicleId: "00000000-0000-4000-8000-000000000002" }],
  ];
  await expect(
    returnContract({ rentalId: id, returnedAt: "2026-10-01T12:00", endingKm: "1000" }, actor),
  ).rejects.toThrow("Vehicle changed");
  expect(state.writes).toHaveLength(0);
});
it("rejects a return before the current vehicle segment began", async () => {
  prepare({ ...rental, segmentStartedAt: new Date("2026-10-01T07:00Z") } as typeof rental);
  await expect(
    returnContract({ rentalId: id, returnedAt: "2026-10-01T10:00", endingKm: "1000" }, actor),
  ).rejects.toThrow("Return time");
  expect(state.writes).toHaveLength(0);
});
it("does not accept an ending odometer below a customer-service reading", async () => {
  state.reads = [[rental], [{ ...vehicle, currentOdometerKm: 1200 }], [rental]];
  await expect(
    returnContract({ rentalId: id, returnedAt: "2026-10-01T12:00", endingKm: "1100" }, actor),
  ).rejects.toThrow("latest recorded");
  expect(state.writes).toHaveLength(0);
});
