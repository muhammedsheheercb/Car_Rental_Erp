export type UserRole = "SUPER_ADMIN" | "ADMIN" | "USER";

type UserManagementActor = {
  id: string;
  role: UserRole;
  branchIds: string[];
};

type UserManagementTarget = {
  id: string;
  role: UserRole;
  branchIds: string[];
};

export function allowedRolesForActor(actorRole: UserRole): UserRole[] {
  if (actorRole === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", "USER"];
  if (actorRole === "ADMIN") return ["ADMIN", "USER"];
  return ["USER"];
}

export function canManageUserTarget(
  actor: UserManagementActor,
  target: UserManagementTarget,
): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (target.role === "SUPER_ADMIN") return false;
  if (target.id === actor.id) return false;
  if (!target.branchIds.length) return false;
  const actorBranches = new Set(actor.branchIds);
  return target.branchIds.every((branchId) => actorBranches.has(branchId));
}

export function validateUserAssignment(
  actor: UserManagementActor,
  input: { role: UserRole; branchIds: string[] },
): { ok: true } | { ok: false; message: string } {
  const allowed = allowedRolesForActor(actor.role);
  if (!allowed.includes(input.role)) {
    return {
      ok: false,
      message: "You do not have permission to assign the selected role.",
    };
  }
  const uniqueBranches = [...new Set(input.branchIds)];
  if (actor.role !== "SUPER_ADMIN") {
    if (!uniqueBranches.length) {
      return { ok: false, message: "Assign at least one permitted branch." };
    }
    const actorBranches = new Set(actor.branchIds);
    if (uniqueBranches.some((branchId) => !actorBranches.has(branchId))) {
      return {
        ok: false,
        message: "You can only assign users to branches within your access scope.",
      };
    }
  }
  return { ok: true };
}

export function diffPermissions(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = [...afterSet].filter((item) => !beforeSet.has(item)).sort();
  const removed = [...beforeSet].filter((item) => !afterSet.has(item)).sort();
  return {
    changed: added.length > 0 || removed.length > 0,
    added,
    removed,
  };
}
