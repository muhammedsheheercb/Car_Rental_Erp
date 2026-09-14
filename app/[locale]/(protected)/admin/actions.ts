"use server";
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  auditLogs,
  branches,
  roles,
  userBranches,
  userPermissions,
  userRoles,
  users,
  vehicles,
} from "@/db/schema";
import { audit, passwordHash, requirePermission } from "@/lib/auth";
import { branchCreateSchema, branchSchema, userSchema } from "@/lib/validation";

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
    branchIds: formData.getAll("branchIds"),
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter valid user details." };
  const input = parsed.data;
  await db.transaction(async (tx) => {
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
      { actorId: actor.id, event: "USER_CREATED", entityType: "user", entityId: user.id },
      { actorId: actor.id, event: "ROLE_CHANGED", entityType: "user", entityId: user.id },
      { actorId: actor.id, event: "PERMISSIONS_CHANGED", entityType: "user", entityId: user.id },
    ]);
  });
  revalidatePath("/en/admin/users");
  return { ok: true, message: "User created successfully." };
}
export async function deactivateUserAction(id: string) {
  const actor = await requirePermission("users", "delete");
  if (actor.id === id) throw new Error("You cannot deactivate your own account.");
  await db
    .update(users)
    .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
  await audit("USER_DEACTIVATED", "user", id, actor.id);
  revalidatePath("/en/admin/users");
}
