type PermissionIdentity = {
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  branchIds: string[];
  permissions: Set<string>;
};
export function hasPermission(
  identity: PermissionIdentity,
  module: string,
  action: string,
  branchId?: string,
) {
  return (
    identity.role === "SUPER_ADMIN" ||
    ((!branchId || identity.branchIds.includes(branchId)) &&
      identity.permissions.has(`${module}:${action}`))
  );
}
