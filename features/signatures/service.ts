import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { userBranches, userSignatures, users } from "@/db/schema";
import { can, type Identity } from "@/lib/auth";
import { validateEvidencePhoto } from "@/lib/image-file";
import { getPrivateCustomerDocument, putPrivateCustomerDocument } from "@/lib/r2";
export const canManageOtherSignatures = (actor: Identity) =>
  ["ADMIN", "SUPER_ADMIN"].includes(actor.role) &&
  can(actor, "settings", "update") &&
  can(actor, "users", "update");
export async function signatureUsers(actor: Identity) {
  return db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        canManageOtherSignatures(actor)
          ? actor.role === "SUPER_ADMIN"
            ? undefined
            : or(
                eq(users.id, actor.id),
                actor.branchIds.length
                  ? sql`exists(select 1 from ${userBranches} where ${userBranches.userId}=${users.id} and ${userBranches.branchId} in (${sql.join(
                      actor.branchIds.map((id) => sql`${id}`),
                      sql`, `,
                    )}))`
                  : undefined,
              )
          : eq(users.id, actor.id),
      ),
    );
}
export async function mayAccessSignature(actor: Identity, userId: string) {
  if (actor.id === userId) return true;
  if (!canManageOtherSignatures(actor)) return false;
  return (await signatureUsers(actor)).some((u) => u.id === userId);
}
export async function saveSignature(raw: unknown, file: File, actor: Identity) {
  const input = z.object({ userId: z.uuid() }).parse(raw);
  if (!can(actor, "settings", "update") || !(await mayAccessSignature(actor, input.userId)))
    throw new Error("Signature user not found or access denied.");
  await validateEvidencePhoto(file);
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.isActive, true)))
      .for("update");
    if (!target) throw new Error("Select an active user.");
    const objectKey = `user-signatures/${target.id}/${crypto.randomUUID()}`;
    await putPrivateCustomerDocument(objectKey, file);
    await tx
      .update(userSignatures)
      .set({ isCurrent: false })
      .where(and(eq(userSignatures.userId, target.id), eq(userSignatures.isCurrent, true)));
    const [signature] = await tx
      .insert(userSignatures)
      .values({
        userId: target.id,
        objectKey,
        contentType: file.type,
        sizeBytes: file.size,
        uploadedBy: actor.id,
      })
      .returning();
    return signature;
  });
}
// Only document loaders call this, after checking document read/print and branch permissions.
export async function documentSignature(userId: string | null) {
  if (!userId) return null;
  const [signature] = await db
    .select()
    .from(userSignatures)
    .where(and(eq(userSignatures.userId, userId), eq(userSignatures.isCurrent, true)));
  if (!signature) return null;
  try {
    const object = await getPrivateCustomerDocument(signature.objectKey);
    if (!object.Body) throw new Error("Signature object has no image body.");
    return {
      id: signature.id,
      src: `data:${signature.contentType};base64,${Buffer.from(await object.Body.transformToByteArray()).toString("base64")}`,
    };
  } catch {
    throw new Error(
      "A configured user signature could not be loaded. Check private document storage before printing.",
    );
  }
}
