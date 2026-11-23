"use server";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditLogs,
  branches,
  roles,
  sessions,
  userBranches,
  userPermissions,
  userRoles,
  users,
  vehicles,
} from "@/db/schema";
import {
  canManageUserTarget,
  diffPermissions,
  type UserRole,
  validateUserAssignment,
} from "@/features/admin/users";
import { audit, passwordHash, requirePermission } from "@/lib/auth";
import { branchCreateSchema, branchSchema, userSchema, userUpdateSchema } from "@/lib/validation";

const uuidSchema = z.string().uuid();

function revalidateUsersPaths() {
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/admin/users`);
    revalidatePath(`/${locale}/settings`);
    revalidatePath(`/${locale}/settings/signature`);
  }
}

export async function createBranchAction(formData: FormData) {
  const actor = await requirePermission("branches", "create");
  const parsed = branchCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid branch details." };
  const input = parsed.data;
  const baseCode =
    input.name
      .toLocaleUpperCase()
      .trim()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 16) || "BRANCH";
  let branch: typeof branches.$inferSelect | undefined;
  for (let attempt = 1; attempt <= 99; attempt++) {
    const code =
      attempt === 1 ? baseCode : `${baseCode.slice(0, 13)}-${String(attempt).padStart(2, "0")}`;
    try {
      [branch] = await db
        .insert(branches)
        .values({ ...input, code })
        .returning();
      break;
    } catch {
      /* duplicate code: try the next suffix */
    }
  }
  if (!branch)
    return { ok: false, message: "We could not generate a unique branch code. Please retry." };
  await audit("BRANCH_CREATED", "branch", branch.id, actor.id);
  revalidatePath("/en/admin/branches");
  return { ok: true, message: "Branch created successfully." };
}
export async function deactivateBranchAction(id: string) {
  const actor = await requirePermission("branches", "delete");
  const [activeCount] = await db
    .select({ count: count() })
    .from(branches)
    .where(eq(branches.isActive, true));
  if ((activeCount?.count ?? 0) <= 1)
    return { ok: false, message: "The system must retain at least one active branch." };
  await db
    .update(branches)
    .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(branches.id, id));
  await audit("BRANCH_DEACTIVATED", "branch", id, actor.id);
  revalidatePath("/en/admin/branches");
  return { ok: true, message: "Branch deactivated successfully." };
}
export async function updateBranchAction(id: string, formData: FormData) {
  const actor = await requirePermission("branches", "update");
  const parsed = branchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid branch details." };
  try {
    await db
      .update(branches)
      .set({ name: parsed.data.name, location: parsed.data.location, updatedAt: new Date() })
      .where(eq(branches.id, id));
    await audit("BRANCH_UPDATED", "branch", id, actor.id);
    revalidatePath("/en/admin/branches");
    return { ok: true, message: "Branch updated successfully." };
  } catch {
    return { ok: false, message: "We could not update this branch." };
  }
}
export async function deleteBranchAction(id: string) {
  const actor = await requirePermission("branches", "delete");
  const [activeCount, userReference, vehicleReference] = await Promise.all([
    db.select({ count: count() }).from(branches).where(eq(branches.isActive, true)),
    db
      .select({ id: userBranches.userId })
      .from(userBranches)
      .where(eq(userBranches.branchId, id))
      .limit(1),
    db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.branchId, id)).limit(1),
  ]);
  if ((activeCount[0]?.count ?? 0) <= 1)
    return { ok: false, message: "The system must retain at least one active branch." };
  if (userReference.length || vehicleReference.length)
    return {
      ok: false,
      message:
        "This branch is connected to existing records and cannot be deleted. Deactivate it instead.",
    };
  await db.delete(branches).where(eq(branches.id, id));
  await audit("BRANCH_DELETED", "branch", id, actor.id);
  revalidatePath("/en/admin/branches");
  return { ok: true, message: "Branch deleted successfully." };
}
export async function createUserAction(formData: FormData) {
  const actor = await requirePermission("users", "create");
  const parsed = userSchema.safeParse({
    ...Object.fromEntries(formData),
    branchIds: [...new Set(formData.getAll("branchIds").map(String))],
    permissions: [...new Set(formData.getAll("permissions").map(String))],
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid user details." };
  const input = parsed.data;
  const scopeCheck = validateUserAssignment(actor, {
    role: input.role,
    branchIds: input.branchIds,
  });
  if (!scopeCheck.ok) return scopeCheck;
  try {
    await db.transaction(async (tx) => {
      if (input.branchIds.length) {
        const validBranches = await tx
          .select({ id: branches.id })
          .from(branches)
          .where(and(inArray(branches.id, input.branchIds), eq(branches.isActive, true)));
        if (validBranches.length !== input.branchIds.length)
          throw new Error("One or more selected branches are invalid or inactive.");
      }
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash: await passwordHash(input.initialPassword),
        })
        .returning();
      const [role] = await tx.select().from(roles).where(eq(roles.name, input.role));
      if (!role) throw new Error("Role configuration missing.");
      await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
      if (input.branchIds.length)
        await tx
          .insert(userBranches)
          .values(input.branchIds.map((branchId) => ({ userId: user.id, branchId })));
      if (input.permissions.length)
        await tx.insert(userPermissions).values(
          input.permissions.map((p) => {
            const [module, action] = p.split(":");
            return { userId: user.id, module, action };
          }),
        );
      await tx.insert(auditLogs).values([
        {
          actorId: actor.id,
          event: "USER_CREATED",
          entityType: "user",
          entityId: user.id,
          metadata: {
            username: user.username,
            displayName: user.displayName,
            role: input.role,
            branchIds: input.branchIds,
          },
        },
        {
          actorId: actor.id,
          event: "ROLE_CHANGED",
          entityType: "user",
          entityId: user.id,
          metadata: { to: input.role },
        },
        {
          actorId: actor.id,
          event: "PERMISSIONS_CHANGED",
          entityType: "user",
          entityId: user.id,
          metadata: { added: input.permissions, removed: [], total: input.permissions.length },
        },
      ]);
    });
  } catch (error) {
    const code =
      typeof error === "object" && error && "cause" in error
        ? (error.cause as { code?: string } | null)?.code
        : undefined;
    if (code === "23505")
      return { ok: false, message: "That username is already in use. Choose another username." };
    return {
      ok: false,
      message:
        error instanceof Error && error.name !== "DrizzleQueryError"
          ? error.message
          : "We could not create this user. Please try again.",
    };
  }
  revalidateUsersPaths();
  return { ok: true, message: "User created successfully." };
}

export async function updateUserAction(id: string, formData: FormData) {
  const actor = await requirePermission("users", "update");
  if (!uuidSchema.safeParse(id).success) return { ok: false, message: "Invalid user identifier." };
  const parsed = userUpdateSchema.safeParse({
    ...Object.fromEntries(formData),
    branchIds: [...new Set(formData.getAll("branchIds").map(String))],
    permissions: [...new Set(formData.getAll("permissions").map(String))],
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid user details." };
  const input = parsed.data;
  const scopeCheck = validateUserAssignment(actor, {
    role: input.role,
    branchIds: input.branchIds,
  });
  if (!scopeCheck.ok) return scopeCheck;
  try {
    await db.transaction(async (tx) => {
      const [existingUser] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existingUser) throw new Error("User not found.");
      const [currentRoleRow] = await tx
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, id))
        .limit(1);
      const currentRole: UserRole = currentRoleRow?.name ?? "USER";
      const currentBranches = await tx
        .select({ branchId: userBranches.branchId })
        .from(userBranches)
        .where(eq(userBranches.userId, id));
      const currentBranchIds = currentBranches.map((row) => row.branchId);
      if (!canManageUserTarget(actor, { id, role: currentRole, branchIds: currentBranchIds }))
        throw new Error("You do not have permission to edit this user.");
      if (currentRole === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
        const [otherSuperAdmins] = await tx
          .select({ count: count() })
          .from(users)
          .innerJoin(userRoles, eq(userRoles.userId, users.id))
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(and(eq(roles.name, "SUPER_ADMIN"), eq(users.isActive, true), ne(users.id, id)));
        if ((otherSuperAdmins?.count ?? 0) < 1)
          throw new Error("The system must retain at least one active Super Admin.");
      }
      if (input.branchIds.length) {
        const validBranches = await tx
          .select({ id: branches.id })
          .from(branches)
          .where(and(inArray(branches.id, input.branchIds), eq(branches.isActive, true)));
        if (validBranches.length !== input.branchIds.length)
          throw new Error("One or more selected branches are invalid or inactive.");
      }
      const [newRole] = await tx.select().from(roles).where(eq(roles.name, input.role)).limit(1);
      if (!newRole) throw new Error("Role configuration missing.");
      const existingPerms = await tx
        .select({ module: userPermissions.module, action: userPermissions.action })
        .from(userPermissions)
        .where(and(eq(userPermissions.userId, id), eq(userPermissions.granted, true)));
      const beforePerms = existingPerms.map((p) => `${p.module}:${p.action}`);
      const permDiff = diffPermissions(beforePerms, input.permissions);

      await tx
        .update(users)
        .set({ displayName: input.displayName, updatedAt: new Date() })
        .where(eq(users.id, id));
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.insert(userRoles).values({ userId: id, roleId: newRole.id });
      await tx.delete(userBranches).where(eq(userBranches.userId, id));
      if (input.branchIds.length)
        await tx
          .insert(userBranches)
          .values(input.branchIds.map((branchId) => ({ userId: id, branchId })));
      await tx.delete(userPermissions).where(eq(userPermissions.userId, id));
      if (input.permissions.length)
        await tx.insert(userPermissions).values(
          input.permissions.map((p) => {
            const [module, action] = p.split(":");
            return { userId: id, module, action };
          }),
        );

      const logEntries: (typeof auditLogs.$inferInsert)[] = [
        {
          actorId: actor.id,
          event: "USER_UPDATED",
          entityType: "user",
          entityId: id,
          metadata: {
            previousDisplayName: existingUser.displayName,
            displayName: input.displayName,
            previousBranchIds: currentBranchIds,
            branchIds: input.branchIds,
          },
        },
      ];
      if (currentRole !== input.role)
        logEntries.push({
          actorId: actor.id,
          event: "ROLE_CHANGED",
          entityType: "user",
          entityId: id,
          metadata: { from: currentRole, to: input.role },
        });
      if (permDiff.changed)
        logEntries.push({
          actorId: actor.id,
          event: "PERMISSIONS_CHANGED",
          entityType: "user",
          entityId: id,
          metadata: {
            added: permDiff.added,
            removed: permDiff.removed,
            total: input.permissions.length,
          },
        });
      await tx.insert(auditLogs).values(logEntries);
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name !== "DrizzleQueryError"
          ? error.message
          : "We could not update this user. Please try again.",
    };
  }
  revalidateUsersPaths();
  return { ok: true, message: "User updated successfully." };
}

export async function setUserActiveAction(id: string, active: boolean) {
  const actor = await requirePermission("users", active ? "update" : "delete");
  if (!uuidSchema.safeParse(id).success) return { ok: false, message: "Invalid user identifier." };
  if (!active && actor.id === id)
    return { ok: false, message: "You cannot deactivate your own account." };
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) throw new Error("User not found.");
      const [roleRow] = await tx
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, id))
        .limit(1);
      const targetRole: UserRole = roleRow?.name ?? "USER";
      const targetBranches = await tx
        .select({ branchId: userBranches.branchId })
        .from(userBranches)
        .where(eq(userBranches.userId, id));
      if (
        !canManageUserTarget(actor, {
          id,
          role: targetRole,
          branchIds: targetBranches.map((b) => b.branchId),
        })
      )
        throw new Error("You do not have permission to change this user's status.");
      if (!active && targetRole === "SUPER_ADMIN") {
        const [otherSuperAdmins] = await tx
          .select({ count: count() })
          .from(users)
          .innerJoin(userRoles, eq(userRoles.userId, users.id))
          .innerJoin(roles, eq(roles.id, userRoles.roleId))
          .where(and(eq(roles.name, "SUPER_ADMIN"), eq(users.isActive, true), ne(users.id, id)));
        if ((otherSuperAdmins?.count ?? 0) < 1)
          throw new Error("The system must retain at least one active Super Admin.");
      }
      await tx
        .update(users)
        .set({
          isActive: active,
          deactivatedAt: active ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      if (!active) await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        event: active ? "USER_UPDATED" : "USER_DEACTIVATED",
        entityType: "user",
        entityId: id,
        metadata: { active },
      });
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name !== "DrizzleQueryError"
          ? error.message
          : "We could not update this user's status.",
    };
  }
  revalidateUsersPaths();
  return {
    ok: true,
    message: active ? "User activated successfully." : "User deactivated successfully.",
  };
}
