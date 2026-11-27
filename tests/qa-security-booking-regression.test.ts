import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerLedger, payments } from "@/db/schema";
import { resolveActivityHref } from "@/features/daily-activity/calculations";
import { escapeCsvCell } from "@/features/reports/definitions";
import type { Identity } from "@/lib/auth";
import { loginSchema, passwordSchema, sanitizeReturnTo, vehicleSchema } from "@/lib/validation";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: unknown; value: Record<string, unknown> }[],
  identity: null as Identity | null,
  eligibilityError: null as Error | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/r2", () => ({
  getPrivateCustomerDocument: vi.fn(),
  putPrivateCustomerDocument: vi.fn(),
}));
vi.mock("@/features/customers/eligibility", () => ({
  assertCustomerCanBeBooked: async () => {
    if (state.eligibilityError) throw state.eligibilityError;
  },
}));
vi.mock("@/lib/auth", () => ({
  getIdentity: async () => state.identity,
  can: (actor: Identity, module: string, action: string, branch?: string) =>
    actor.role === "SUPER_ADMIN" ||
    ((!branch || actor.branchIds.includes(branch)) && actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const rows = state.reads.shift() ?? [];
    const q = {
      from: () => q,
      innerJoin: () => q,
      leftJoin: () => q,
      where: () => q,
      orderBy: () => q,
      limit: () => Promise.resolve(rows),
      for: () => Promise.resolve(rows),
      // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return q;
  };
  return {
    db: {
      select,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const prior = [...state.writes];
        const tx = {
          select,
          insert: (table: unknown) => ({
            values: (value: Record<string, unknown>) => {
              const exec = async () => {
                state.writes.push({ table, value });
                return [{ ...value, id: `rec-${state.writes.length}` }];
              };
              return {
                returning: exec,
                // biome-ignore lint/suspicious/noThenProperty: awaitable Drizzle fixture.
                then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                  exec().then(resolve, reject),
              };
            },
          }),
          update: (table: unknown) => ({
            set: (value: Record<string, unknown>) => ({
              where: async () => {
                state.writes.push({ table, value });
              },
            }),
          }),
        };
        try {
          return await callback(tx);
        } catch (err) {
          state.writes = prior;
          throw err;
        }
      },
    },
  };
});

import { GET as exportReportGet } from "@/app/api/reports/export/route";
import { GET as vehicleImageGet } from "@/app/api/vehicle-images/[id]/route";
import { approveRefund, correctPayment } from "@/features/finance/service";
import { extendContract, updateBooking } from "@/features/rentals/lifecycle";
import { activateRental, createReservation } from "@/features/rentals/service";
import { swapVehicle } from "@/features/transfers/service";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const REQ = "00000000-0000-4000-8000-000000000003";

const superAdmin: Identity = {
  id: ID,
  username: "owner",
  displayName: "Owner",
  role: "SUPER_ADMIN",
  branchIds: [],
  permissions: new Set(),
  mustChangePassword: false,
};

const baseRental = {
  id: ID,
  agreementNumber: "OMR-2026-QA01",
  customerId: ID,
  vehicleId: ID,
  branchId: ID,
  pickupBranchId: ID,
  returnBranchId: ID,
  status: "ACTIVE" as const,
  startsAt: new Date("2026-12-01T06:00:00Z"),
  expectedReturnAt: new Date("2026-12-05T06:00:00Z"),
  pricingPeriod: "DAILY" as const,
  rentDuration: 4,
  dailyRateBaisa: 20000,
  additionalDayRentBaisa: 20000,
  includedKm: 800,
  freeKm: 0,
  openKm: false,
  excessKmChargeBaisa: 100,
  lateFeeBaisa: 2000,
  lateGraceMinutes: 60,
  lateWindowHours: 4,
  overdueFineBaisa: 5000,
  pickupOdometerKm: 1000,
  subtotalBaisa: 80000,
  taxBaisa: 0,
  totalBaisa: 80000,
};

beforeEach(() => {
  state.reads = [];
  state.writes = [];
  state.identity = null;
  state.eligibilityError = null;
});

describe("QA Security & Finance Integrity Regression Suite", () => {
  it("blocks approveRefund when the booking still has an unpaid balance", async () => {
    // lock(rental), existing approval check, totals(ledger, approvals, payments)
    state.reads = [
      [baseRental],
      [],
      [{ balance: 50000 }],
      [],
      [{ direction: "RECEIPT", kind: "ADVANCE", amountBaisa: 30000 }],
    ];
    await expect(
      approveRefund(
        { rentalId: ID, requestId: REQ, amount: "10", remarks: "Unpaid balance wipe attempt" },
        superAdmin,
      ),
    ).rejects.toThrow("unpaid balance");
    expect(state.writes).toHaveLength(0);
  });

  it("blocks approveRefund when approved refunds would exceed net collected payments", async () => {
    // Paid 20 OMR, balance 0, trying to approve 25 OMR refund
    state.reads = [
      [baseRental],
      [],
      [{ balance: 0 }],
      [],
      [{ direction: "RECEIPT", kind: "RECEIPT", amountBaisa: 20000 }],
    ];
    await expect(
      approveRefund(
        { rentalId: ID, requestId: REQ, amount: "25", remarks: "Exceeds net payments" },
        superAdmin,
      ),
    ).rejects.toThrow("net payments collected");
    expect(state.writes).toHaveLength(0);
  });

  it("posts payment correction reversal under the original payment method (Cash vs Card integrity)", async () => {
    const originalCashPayment = {
      id: ID,
      rentalId: ID,
      customerId: ID,
      branchId: ID,
      kind: "RECEIPT" as const,
      direction: "RECEIPT" as const,
      method: "CASH" as const,
      amountBaisa: 25000,
    };
    // select payment, lock rental, existing correction, finalized invoice check, totals(3 reads)
    state.reads = [
      [originalCashPayment],
      [baseRental],
      [],
      [],
      [{ balance: 55000 }],
      [],
      [originalCashPayment],
    ];
    await correctPayment(
      { paymentId: ID, amount: "25", method: "CARD", remarks: "Customer paid by card, not cash" },
      superAdmin,
    );
    const postedPayments = state.writes.filter((w) => w.table === payments).map((w) => w.value);
    expect(postedPayments).toHaveLength(2);
    expect(postedPayments[0]).toMatchObject({
      kind: "REVERSAL",
      direction: "PAYBACK",
      method: "CASH",
      amountBaisa: 25000,
    });
    expect(postedPayments[1]).toMatchObject({
      kind: "RECEIPT",
      direction: "RECEIPT",
      method: "CARD",
      amountBaisa: 25000,
    });
  });

  it("blocks correcting a payment when a finalized invoice exists for the booking", async () => {
    const originalPayment = {
      id: ID,
      rentalId: ID,
      customerId: ID,
      branchId: ID,
      kind: "RECEIPT" as const,
      direction: "RECEIPT" as const,
      method: "CASH" as const,
      amountBaisa: 25000,
    };
    state.reads = [[originalPayment], [baseRental], [], [{ id: "inv-final" }]];
    await expect(
      correctPayment(
        { paymentId: ID, amount: "20", method: "CASH", remarks: "Post-invoice tamper" },
        superAdmin,
      ),
    ).rejects.toThrow("finalized invoice");
    expect(state.writes).toHaveLength(0);
  });

  it("requires finance:delete or finance:approve to void a receipt with amount 0", async () => {
    const updateOnlyUser: Identity = {
      ...superAdmin,
      role: "USER",
      branchIds: [ID],
      permissions: new Set(["finance:update"]),
    };
    const originalPayment = {
      id: ID,
      rentalId: ID,
      customerId: ID,
      branchId: ID,
      kind: "RECEIPT" as const,
      direction: "RECEIPT" as const,
      method: "CASH" as const,
      amountBaisa: 25000,
    };
    state.reads = [[originalPayment], [baseRental], [], []];
    await expect(
      correctPayment(
        { paymentId: ID, amount: "0", method: "CASH", remarks: "Unauthorized void" },
        updateOnlyUser,
      ),
    ).rejects.toThrow("Delete or approve");
    expect(state.writes).toHaveLength(0);
  });

  it("enforces configured minimumRentBaisa floor during reservation creation", async () => {
    state.reads = [
      [{ id: ID, isActive: true, status: "AVAILABLE", branchId: ID, currentOdometerKm: 1000 }],
      [
        {
          listRentBaisa: 25000,
          minimumRentBaisa: 20000,
          includedKm: 200,
          excessKmChargeBaisa: 100,
          lateFeeBaisa: 2000,
          lateGraceMinutes: 60,
          lateWindowHours: 4,
          overdueFineBaisa: 5000,
        },
      ],
    ];
    await expect(
      createReservation(
        {
          customerId: ID,
          vehicleId: ID,
          branchId: ID,
          pickupBranchId: ID,
          returnBranchId: ID,
          startsAt: "2026-12-10T10:00",
          pricingPeriod: "DAILY",
          rentDuration: "2",
          dailyRateBaisa: "15000",
          includedKm: "200",
          freeKm: "0",
          pickupOdometerKm: "1000",
          excessKmChargeBaisa: "100",
          lateFeeBaisa: "2000",
          depositBaisa: "0",
          downPaymentBaisa: "0",
          paymentMode: "CASH",
        },
        superAdmin,
      ),
    ).rejects.toThrow("minimum rent");
    expect(state.writes).toHaveLength(0);
  });

  it("skips zero-baisa RENT_CHARGE ledger entries when rental total is 0", async () => {
    state.reads = [
      [{ id: ID, isActive: true, status: "AVAILABLE", branchId: ID, currentOdometerKm: 1000 }],
      [
        {
          listRentBaisa: 0,
          minimumRentBaisa: 0,
          includedKm: 200,
          excessKmChargeBaisa: 100,
          lateFeeBaisa: 0,
          lateGraceMinutes: 60,
          lateWindowHours: 4,
          overdueFineBaisa: 0,
        },
      ],
      [],
      [{ listRentBaisa: 0 }],
    ];
    await createReservation(
      {
        customerId: ID,
        vehicleId: ID,
        branchId: ID,
        pickupBranchId: ID,
        returnBranchId: ID,
        startsAt: "2026-12-10T10:00",
        pricingPeriod: "DAILY",
        rentDuration: "1",
        dailyRateBaisa: "0",
        includedKm: "200",
        freeKm: "0",
        pickupOdometerKm: "1000",
        excessKmChargeBaisa: "100",
        lateFeeBaisa: "0",
        depositBaisa: "0",
        downPaymentBaisa: "0",
        paymentMode: "CASH",
      },
      superAdmin,
    );
    expect(state.writes.some((w) => w.table === customerLedger)).toBe(false);
  });

  it("blocks early checkout when customer is blacklisted or another reservation overlaps", async () => {
    const reservedRental = { ...baseRental, status: "RESERVED" as const };
    const availVehicle = {
      id: ID,
      isActive: true,
      status: "AVAILABLE" as const,
      currentOdometerKm: 1000,
    };

    // 1. Blacklisted customer check
    state.eligibilityError = new Error("Blacklisted customers cannot create new bookings.");
    state.reads = [[reservedRental], [availVehicle], [reservedRental]];
    await expect(activateRental(ID, 1000, superAdmin.id)).rejects.toThrow("Blacklisted");

    // 2. Overlapping reservation on early checkout
    state.eligibilityError = null;
    state.reads = [[reservedRental], [availVehicle], [reservedRental], [{ id: "other-res" }]];
    await expect(activateRental(ID, 1000, superAdmin.id)).rejects.toThrow("overlaps");
    expect(state.writes).toHaveLength(0);
  });

  it("blocks contract extension for newly blacklisted customers", async () => {
    state.eligibilityError = new Error("Blacklisted customers cannot create new bookings.");
    state.reads = [[baseRental], [{ id: ID, currentOdometerKm: 1000 }], [baseRental]];
    await expect(
      extendContract({ rentalId: ID, duration: 1, remarks: "Extend" }, superAdmin),
    ).rejects.toThrow("Blacklisted");
    expect(state.writes).toHaveLength(0);
  });

  it("blocks unauthorized staff from enabling Open KM or Free KM on an active rental", async () => {
    const staffWithoutOverride: Identity = {
      ...superAdmin,
      role: "USER",
      branchIds: [ID],
      permissions: new Set(["rentals:update"]),
    };
    state.reads = [[baseRental], [{ id: ID, currentOdometerKm: 1000 }], [baseRental]];
    await expect(
      updateBooking(
        {
          rentalId: ID,
          pickupBranchId: ID,
          returnBranchId: ID,
          freeKm: 500,
          openKm: true,
        },
        staffWithoutOverride,
      ),
    ).rejects.toThrow("override permission");
    expect(state.writes).toHaveLength(0);
  });

  it("requires finance:create to collect payment during vehicle transfer", async () => {
    const rentalsOnlyStaff: Identity = {
      ...superAdmin,
      role: "USER",
      branchIds: [ID],
      permissions: new Set(["rentals:update"]),
    };
    const prevVeh = { id: ID, branchId: ID, currentOdometerKm: 1000 };
    const nextVeh = { id: ID2, branchId: ID, currentOdometerKm: 2000 };
    state.reads = [[baseRental], [prevVeh, nextVeh], [baseRental], []];
    await expect(
      swapVehicle(
        {
          rentalId: ID,
          newVehicleId: ID2,
          requestId: REQ,
          transferredAt: "2026-12-02T10:00",
          endingKm: "1100",
          newStartingKm: "2000",
          damage: "0",
          washing: "0",
          petrol: "0",
          received: "10",
          method: "CASH",
          remarks: "Swap with payment",
        },
        rentalsOnlyStaff,
      ),
    ).rejects.toThrow("Finance create permission");
    expect(state.writes).toHaveLength(0);
  });

  it("resolves valid Daily Activity finance deep links (no 404 /receipt or /fines)", () => {
    const financeReader = {
      id: ID,
      role: "USER" as const,
      branchIds: [ID],
      permissions: new Set(["finance:read"]),
    };
    expect(
      resolveActivityHref(
        "en",
        { effectiveEvent: "RECEIPT_RECORDED", entityType: "payment", entityId: "p1", metadata: {} },
        financeReader,
      ),
    ).toBe("/en/finance/receipts");
    expect(
      resolveActivityHref(
        "en",
        { effectiveEvent: "FINE_RECORDED", entityType: "fine", entityId: "f1", metadata: {} },
        financeReader,
      ),
    ).toBe("/en/finance/fine");
    expect(
      resolveActivityHref(
        "en",
        {
          effectiveEvent: "LEGAL_FINE_RECORDED",
          entityType: "fine",
          entityId: "lf1",
          metadata: {},
        },
        financeReader,
      ),
    ).toBe("/en/finance/legal-fine");
  });

  it("neutralizes whitespace-prefixed CSV formulas and rejects malicious returnTo URLs", () => {
    expect(escapeCsvCell(" =CMD|' /C calc'!A0")).toBe("' =CMD|' /C calc'!A0");
    expect(escapeCsvCell("  +1+1")).toBe("'  +1+1");
    expect(escapeCsvCell("\t@SUM(A1:A5)")).toBe("'\t@SUM(A1:A5)");
    expect(escapeCsvCell("|calc")).toBe("'|calc");

    expect(sanitizeReturnTo("/en/rentals\t/evil")).toBeUndefined();
    expect(sanitizeReturnTo("/en/rentals\x00")).toBeUndefined();
    expect(sanitizeReturnTo("//evil.com/phish")).toBeUndefined();
    expect(sanitizeReturnTo("/\\evil.com")).toBeUndefined();
    expect(sanitizeReturnTo("/ar/fleet?filter=available")).toBe("/ar/fleet?filter=available");
  });

  it("enforces password max length (Argon2 DoS), username normalization, and integer caps", () => {
    const longPwd = "a".repeat(129);
    expect(loginSchema.safeParse({ username: "Admin", password: longPwd }).success).toBe(false);
    expect(
      passwordSchema.safeParse({
        currentPassword: longPwd,
        newPassword: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
      }).success,
    ).toBe(false);
    const parsedLogin = loginSchema.safeParse({ username: "  AdMiN  ", password: "secret" });
    expect(parsedLogin.success).toBe(true);
    if (parsedLogin.success) expect(parsedLogin.data.username).toBe("admin");

    expect(vehicleSchema.safeParse({ currentOdometerKm: 9_999_999_999 }).success).toBe(false);
  });

  it("blocks API endpoints with 403 when mustChangePassword is true and 415 for non-image MIME", async () => {
    state.identity = { ...superAdmin, mustChangePassword: true };
    const exportRes = await exportReportGet(
      new Request("http://localhost:3000/api/reports/export?report=vehicle-list"),
    );
    expect(exportRes.status).toBe(403);

    const imgRes = await vehicleImageGet(new Request("http://localhost:3000/api/vehicle-images"), {
      params: Promise.resolve({ id: ID }),
    });
    expect(imgRes.status).toBe(403);

    // Non-image content type (stored XSS SVG defense) -> 415
    state.identity = { ...superAdmin, mustChangePassword: false };
    state.reads = [[{ objectKey: "vehicles/xss.svg", contentType: "image/svg+xml", branchId: ID }]];
    const svgRes = await vehicleImageGet(new Request("http://localhost:3000/api/vehicle-images"), {
      params: Promise.resolve({ id: ID }),
    });
    expect(svgRes.status).toBe(415);
  });
});
