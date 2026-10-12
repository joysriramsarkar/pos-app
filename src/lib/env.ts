import { z } from "zod";

const baseSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().optional().default("https://pos.onuron.org"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Optional
  DIRECT_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESTORE_CONFIRMATION_TOKEN: z.string().optional(),
});

const parsed = baseSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.warn(`[env] Environment variable warnings:\n${issues}`);
}

// MP-34: production fail-fast. Warn-and-continue hides misconfiguration;
// refuse to boot in production without required secrets/URLs.
// Dummy database URL is only allowed in test.
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  const missing: string[] = [];
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("dummy:dummy")) {
    missing.push("DATABASE_URL (or Hyperdrive binding) is required in production");
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    missing.push("NEXTAUTH_SECRET must be at least 32 characters in production");
  }
  if (!process.env.NEXTAUTH_URL) {
    missing.push("NEXTAUTH_URL is required in production");
  }
  if (!process.env.ALLOWED_ORIGINS) {
    missing.push("ALLOWED_ORIGINS is required in production (exact origins, comma-separated)");
  }
  const restore = process.env.RESTORE_CONFIRMATION_TOKEN;
  if (!restore || restore.length < 32) {
    missing.push("RESTORE_CONFIRMATION_TOKEN must be at least 32 characters in production");
  }
  if (missing.length > 0 && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`[env] Missing/invalid production environment:\n  • ${missing.join("\n  • ")}`);
  }
}

export const env = parsed.success ? parsed.data : (process.env as any);
