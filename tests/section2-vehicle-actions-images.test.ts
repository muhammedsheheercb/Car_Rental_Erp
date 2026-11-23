import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/vehicle-images/[id]/route";
import {
  getVehicleContextualActions,
  resolveVehicleOperationalStatus,
  type VehicleActionPermissionFlags,
} from "@/features/fleet/vehicle-actions";
import type { Identity } from "@/lib/auth";

const fixture = vi.hoisted(() => ({
  reads: [] as unknown[][],
  identity: null as Identity | null,
  get: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getIdentity: async () => fixture.identity,
  can: (actor: Identity, module: string, action: string, branchId?: string) =>
    actor.role === "SUPER_ADMIN" ||
    ((!branchId || actor.branchIds.includes(branchId)) &&
      actor.permissions.has(`${module}:${action}`)),
}));
vi.mock("@/lib/r2", () => ({
  getPrivateCustomerDocument: fixture.get,
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const rows = fixture.reads.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: () => Promise.resolve(rows),
    };
    return query;
  };
  return { db: { select } };
});

const FULL_PERMS: VehicleActionPermissionFlags = {
  canCreateRental: true,
  canUpdateRental: true,
  canApproveRental: true,
  canReadFinance: true,
  canCreateFinance: true,
  canManageService: true,
};

const VEHICLE_ID = "00000000-0000-4000-8000-000000000101";
const RENTAL_ID = "00000000-0000-4000-8000-000000000202";
const BRANCH_A = "00000000-0000-4000-8000-000000000301";
const BRANCH_B = "00000000-0000-4000-8000-000000000302";

describe("Vehicle operational status & contextual action modal (§8 & §20)", () => {
  it("resolves operational status with active rental taking precedence", () => {
    expect(
      resolveVehicleOperationalStatus({
        rentalStatus: "ACTIVE",
        status: "AVAILABLE",
        isActive: true,
        operationallyBlocked: false,
      }),
    ).toBe("ON_RENT");
    expect(
      resolveVehicleOperationalStatus({
        rentalStatus: "RESERVED",
        status: "AVAILABLE",
        isActive: true,
        operationallyBlocked: false,
      }),
    ).toBe("RESERVED");
    expect(
      resolveVehicleOperationalStatus({
        rentalStatus: null,
        status: "AVAILABLE",
        isActive: true,
        operationallyBlocked: false,
      }),
    ).toBe("AVAILABLE");
    expect(
      resolveVehicleOperationalStatus({
        rentalStatus: null,
        status: "AVAILABLE",
        isActive: true,
        operationallyBlocked: true,
      }),
    ).toBe("SERVICE_OR_TRANSFER");
    expect(
      resolveVehicleOperationalStatus({
        rentalStatus: null,
        status: "INACTIVE",
        isActive: false,
        operationallyBlocked: false,
      }),
    ).toBe("INACTIVE");
  });

  it("enables only valid actions for an Available vehicle", () => {
    const actions = getVehicleContextualActions({
      locale: "en",
      vehicleId: VEHICLE_ID,
      registration: "OM-1234",
      status: "AVAILABLE",
      activeRentalId: null,
      activeAgreementNumber: null,
      permissions: FULL_PERMS,
    });
    const enabled = actions.filter((a) => a.enabled).map((a) => a.key);
    expect(enabled).toEqual([
      "booking",
      "reserve",
      "pickup_dropoff",
      "transfer_vehicle",
      "fine",
      "legal_fine",
      "service",
      "retrieve_information",
    ]);
    const booking = actions.find((a) => a.key === "booking");
    expect(booking?.href).toContain(`vehicleId=${VEHICLE_ID}`);
  });

  it("enables reservation management actions for a Reserved vehicle", () => {
    const actions = getVehicleContextualActions({
      locale: "en",
      vehicleId: VEHICLE_ID,
      registration: "OM-1234",
      status: "RESERVED",
      activeRentalId: RENTAL_ID,
      activeAgreementNumber: "AGR-100",
      permissions: FULL_PERMS,
    });
    const enabled = actions.filter((a) => a.enabled).map((a) => a.key);
    expect(enabled).toEqual([
      "reserve",
      "edit_booking",
      "cancel_booking",
      "pickup_dropoff",
      "transfer_vehicle",
      "advance",
      "invoice",
      "fine",
      "legal_fine",
      "service",
      "retrieve_information",
    ]);
    expect(actions.find((a) => a.key === "booking")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "extend_contract")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "service_by_customer")?.enabled).toBe(false);
  });

  it("enables active rental actions and disables Booking & Reserve for a Currently Rented vehicle", () => {
    const actions = getVehicleContextualActions({
      locale: "en",
      vehicleId: VEHICLE_ID,
      registration: "OM-1234",
      status: "ON_RENT",
      activeRentalId: RENTAL_ID,
      activeAgreementNumber: "AGR-100",
      permissions: FULL_PERMS,
    });
    const enabled = actions.filter((a) => a.enabled).map((a) => a.key);
    expect(enabled).toEqual([
      "edit_booking",
      "cancel_booking",
      "pickup_dropoff",
      "transfer_vehicle",
      "scratch_mark",
      "extend_contract",
      "advance",
      "invoice",
      "fine",
      "legal_fine",
      "service",
      "service_by_customer",
      "retrieve_information",
    ]);
    expect(actions.find((a) => a.key === "booking")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "reserve")?.enabled).toBe(false);
  });

  it("respects user permission flags in contextual actions", () => {
    const actions = getVehicleContextualActions({
      locale: "en",
      vehicleId: VEHICLE_ID,
      registration: "OM-1234",
      status: "ON_RENT",
      activeRentalId: RENTAL_ID,
      activeAgreementNumber: "AGR-100",
      permissions: {
        canCreateRental: false,
        canUpdateRental: true,
        canApproveRental: false,
        canReadFinance: false,
        canCreateFinance: false,
        canManageService: false,
      },
    });
    expect(actions.find((a) => a.key === "extend_contract")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "invoice")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "service")?.enabled).toBe(false);
    expect(actions.find((a) => a.key === "scratch_mark")?.enabled).toBe(true);
    expect(actions.find((a) => a.key === "retrieve_information")?.enabled).toBe(true);
  });
});

describe("Protected /api/vehicle-images/[id] route (§35)", () => {
  beforeEach(() => {
    fixture.reads = [];
    fixture.identity = null;
    fixture.get.mockReset();
  });

  it("rejects unauthenticated requests with 401 without touching R2", async () => {
    const res = await GET(new Request("http://localhost/api/vehicle-images"), {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(401);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it("rejects cross-branch access with 403 without loading private R2 object", async () => {
    fixture.identity = {
      id: VEHICLE_ID,
      username: "staff",
      displayName: "Staff",
      role: "USER",
      branchIds: [BRANCH_A],
      permissions: new Set(["fleet:read"]),
      mustChangePassword: false,
    };
    fixture.reads = [
      [{ objectKey: "vehicles/x.jpg", contentType: "image/jpeg", branchId: BRANCH_B }],
    ];
    const res = await GET(new Request("http://localhost/api/vehicle-images"), {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(403);
    expect(fixture.get).not.toHaveBeenCalled();
  });

  it("streams authorized vehicle image with private no-store and sandbox headers", async () => {
    fixture.identity = {
      id: VEHICLE_ID,
      username: "staff",
      displayName: "Staff",
      role: "USER",
      branchIds: [BRANCH_A],
      permissions: new Set(["fleet:read"]),
      mustChangePassword: false,
    };
    fixture.reads = [
      [{ objectKey: "vehicles/x.jpg", contentType: "image/jpeg", branchId: BRANCH_A }],
    ];
    fixture.get.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([255, 216, 255]) },
    });
    const res = await GET(new Request("http://localhost/api/vehicle-images"), {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });
});
