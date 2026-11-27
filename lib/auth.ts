import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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
import { env } from "@/lib/env";

const COOKIE = "muscat_cars_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 8 * 60 * 60,
};

const hashText = (value: string) => createHash("sha256").update(value).digest("hex");
const hashIp = (ip: string) => createHmac("sha256", env.SESSION_SECRET).update(ip).digest("hex");

export const passwordHash = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const passwordVerify = (password: string, passwordHashValue: string) =>
  verify(passwordHashValue, password);

let dummyHashPromise: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = passwordHash("muscat-cars-constant-time-dummy-secret");
  }
  return dummyHashPromise;
}

async function requestIpHash() {
  const h = await headers();
  // Prefer proxy-overwritten edge headers; fall back to the rightmost X-Forwarded-For hop
  // so clients cannot bypass rate limits by injecting forged leftmost X-Forwarded-For entries.
  const cfIp = h.get("cf-connecting-ip")?.trim();
  const realIp = h.get("x-real-ip")?.trim();
  const xffParts = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const rawIp = cfIp || realIp || xffParts?.[xffParts.length - 1] || "unknown";
  return hashIp(rawIp);
}

export async function audit(
  event: typeof auditLogs.$inferInsert.event,
  entityType: string,
  entityId?: string,
  actorId?: string,
  branchId?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    event,
    entityType,
    entityId,
    actorId,
    branchId,
    metadata: metadata ?? {},
    ipHash: await requestIpHash(),
  });
}

export async function login(rawUsername: string, password: string) {
  const username = rawUsername.trim().toLowerCase();
  const ipHash = await requestIpHash();
  const since = new Date(Date.now() - 15 * 60 * 1000);

  // Layered rate limits: per (username, IP), global per username, and global per IP (anti-spraying).
  const [[userIpFailures], [globalUserFailures], [globalIpFailures]] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.ipHash, ipHash),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.createdAt, since),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, username),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.createdAt, since),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ipHash, ipHash),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.createdAt, since),
        ),
      ),
  ]);

  if (
    (userIpFailures?.cnt ?? 0) >= 5 ||
    (globalUserFailures?.cnt ?? 0) >= 15 ||
    (globalIpFailures?.cnt ?? 0) >= 25
  ) {
    return { ok: false as const, error: "Too many failed attempts. Try again in 15 minutes." };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);

  // Always run Argon2id verify (against a dummy hash if user is absent/inactive) to prevent timing enumeration.
  const candidateHash = user?.isActive ? user.passwordHash : await getDummyPasswordHash();
  const verified = await passwordVerify(password, candidateHash).catch(() => false);
  const valid = Boolean(user?.isActive && verified);

  await db.insert(loginAttempts).values({ username, ipHash, succeeded: valid });
  if (!valid || !user) {
    await audit("LOGIN_FAILURE", "session");
    return { ok: false as const, error: "Invalid username or password." };
  }

  const store = await cookies();
  const previousToken = store.get(COOKIE)?.value;
  if (previousToken) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashText(previousToken)));
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashText(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ipHash,
  });
  store.set(COOKIE, token, SESSION_COOKIE_OPTIONS);
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

async function loadIdentity(): Promise<Identity | null> {
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

  const [[role], branchRows, permissions] = await Promise.all([
    db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))
      .limit(1),
    db
      .select({ branchId: userBranches.branchId })
      .from(userBranches)
      .where(eq(userBranches.userId, user.id)),
    db
      .select()
      .from(userPermissions)
      .where(and(eq(userPermissions.userId, user.id), eq(userPermissions.granted, true))),
  ]);

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

// Per-request deduplication via React.cache eliminates 15 redundant auth queries across Layout -> AppShell -> Page.
export const getIdentity = cache(loadIdentity);

export async function requireIdentity(options?: {
  allowMustChangePassword?: boolean;
  locale?: string;
}) {
  const identity = await getIdentity();
  const loc = options?.locale === "ar" ? "ar" : "en";
  if (!identity) redirect(`/${loc}/login`);
  if (identity.mustChangePassword && !options?.allowMustChangePassword) {
    redirect(`/${loc}/change-password`);
  }
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
  const identity = await getIdentity();
  if (!identity) redirect("/en/login");
  if (identity.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  if (!can(identity, module, action, branchId)) throw new Error("FORBIDDEN");
  return identity;
}

export async function requirePagePermission(
  locale: string,
  module: string,
  action: string,
  branchId?: string,
) {
  const loc = locale === "ar" ? "ar" : "en";
  const identity = await requireIdentity({ locale: loc });
  if (!can(identity, module, action, branchId)) {
    redirect(`/${loc}/forbidden`);
  }
  return identity;
}

export async function changePassword(
  identity: Identity,
  currentPassword: string,
  newPassword: string,
) {
  const [user] = await db.select().from(users).where(eq(users.id, identity.id)).limit(1);
  if (!user || !(await passwordVerify(currentPassword, user.passwordHash))) return false;
  const nextPasswordHash = await passwordHash(newPassword);
  const ipHash = await requestIpHash();
  const newToken = randomBytes(32).toString("base64url");

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: nextPasswordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, identity.id));
    // Revoke ALL existing sessions and rotate to a brand-new session token.
    await tx.delete(sessions).where(eq(sessions.userId, identity.id));
    await tx.insert(sessions).values({
      userId: identity.id,
      tokenHash: hashText(newToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash,
    });
  });

  (await cookies()).set(COOKIE, newToken, SESSION_COOKIE_OPTIONS);
  await audit("PASSWORD_CHANGED", "user", identity.id, identity.id);
  return true;
}
