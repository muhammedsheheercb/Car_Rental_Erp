import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "./client";
import { roles, userRoles, users } from "./schema";

async function seed() {
  if (!env.INITIAL_SUPER_ADMIN_USERNAME || !env.INITIAL_SUPER_ADMIN_PASSWORD)
    throw new Error(
      "Set INITIAL_SUPER_ADMIN_USERNAME and INITIAL_SUPER_ADMIN_PASSWORD before seeding.",
    );
  await db.transaction(async (tx) => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "USER"] as const)
      await tx
        .insert(roles)
        .values({ name: role, description: `${role} system role` })
        .onConflictDoNothing();
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.username, env.INITIAL_SUPER_ADMIN_USERNAME as string))
      .limit(1);
    if (existing) throw new Error("Initial super-admin already exists.");
    const [user] = await tx
      .insert(users)
      .values({
        username: env.INITIAL_SUPER_ADMIN_USERNAME as string,
        displayName: "System Owner",
        passwordHash: await hash(env.INITIAL_SUPER_ADMIN_PASSWORD as string, {
          memoryCost: 19456,
          timeCost: 2,
          parallelism: 1,
        }),
        mustChangePassword: true,
      })
      .returning();
    const [role] = await tx.select().from(roles).where(eq(roles.name, "SUPER_ADMIN"));
    if (!role) throw new Error("Could not create SUPER_ADMIN role.");
    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
  });
  console.log("Initial super-admin created. Change the password after first login.");
}
seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
