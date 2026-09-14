import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  auditLogs,
  loginAttempts,
  roles,
  sessions,
  userBranches,
  userPermissions,
  userRoles,
  users,
} from "@/db/schema";

const COOKIE = "muscat_cars_session";
const hashText = (value: string) => createHash("sha256").update(value).digest("hex");
export const passwordHash = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const passwordVerify = (password: string, passwordHashValue: string) =>
  verify(passwordHashValue, password);

async function requestIpHash() {
  const h = await headers();
  return hashText(h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown");
}
export async function audit(
  event: typeof auditLogs.$inferInsert.event,
  entityType: string,
  entityId?: string,
  actorId?: string,
) {
  await db
    .insert(auditLogs)
    .values({ event, entityType, entityId, actorId, ipHash: await requestIpHash() });
}

export async function login(username: string, password: string) {
  const ipHash = await requestIpHash();
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const failures = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, username),
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.succeeded, false),
        gt(loginAttempts.createdAt, since),
      ),
    );
  if (failures.length >= 5)
    return { ok: false as const, error: "Too many failed attempts. Try again in 15 minutes." };
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const valid = Boolean(user?.isActive && (await passwordVerify(password, user.passwordHash)));
  await db.insert(loginAttempts).values({ username, ipHash, succeeded: valid });
  if (!valid || !user) {
    await audit("LOGIN_FAILURE", "session");
    return { ok: false as const, error: "Invalid username or password." };
  }
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashText(token),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    ipHash,
  });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  await audit("LOGIN_SUCCESS", "session", undefined, user.id);
  return { ok: true as const, mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const identity = await getIdentity();
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashText(token)));
  store.delete(COOKIE);
  if (identity) await audit("LOGOUT", "session", undefined, identity.id);
}

export type Identity = {
  id: string;
  username: string;
  displayName: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  branchIds: string[];
  permissions: Set<string>;
  mustChangePassword: boolean;
};
export async function getIdentity(): Promise<Identity | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashText(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.isActive, true)))
    .limit(1);
  if (!user) return null;
  const [role] = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))
    .limit(1);
  const branchRows = await db
    .select({ branchId: userBranches.branchId })
    .from(userBranches)
    .where(eq(userBranches.userId, user.id));
  const permissions = await db
    .select()
    .from(userPermissions)
    .where(and(eq(userPermissions.userId, user.id), eq(userPermissions.granted, true)));
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: role?.name ?? "USER",
    branchIds: branchRows.map((x) => x.branchId),
    permissions: new Set(permissions.map((x) => `${x.module}:${x.action}`)),
    mustChangePassword: user.mustChangePassword,
  };
}
export async function requireIdentity() {
  const identity = await getIdentity();
  if (!identity) redirect("/en/login");
  return identity;
}
export function can(identity: Identity, module: string, action: string, branchId?: string) {
  return (
    identity.role === "SUPER_ADMIN" ||
    ((!branchId || identity.branchIds.includes(branchId)) &&
      identity.permissions.has(`${module}:${action}`))
  );
}
export async function requirePermission(module: string, action: string, branchId?: string) {
  const identity = await requireIdentity();
  if (!can(identity, module, action, branchId)) throw new Error("FORBIDDEN");
  return identity;
}
export async function changePassword(
  identity: Identity,
  currentPassword: string,
  newPassword: string,
) {
  const [user] = await db.select().from(users).where(eq(users.id, identity.id));
  if (!user || !(await passwordVerify(currentPassword, user.passwordHash))) return false;
  await db
    .update(users)
    .set({
      passwordHash: await passwordHash(newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, identity.id));
  await audit("PASSWORD_CHANGED", "user", identity.id, identity.id);
  return true;
}
