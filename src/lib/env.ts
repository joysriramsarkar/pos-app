import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL:    z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
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
