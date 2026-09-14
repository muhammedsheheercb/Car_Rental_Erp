import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    INITIAL_SUPER_ADMIN_USERNAME: z.string().min(3).optional(),
    INITIAL_SUPER_ADMIN_PASSWORD: z.string().min(12).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    INITIAL_SUPER_ADMIN_USERNAME: process.env.INITIAL_SUPER_ADMIN_USERNAME,
    INITIAL_SUPER_ADMIN_PASSWORD: process.env.INITIAL_SUPER_ADMIN_PASSWORD,
  },
  emptyStringAsUndefined: true,
});
