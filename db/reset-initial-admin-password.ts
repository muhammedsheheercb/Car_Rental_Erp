import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "./client";
import { sessions, users } from "./schema";

async function resetInitialAdminPassword() {
  if (!env.INITIAL_SUPER_ADMIN_USERNAME || !env.INITIAL_SUPER_ADMIN_PASSWORD)
    throw new Error("Set INITIAL_SUPER_ADMIN_USERNAME and INITIAL_SUPER_ADMIN_PASSWORD first.");
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, env.INITIAL_SUPER_ADMIN_USERNAME))
    .limit(1);
  if (!user) throw new Error("Configured initial Super Admin was not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hash(env.INITIAL_SUPER_ADMIN_PASSWORD as string, {
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  console.log("Initial Super Admin password reset. Sign in and change it immediately.");
}

resetInitialAdminPassword().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
