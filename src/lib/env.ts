import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL:    z.string().min(1).optional().default("postgresql://neondb_owner:npg_w5VvfR1XTDMN@ep-odd-hall-azkgbyhl-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"),
  NEXTAUTH_SECRET: z.string().min(32).optional().default("2ne9ID5IkSJcykq9lkQrUsY6A2RuUPY/xnhxFOFvlFM="),
  NEXTAUTH_URL:    z.string().optional().default("https://pos.onuron.org"),
  NODE_ENV:        z.enum(["development", "test", "production"]).default("development"),
  // Optional
  DIRECT_URL:           z.string().optional(),
  ALLOWED_ORIGINS:      z.string().optional(),
  SEED_ADMIN_PASSWORD:  z.string().optional(),
  UPSTASH_REDIS_REST_URL:   z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.warn(`[env] Environment variable warnings:\n${issues}`);
}

export const env = parsed.success ? parsed.data : (process.env as any);
