import { describe, expect, it } from "vitest";
import {
  allowedRolesForActor,
  canManageUserTarget,
  diffPermissions,
  validateUserAssignment,
} from "@/features/admin/users";
import {
  blacklistEntrySchema,
  settingsPasswordSchema,
  userPreferencesSchema,
  userUpdateSchema,
} from "@/lib/validation";

const BRANCH_A = "00000000-0000-4000-8000-000000000001";
const BRANCH_B = "00000000-0000-4000-8000-000000000002";
const ACTOR_ID = "00000000-0000-4000-8000-000000000010";
const TARGET_ID = "00000000-0000-4000-8000-000000000020";

describe("User management authorization & scoping (§6)", () => {
  it("restricts assignable roles by actor role", () => {
    expect(allowedRolesForActor("SUPER_ADMIN")).toEqual(["SUPER_ADMIN", "ADMIN", "USER"]);
    expect(allowedRolesForActor("ADMIN")).toEqual(["ADMIN", "USER"]);
    expect(allowedRolesForActor("USER")).toEqual(["USER"]);
  });

  it("allows Super Admin to manage any user target", () => {
    expect(
      canManageUserTarget(
        { id: ACTOR_ID, role: "SUPER_ADMIN", branchIds: [] },
        { id: TARGET_ID, role: "SUPER_ADMIN", branchIds: [BRANCH_B] },
      ),
    ).toBe(true);
  });

  it("restricts Admins to managing non-Super-Admin users strictly within their branches", () => {
    const admin = { id: ACTOR_ID, role: "ADMIN" as const, branchIds: [BRANCH_A] };
    expect(canManageUserTarget(admin, { id: TARGET_ID, role: "USER", branchIds: [BRANCH_A] })).toBe(
      true,
    );
    expect(
      canManageUserTarget(admin, { id: TARGET_ID, role: "SUPER_ADMIN", branchIds: [BRANCH_A] }),
    ).toBe(false);
    expect(
      canManageUserTarget(admin, {
        id: TARGET_ID,
        role: "USER",
        branchIds: [BRANCH_A, BRANCH_B],
      }),
    ).toBe(false);
    expect(canManageUserTarget(admin, { id: ACTOR_ID, role: "ADMIN", branchIds: [BRANCH_A] })).toBe(
      false,
    );
    expect(canManageUserTarget(admin, { id: TARGET_ID, role: "USER", branchIds: [] })).toBe(false);
  });

  it("validates role and branch assignment scope", () => {
    const admin = { id: ACTOR_ID, role: "ADMIN" as const, branchIds: [BRANCH_A] };
    expect(validateUserAssignment(admin, { role: "SUPER_ADMIN", branchIds: [BRANCH_A] }).ok).toBe(
      false,
    );
    expect(validateUserAssignment(admin, { role: "USER", branchIds: [] }).ok).toBe(false);
    expect(validateUserAssignment(admin, { role: "USER", branchIds: [BRANCH_B] }).ok).toBe(false);
    expect(validateUserAssignment(admin, { role: "USER", branchIds: [BRANCH_A] }).ok).toBe(true);
    expect(
      validateUserAssignment(
        { id: ACTOR_ID, role: "SUPER_ADMIN", branchIds: [] },
        { role: "SUPER_ADMIN", branchIds: [] },
      ).ok,
    ).toBe(true);
  });

  it("computes permission diffs accurately for audit logs", () => {
    expect(
      diffPermissions(["customers:read", "fleet:read"], ["customers:read", "customers:create"]),
    ).toEqual({
      changed: true,
      added: ["customers:create"],
      removed: ["fleet:read"],
    });
    expect(diffPermissions(["fleet:read"], ["fleet:read"])).toEqual({
      changed: false,
      added: [],
      removed: [],
    });
  });

  it("validates user update payload", () => {
    const valid = userUpdateSchema.safeParse({
      displayName: "  Branch Manager  ",
      role: "ADMIN",
      branchIds: [BRANCH_A],
      permissions: ["customers:read", "rentals:override_price"],
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.displayName).toBe("Branch Manager");

    expect(
      userUpdateSchema.safeParse({
        displayName: "Manager",
        role: "ADMIN",
        branchIds: [BRANCH_A],
        permissions: ["invalid:action"],
      }).success,
    ).toBe(false);
  });
});

describe("Blacklist entry validation (§14)", () => {
  it("accepts valid blacklist entry with optional dates", () => {
    const parsed = blacklistEntrySchema.safeParse({
      reason: "  Unpaid fines  ",
      description: "  Repeated traffic violations left unpaid. ",
      startsAt: "2026-11-01",
      endsAt: "2026-12-01",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reason).toBe("Unpaid fines");
      expect(parsed.data.startsAt).toBe("2026-11-01");
    }
  });

  it("rejects end date earlier than start date", () => {
    const parsed = blacklistEntrySchema.safeParse({
      reason: "Damage",
      description: "Unresolved vehicle damage",
      startsAt: "2026-12-01",
      endsAt: "2026-11-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows blank optional dates", () => {
    const parsed = blacklistEntrySchema.safeParse({
      reason: "Policy breach",
      description: "Permanent ban",
      startsAt: "",
      endsAt: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startsAt).toBeUndefined();
      expect(parsed.data.endsAt).toBeUndefined();
    }
  });
});

describe("Settings password & preferences validation (§17)", () => {
  it("validates password change confirmation and difference", () => {
    expect(
      settingsPasswordSchema.safeParse({
        currentPassword: "OldPassword1234",
        newPassword: "NewSecurePassword1234",
        confirmPassword: "NewSecurePassword1234",
      }).success,
    ).toBe(true);

    expect(
      settingsPasswordSchema.safeParse({
        currentPassword: "OldPassword1234",
        newPassword: "NewSecurePassword1234",
        confirmPassword: "MismatchPassword1234",
      }).success,
    ).toBe(false);

    expect(
      settingsPasswordSchema.safeParse({
        currentPassword: "SamePassword1234",
        newPassword: "SamePassword1234",
        confirmPassword: "SamePassword1234",
      }).success,
    ).toBe(false);
  });

  it("validates user preferences options", () => {
    expect(
      userPreferencesSchema.safeParse({ tableDensity: "compact", dateFormat: "YMD" }).success,
    ).toBe(true);
    expect(
      userPreferencesSchema.safeParse({ tableDensity: "huge", dateFormat: "DMY" }).success,
    ).toBe(false);
  });
});
