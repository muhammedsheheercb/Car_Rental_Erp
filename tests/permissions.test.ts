import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/permissions";

describe("branch-scoped permission checks", () => {
  const user = {
    role: "USER" as const,
    branchIds: ["muscat"],
    permissions: new Set(["branches:read"]),
  };
  it("denies access to an unassigned branch even with module permission", () =>
    expect(hasPermission(user, "branches", "read", "salalah")).toBe(false));
  it("denies an action that is not explicitly granted", () =>
    expect(hasPermission(user, "branches", "update", "muscat")).toBe(false));
  it("allows a permitted action in an assigned branch", () =>
    expect(hasPermission(user, "branches", "read", "muscat")).toBe(true));
  it("lets a super admin cross branch boundaries", () =>
    expect(
      hasPermission(
        { role: "SUPER_ADMIN", branchIds: [], permissions: new Set() },
        "users",
        "delete",
        "any-branch",
      ),
    ).toBe(true));
});
