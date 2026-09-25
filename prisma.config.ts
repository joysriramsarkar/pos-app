import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 Configuration
 *
 * - `datasource.url`: CLI operations (migrate, seed) এর জন্য direct (non-pooled) URL
 *   Neon-এর DIRECT_URL ব্যবহার করো — pooled URL migration-এ কাজ করে না।
 *
 * - Runtime (app)-এ PrismaClient adapter দিয়ে connection পায় (src/lib/db.ts):
 *   Cloudflare Worker → Hyperdrive.connectionString
 *   Node.js / local → process.env.DATABASE_URL
 *
 * দেখো: https://pris.ly/d/config-datasource
 */
export default defineConfig({
  datasource: {
    // DIRECT_URL: non-pooled connection — prisma migrate, db push, seed-এর জন্য
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
