import { beforeEach, expect, it, vi } from "vitest";
import {
  customerLedger,
  rentalCharges,
  serviceExpenses,
  serviceHistory,
  vehicleServiceSettings,
  vehicles,
} from "@/db/schema";
import { changeService, createService } from "@/features/maintenance/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
  fail: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  can: (a: Identity, m: string, p: string, b: string) =>
    a.role === "SUPER_ADMIN" || (a.branchIds.includes(b) && a.permissions.has(`${m}:${p}`)),
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const prior = [...fixture.writes];
      const tx = {
        select: () => {
          const rows = fixture.reads.shift() ?? [];
          const q = {
            from: () => q,
            where: () => q,
            for: () => Promise.resolve(rows),
            // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          };
          return q;
        },
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => {
            fixture.writes.push({ table, value });
            return { returning: async () => [{ ...value, id: "service" }] };
          },
        }),
        update: (table: unknown) => ({
          set: (value: Record<string, unknown>) => ({
            where: () => {
              if (fixture.fail && table === vehicles) throw new Error("Odometer write failed");
              fixture.writes.push({ table, value });
              return { returning: async () => [{ ...value, id: "service" }] };
            },
          }),
        }),
      };
      try {
        return await callback(tx);
      } catch (e) {
        fixture.writes = prior;
        throw e;
      }
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const actor = {
  id,
  role: "SUPER_ADMIN",
  displayName: "Admin",
  branchIds: [],
  permissions: new Set(),
} as unknown as Identity;
const vehicle = {
  id,
  branchId: id,
  isActive: true,
  currentOdometerKm: 1000,
  brandId: id,
  vehicleNumber: "V1",
  registrationNumber: "REG1",
};
const settings = { id, lastEngineServiceKm: 500, lastGearOilChangeKm: 600 };
const input = {
  vehicleId: id,
  requestId: id,
  staffId: id,
  rentalId: "",
  serviceBy: "COMPANY",
  type: "ENGINE",
  status: "COMPLETED",
  outAt: "2026-10-01T10:00",
  completedAt: "2026-10-01T11:00",
  kmReading: "1000",
  serviceOdometerKm: "1200",
  cost: "10.005",
  paymentMode: "BANK_TRANSFER",
  remarks: "Oil and filter",
};
function completedReads() {
  fixture.reads = [[vehicle], [], [{ id }], [{ name: "Brand" }], [settings]];
}
beforeEach(() => {
  fixture.reads = [];
  fixture.writes = [];
  fixture.fail = false;
});
it("completes service and posts one expense with exact money and payment mode", async () => {
  completedReads();
  await createService(input, actor);
  expect(fixture.writes.find((w) => w.table === vehicleServiceSettings)?.value).toMatchObject({
    lastEngineServiceKm: 1200,
  });
  expect(fixture.writes.find((w) => w.table === vehicles)?.value.currentOdometerKm).toBe(1200);
  expect(fixture.writes.find((w) => w.table === serviceExpenses)?.value).toMatchObject({
    amountBaisa: 10005,
    paymentMode: "BANK_TRANSFER",
    paidBy: "COMPANY",
  });
  expect(fixture.writes.some((w) => w.table === serviceHistory)).toBe(true);
});
it("updates only the gear-oil marker for gear-oil service", async () => {
  completedReads();
  await createService({ ...input, type: "GEAR_OIL" }, actor);
  const change = fixture.writes.find((w) => w.table === vehicleServiceSettings)?.value;
  expect(change).toHaveProperty("lastGearOilChangeKm", 1200);
  expect(change).not.toHaveProperty("lastEngineServiceKm");
});
it("does not change maintenance interval readings for other service", async () => {
  completedReads();
  await createService({ ...input, type: "OTHER" }, actor);
  expect(fixture.writes.some((w) => w.table === vehicleServiceSettings)).toBe(false);
});
it("rolls back history and expense when the odometer update fails", async () => {
  completedReads();
  fixture.fail = true;
  await expect(createService(input, actor)).rejects.toThrow("Odometer");
  expect(fixture.writes).toHaveLength(0);
});
it("blocks company service in progress on a rented vehicle", async () => {
  fixture.reads = [[vehicle], [], [{ id }], [{ id: "active" }]];
  await expect(
    createService({ ...input, status: "IN_PROGRESS", cost: "0" }, actor),
  ).rejects.toThrow("active rental");
  expect(fixture.writes).toHaveLength(0);
});
it("rejects backwards odometer readings", async () => {
  completedReads();
  await expect(createService({ ...input, kmReading: "900" }, actor)).rejects.toThrow("backwards");
});
it("rejects an unauthorized branch", async () => {
  fixture.reads = [[vehicle]];
  await expect(
    createService(input, {
      ...actor,
      role: "USER",
      branchIds: [],
      permissions: new Set(["fleet:create"]),
    }),
  ).rejects.toThrow("access denied");
});
it("deduplicates a completed submission", async () => {
  fixture.reads = [[vehicle], [{ vehicleId: id, id: "existing" }]];
  await createService(input, actor);
  expect(fixture.writes).toHaveLength(0);
});
it("rejects Service By Customer without an occupied booking", async () => {
  completedReads();
  await expect(createService({ ...input, serviceBy: "CUSTOMER" }, actor)).rejects.toThrow(
    "occupied booking",
  );
});
it("keeps customer-paid service expenses separate from rental charges", async () => {
  fixture.reads = [
    [vehicle],
    [],
    [{ id }],
    [
      {
        id,
        vehicleId: id,
        customerId: id,
        branchId: id,
        status: "ACTIVE",
        startsAt: new Date("2026-10-01T00:00Z"),
        agreementNumber: "B1",
      },
    ],
    [{ name: "Customer", mobile: "9999" }],
    [{ name: "Brand" }],
    [settings],
  ];
  await createService({ ...input, serviceBy: "CUSTOMER", rentalId: id }, actor);
  expect(fixture.writes.find((w) => w.table === serviceExpenses)?.value.paidBy).toBe("CUSTOMER");
  expect(fixture.writes.some((w) => w.table === customerLedger || w.table === rentalCharges)).toBe(
    false,
  );
});
it("does not modify completed service history", async () => {
  fixture.reads = [
    [{ id, vehicleId: id }],
    [vehicle],
    [{ id, vehicleId: id, branchId: id, status: "COMPLETED" }],
  ];
  await expect(
    changeService(
      {
        serviceId: id,
        status: "CANCELLED",
        serviceOdometerKm: "1200",
        completedAt: "2026-10-01T11:00",
        cost: "0",
        paymentMode: "CASH",
        remarks: "Cancel",
      },
      actor,
    ),
  ).rejects.toThrow("immutable");
  expect(fixture.writes).toHaveLength(0);
});
