import { beforeEach, expect, it, vi } from "vitest";
import { loadDocument } from "@/features/documents/service";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  signatures: new Map<string, { id: string; src: string }>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  can: (a: Identity, m: string, p: string, b?: string) =>
    a.role === "SUPER_ADMIN" || ((!b || a.branchIds.includes(b)) && a.permissions.has(`${m}:${p}`)),
}));
vi.mock("@/features/signatures/service", () => ({
  documentSignature: async (id: string) => fixture.signatures.get(id) ?? null,
}));
vi.mock("@/features/finance/service", () => ({ totals: async () => ({ balance: 5000 }) }));
vi.mock("@/features/invoices/service", () => ({
  invoicePayments: async () => ({ advance: 5000, received: 0 }),
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => {
      const rows = fixture.reads.shift() ?? [];
      const q = {
        from: () => q,
        innerJoin: () => q,
        where: () => q,
        orderBy: () => q,
        // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return q;
    },
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const receiver = "00000000-0000-4000-8000-000000000002";
const creator = "00000000-0000-4000-8000-000000000003";
const actor = {
  id,
  role: "USER",
  displayName: "Printer",
  branchIds: [id],
  permissions: new Set(["rentals:read", "rentals:print"]),
} as unknown as Identity;
const row = {
  r: {
    id,
    branchId: id,
    createdBy: creator,
    returnedBy: null,
    status: "ACTIVE",
    agreementNumber: "B001",
    startsAt: new Date("2026-10-01T06:00Z"),
    createdAt: new Date("2026-10-01T06:00Z"),
    expectedReturnAt: new Date("2026-10-03T06:00Z"),
    actualReturnAt: null,
    includedKm: 200,
    freeKm: 50,
    dailyRateBaisa: 10000,
    excessKmChargeBaisa: 100,
    totalBaisa: 10000,
    depositBaisa: 0,
    pricingPeriod: "DAILY",
    rentDuration: 2,
  },
  c: { name: "Customer", mobile: "9999", address: "Muscat", drivingLicenceNumber: "DL1" },
  v: { vehicleNumber: "V1", registrationNumber: "REG1" },
  brand: "Toyota",
  b: { name: "Main", location: "Muscat" },
};
beforeEach(() => {
  fixture.reads = [];
  fixture.signatures.clear();
});
it("prints two signature positions before return with the logged-in staff signature", async () => {
  fixture.reads = [[row], [{ id: creator, name: "Booking Staff" }], [], []];
  fixture.signatures.set(id, { id: "sig", src: "data:image/png;base64,AQID" });
  const document = await loadDocument("agreement", id, actor);
  expect(document?.signatures.map((s) => s.label)).toEqual([
    "Customer Signature",
    "Authorized Staff Signature",
  ]);
  expect(document?.signatures[1]).toMatchObject({
    name: "Printer",
    src: "data:image/png;base64,AQID",
  });
  expect(document?.fields).toContainEqual(["Booking Number", "B001"]);
  expect(document?.totals).toContainEqual(["Balance", "5.000"]);
});
it("prints three positions after return with the actual receiver's signature", async () => {
  fixture.reads = [
    [
      {
        ...row,
        r: {
          ...row.r,
          status: "RETURNED",
          actualReturnAt: new Date("2026-10-03T06:00Z"),
          returnedBy: receiver,
        },
      },
    ],
    [
      { id: receiver, name: "Return Staff" },
      { id: creator, name: "Booking Staff" },
    ],
    [],
    [],
  ];
  fixture.signatures.set(receiver, { id: "returnSig", src: "data:image/png;base64,RETURN" });
  const document = await loadDocument("agreement", id, actor);
  expect(document?.signatures).toHaveLength(3);
  expect(document?.signatures[1]).toMatchObject({
    label: "Return Received By",
    name: "Return Staff",
    src: "data:image/png;base64,RETURN",
  });
});
it("uses the creating staff signature when the printer has none", async () => {
  fixture.reads = [[row], [{ id: creator, name: "Booking Staff" }], [], []];
  fixture.signatures.set(creator, { id: "creatorSig", src: "data:image/png;base64,CREATOR" });
  expect((await loadDocument("agreement", id, actor))?.signatures[1]).toMatchObject({
    name: "Booking Staff",
    src: "data:image/png;base64,CREATOR",
  });
});
it("denies document printing without print permission", async () =>
  expect(
    await loadDocument("agreement", id, { ...actor, permissions: new Set(["rentals:read"]) }),
  ).toBeNull());
it("denies documents outside the permitted branch", async () => {
  fixture.reads = [[row]];
  expect(await loadDocument("agreement", id, { ...actor, branchIds: [] })).toBeNull();
});
it("does not query invalid document kinds or identifiers", async () => {
  expect(await loadDocument("unknown", id, actor)).toBeNull();
  expect(await loadDocument("agreement", "invalid", actor)).toBeNull();
});
