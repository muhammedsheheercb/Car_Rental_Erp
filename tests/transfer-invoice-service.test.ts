import { beforeEach, expect, it, vi } from "vitest";
import {
  customerLedger,
  invoiceHistory,
  invoices,
  payments,
  rentalCharges,
  rentals,
  rentalVehicleSwaps,
  vehicles,
} from "@/db/schema";
import { saveInvoice, voidInvoice } from "@/features/invoices/service";
import { swapVehicle } from "@/features/transfers/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown>; operation: string }[],
  balance: 5000,
  failVehicle: false,
  locks: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  can: (actor: Identity, module: string, action: string, branch: string) =>
    actor.role === "SUPER_ADMIN" ||
    (actor.branchIds.includes(branch) && actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/features/finance/service", () => ({
  totals: async () => ({ balance: fixture.balance, remainingBaisa: 0 }),
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = [...fixture.writes];
      const tx = {
        select: () => {
          const rows = fixture.reads.shift() ?? [];
          const q = {
            from: () => q,
            where: () => q,
            orderBy: () => q,
            for: (mode: string) => {
              fixture.locks.push(mode);
              return Promise.resolve(rows);
            },
            // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          };
          return q;
        },
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => {
            fixture.writes.push({ table, value, operation: "insert" });
            return { returning: async () => [{ ...value, id: `record-${fixture.writes.length}` }] };
          },
        }),
        update: (table: unknown) => ({
          set: (value: Record<string, unknown>) => ({
            where: () => {
              if (fixture.failVehicle && table === vehicles)
                throw new Error("Simulated vehicle update failure");
              fixture.writes.push({ table, value, operation: "update" });
              return { returning: async () => [{ ...value, id: "invoice" }] };
            },
          }),
        }),
        delete: () => {
          throw new Error("Destructive financial deletion is forbidden.");
        },
      };
      try {
        return await callback(tx);
      } catch (e) {
        fixture.writes = previous;
        throw e;
      }
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const nextId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const actor = {
  id,
  role: "SUPER_ADMIN",
  displayName: "Admin",
  branchIds: [],
  permissions: new Set(),
} as unknown as Identity;
const rental = {
  id,
  vehicleId: id,
  customerId: id,
  branchId: id,
  status: "ACTIVE",
  startsAt: new Date("2026-01-01T06:00Z"),
  expectedReturnAt: new Date("2099-01-05T06:00Z"),
  pickupOdometerKm: 1000,
  includedKm: 200,
  freeKm: 50,
  excessKmChargeBaisa: 100,
  openKm: false,
  totalBaisa: 10000,
  subtotalBaisa: 10000,
};
const previous = { id, branchId: id, currentOdometerKm: 1000 };
const next = { id: nextId, branchId: id, currentOdometerKm: 3000 };
const swap = {
  rentalId: id,
  newVehicleId: nextId,
  requestId,
  transferredAt: "2026-01-02T10:00",
  endingKm: "1220",
  newStartingKm: "3000",
  damage: "0",
  washing: "1",
  petrol: "0",
  received: "2",
  method: "CASH",
  remarks: "Replacement",
};
const invoice = {
  rentalId: id,
  requestId,
  washing: "0",
  petrol: "0",
  discount: "0",
  received: "0",
  method: "CASH",
  status: "DRAFT",
  remarks: "Draft",
};
function swapReads() {
  fixture.reads = [
    [rental],
    [previous, next],
    [rental],
    [],
    [{ id: nextId }],
    [],
    [],
    [{ id, name: "Customer" }],
  ];
}
function invoiceReads(r = { ...rental, status: "RETURNED" }) {
  fixture.reads = [
    [r],
    [],
    [{ id: "advance", kind: "ADVANCE", amountBaisa: 5000 }],
    [],
    [{ registrationNumber: "123" }],
    [{ name: "Customer" }],
    [],
    [],
  ];
}
beforeEach(() => {
  fixture.reads = [];
  fixture.writes = [];
  fixture.balance = 5000;
  fixture.failVehicle = false;
  fixture.locks = [];
});
it("atomically releases the previous vehicle, occupies the replacement and retains the booking", async () => {
  swapReads();
  await swapVehicle(swap, actor);
  expect(fixture.writes.filter((w) => w.table === vehicles).map((w) => w.value.status)).toEqual([
    "AVAILABLE",
    "INACTIVE",
  ]);
  const update = fixture.writes.find((w) => w.table === rentals)?.value;
  expect(update).toMatchObject({
    vehicleId: nextId,
    pickupOdometerKm: 3000,
    includedKm: 0,
    freeKm: 30,
    totalBaisa: 11000,
  });
  expect(update).not.toHaveProperty("expectedReturnAt");
  expect(update).not.toHaveProperty("dailyRateBaisa");
  expect(fixture.writes.some((w) => w.table === rentalVehicleSwaps)).toBe(true);
  expect(fixture.writes.find((w) => w.table === payments)?.value.amountBaisa).toBe(2000);
  expect(fixture.locks).toEqual(["update", "update"]);
});
it("rolls back charges, receipt and history if either vehicle update fails", async () => {
  swapReads();
  fixture.failVehicle = true;
  await expect(swapVehicle(swap, actor)).rejects.toThrow("Simulated");
  expect(fixture.writes).toHaveLength(0);
});
it("rejects replacement reservations before posting", async () => {
  swapReads();
  fixture.reads[5] = [{ id: "conflict" }];
  await expect(swapVehicle(swap, actor)).rejects.toThrow("conflicts");
  expect(fixture.writes).toHaveLength(0);
});
it("rejects service-blocked replacement", async () => {
  swapReads();
  fixture.reads[4] = [];
  await expect(swapVehicle(swap, actor)).rejects.toThrow("blocked");
  expect(fixture.writes).toHaveLength(0);
});
it("rejects stale vehicle selection after a concurrent swap", async () => {
  swapReads();
  fixture.reads[2] = [{ ...rental, vehicleId: nextId }];
  await expect(swapVehicle(swap, actor)).rejects.toThrow("changed");
});
it("does not transfer a returned rental", async () => {
  swapReads();
  fixture.reads[2] = [{ ...rental, status: "RETURNED" }];
  await expect(swapVehicle(swap, actor)).rejects.toThrow("active rental");
});
it("rejects an unauthorized replacement branch", async () => {
  swapReads();
  fixture.reads[1] = [previous, { ...next, branchId: nextId }];
  const user = {
    ...actor,
    role: "USER" as const,
    branchIds: [id],
    permissions: new Set(["rentals:update"]),
  };
  await expect(swapVehicle(swap, user)).rejects.toThrow("branch access");
});
it("deduplicates a completed swap retry", async () => {
  swapReads();
  fixture.reads[3] = [{ rentalId: id, id: "swap" }];
  await swapVehicle(swap, actor);
  expect(fixture.writes).toHaveLength(0);
});
it("rejects overcollection at transfer", async () => {
  swapReads();
  await expect(swapVehicle({ ...swap, received: "7" }, actor)).rejects.toThrow("exceeds");
  expect(fixture.writes).toHaveLength(0);
});
it("stores draft invoices without ledger or payment mutations", async () => {
  invoiceReads();
  await saveInvoice(invoice, actor);
  expect(fixture.writes.map((w) => w.table)).toEqual([invoices, invoiceHistory]);
  expect(fixture.writes[0].value).toMatchObject({
    grandTotalBaisa: 10000,
    advanceBaisa: 5000,
    balanceBaisa: 5000,
    status: "DRAFT",
  });
});
it("posts final invoice adjustments and its receipt exactly once", async () => {
  invoiceReads();
  fixture.reads.splice(2, 0, []);
  await saveInvoice(
    { ...invoice, status: "FINALIZED", washing: "1", discount: "0.5", received: "5.5" },
    actor,
  );
  expect(fixture.writes.find((w) => w.table === invoices)?.value).toMatchObject({
    grandTotalBaisa: 10500,
    balanceBaisa: 0,
    adjustmentBaisa: 500,
  });
  expect(
    fixture.writes
      .filter((w) => w.table === customerLedger)
      .map((w) => [w.value.debitBaisa ?? 0, w.value.creditBaisa ?? 0]),
  ).toEqual([
    [1000, 0],
    [0, 500],
    [0, 5500],
  ]);
});
it("rejects invoice received amount exceeding OMR 5 outstanding", async () => {
  invoiceReads();
  fixture.reads.splice(2, 0, []);
  await expect(
    saveInvoice({ ...invoice, status: "FINALIZED", received: "5.001" }, actor),
  ).rejects.toThrow("exceeds");
  expect(fixture.writes).toHaveLength(0);
});
it("requires finalization permission", async () => {
  invoiceReads();
  const user = {
    ...actor,
    role: "USER" as const,
    branchIds: [id],
    permissions: new Set(["finance:create"]),
  };
  await expect(saveInvoice({ ...invoice, status: "FINALIZED" }, user)).rejects.toThrow(
    "permission",
  );
});
it("requires final mileage settlement before finalizing active rental", async () => {
  invoiceReads({ ...rental, status: "ACTIVE" });
  await expect(saveInvoice({ ...invoice, status: "FINALIZED" }, actor)).rejects.toThrow(
    "Return or cancel",
  );
});
it("prevents duplicate finalized invoices", async () => {
  invoiceReads();
  fixture.reads.splice(2, 0, [{ id: "prior" }]);
  await expect(saveInvoice({ ...invoice, status: "FINALIZED" }, actor)).rejects.toThrow("already");
});
it("voids with offset entries and preserves payment history", async () => {
  const final = {
    id: nextId,
    rentalId: id,
    branchId: id,
    status: "FINALIZED",
    adjustmentBaisa: 500,
    invoiceNumber: "INV001",
  };
  fixture.reads = [[final], [{ ...rental, totalBaisa: 10500 }], [final]];
  await voidInvoice({ invoiceId: nextId, reason: "Correction required" }, actor);
  expect(fixture.writes.find((w) => w.table === customerLedger)?.value).toMatchObject({
    debitBaisa: 0,
    creditBaisa: 500,
  });
  expect(fixture.writes.find((w) => w.table === rentalCharges)?.value.amountBaisa).toBe(-500);
  expect(fixture.writes.some((w) => w.table === payments)).toBe(false);
  expect(fixture.writes.find((w) => w.table === invoices)?.value.status).toBe("VOID");
  expect(fixture.writes.some((w) => w.table === invoiceHistory)).toBe(true);
});

it("uses approved financial adjustments in the invoice balance and payment cap", async () => {
  invoiceReads();
  fixture.reads.splice(2, 0, []);
  fixture.balance = 3000;
  await expect(
    saveInvoice({ ...invoice, status: "FINALIZED", received: "4" }, actor),
  ).rejects.toThrow("ledger");
  expect(fixture.writes).toHaveLength(0);
  invoiceReads();
  fixture.reads.splice(2, 0, []);
  await saveInvoice({ ...invoice, status: "FINALIZED", received: "3" }, actor);
  expect(fixture.writes.find((w) => w.table === invoices)?.value.balanceBaisa).toBe(0);
});
