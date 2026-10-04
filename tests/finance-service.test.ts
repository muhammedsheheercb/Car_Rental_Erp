import { beforeEach, expect, it, vi } from "vitest";
import { customerLedger, financeFines, payments, rentalCharges } from "@/db/schema";
import { recordFine, recordPayment } from "@/features/finance/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  can: (a: Identity, _m: string, _op: string, branch: string) =>
    a.role === "SUPER_ADMIN" || a.branchIds.includes(branch),
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => {
          const result = fixture.reads.shift() ?? [];
          const q = {
            from: () => q,
            where: () => q,
            for: () => Promise.resolve(result),
            // biome-ignore lint/suspicious/noThenProperty: mimic awaitable Drizzle queries.
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
          };
          return q;
        },
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => {
            fixture.writes.push({ table, value });
            return { returning: async () => [{ ...value, id: "record" }] };
          },
        }),
      };
      try {
        return await callback(tx);
      } catch (e) {
        fixture.writes = [];
        throw e;
      }
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const actor = {
  id,
  role: "SUPER_ADMIN",
  displayName: "Admin",
  branchIds: [],
  permissions: new Set(),
} as unknown as Identity;
const rental = {
  id,
  branchId: id,
  customerId: id,
  vehicleId: id,
  status: "ACTIVE",
  agreementNumber: "B001",
  startsAt: new Date("2026-10-01T00:00Z"),
  expectedReturnAt: new Date("2026-10-05T00:00Z"),
};
beforeEach(() => {
  fixture.reads = [];
  fixture.writes = [];
});
it("posts advances and their ledger credit together", async () => {
  fixture.reads = [[rental], [], [{ balance: 500000 }], [], []];
  await recordPayment(
    { rentalId: id, requestId, kind: "ADVANCE", amount: "200", method: "CASH" },
    actor,
  );
  expect(fixture.writes.find((w) => w.table === payments)?.value.amountBaisa).toBe(200000);
  expect(fixture.writes.find((w) => w.table === customerLedger)?.value.creditBaisa).toBe(200000);
});
it("rejects paybacks above the remaining entitlement without posting", async () => {
  fixture.reads = [
    [rental],
    [],
    [{ balance: -200000 }],
    [{ amountBaisa: 500000 }],
    [{ kind: "PAYBACK", amountBaisa: 300000 }],
  ];
  await expect(
    recordPayment(
      { rentalId: id, requestId, kind: "PAYBACK", amount: "201", method: "CASH" },
      actor,
    ),
  ).rejects.toThrow("exceeds");
  expect(fixture.writes).toHaveLength(0);
});
it("deduplicates a payment retry", async () => {
  fixture.reads = [[rental], [{ rentalId: id, id: "existing" }]];
  await recordPayment(
    { rentalId: id, requestId, kind: "ADVANCE", amount: "200", method: "CASH" },
    actor,
  );
  expect(fixture.writes).toHaveLength(0);
});
it("legal fines retain their snapshot without posting rental or ledger charges", async () => {
  fixture.reads = [
    [rental],
    [],
    [],
    [{ registrationNumber: "123" }],
    [{ name: "Customer", address: "Muscat", mobile: "9999" }],
  ];
  await recordFine(
    {
      rentalId: id,
      requestId,
      kind: "LEGAL",
      amount: "5",
      dateFrom: "2026-10-02T10:00",
      dateTo: "2026-10-02T11:00",
      details: "Legal record",
    },
    actor,
  );
  expect(fixture.writes.some((w) => w.table === financeFines)).toBe(true);
  expect(fixture.writes.some((w) => w.table === customerLedger || w.table === rentalCharges)).toBe(
    false,
  );
});

it("attributes a historical legal fine to the vehicle occupied before transfer", async () => {
  const previousVehicleId = "00000000-0000-4000-8000-000000000003";
  fixture.reads = [
    [{ ...rental, segmentStartedAt: new Date("2026-10-02T08:00Z") }],
    [],
    [
      {
        previousVehicleId,
        segmentStartedAt: rental.startsAt,
        transferredAt: new Date("2026-10-02T08:00Z"),
        startingKm: 1000,
        endingKm: 1100,
      },
    ],
    [{ registrationNumber: "OLD-CAR" }],
    [{ name: "Customer", address: "Muscat", mobile: "9999" }],
  ];
  await recordFine(
    {
      rentalId: id,
      requestId,
      kind: "LEGAL",
      amount: "5",
      dateFrom: "2026-10-02T10:00",
      dateTo: "2026-10-02T11:00",
      details: "Historical legal fine",
    },
    actor,
  );
  const fine = fixture.writes.find((w) => w.table === financeFines)?.value;
  expect(fine?.vehicleId).toBe(previousVehicleId);
  expect(fine?.bookingSnapshot).toMatchObject({
    registration: "OLD-CAR",
    startingKm: 1000,
    endingKm: 1100,
  });
  expect(fixture.writes.some((w) => w.table === customerLedger)).toBe(false);
});
