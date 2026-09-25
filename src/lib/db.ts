import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// ─── Type for Cloudflare Hyperdrive Binding ────────────────────────────────
interface HyperdriveBinding {
  connectionString: string
}

interface CloudflareEnv {
  HYPERDRIVE?: HyperdriveBinding
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Cloudflare Worker runtime-এ `getCloudflareContext().env.HYPERDRIVE.connectionString` পাওয়া যায়।
 * Node.js / local dev-এ `process.env.DATABASE_URL` ব্যবহার করা হয়।
 *
 * Hyperdrive Neon-এর connection pool Cloudflare-এর কাছে রেখে দেয় —
 * এতে per-request cold-start latency অনেক কমে।
 */
function getConnectionString(): string {
  // Cloudflare Worker runtime-এ getCloudflareContext() দিয়ে Hyperdrive binding পাওয়া যায়।
  // opennextjs-cloudflare v1.x API — request context-এ sync call করা যায়।
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const ctx = getCloudflareContext() as { env: CloudflareEnv } | null
    if (ctx?.env?.HYPERDRIVE?.connectionString) {
      return ctx.env.HYPERDRIVE.connectionString
    }
  } catch {
    // Node.js runtime-এ getCloudflareContext() পাওয়া যায় না — fallback করব
  }

  const envUrl = process.env.DATABASE_URL
  if (!envUrl) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PHASE === 'phase-production-build'
    ) {
      console.warn('[db] DATABASE_URL not set during build phase — using dummy.')
    } else {
      console.warn('[db] DATABASE_URL not set. DB operations will fail.')
    }
    return 'postgresql://dummy:dummy@localhost:5432/dummy'
  }
  return envUrl
}

/**
 * Strict singleton factory function for PrismaClient.
 *
 * Cloudflare Worker-এ প্রতি request-এ connection string নতুন হতে পারে (Hyperdrive),
 * তাই এখানে `getConnectionString()` call করা হয়।
 */
function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString()

  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString,
    // Serverless-এ প্রতিটি function আলাদা process — max 3 যথেষ্ট
    // বেশি দিলে Neon-এর connection limit শেষ হয়ে যায়
    max: process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : 3,
    idleTimeoutMillis: 10000, // idle connection তাড়াতাড়ি ছাড়বে
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  })
  // Compatibility workaround between different pg @types versions used by Prisma adapter
  const adapter = new PrismaPg(pool as unknown as any)

  const prismaLogs: Prisma.LogDefinition[] =
    process.env.PRISMA_QUERY_LOG === 'true'
      ? [{ emit: 'stdout', level: 'query' }]
      : []
  const shouldLogLifecycle =
    process.env.PRISMA_LOG === 'true' || process.env.NODE_ENV === 'development'

  const client = new PrismaClient({
    adapter,
    log: prismaLogs,
  })

  if (shouldLogLifecycle) {
    client.$connect().then(() => {
      console.log('[PrismaClient] Successfully connected to PostgreSQL')
    }).catch((error) => {
      console.error('[PrismaClient] Connection failed:', error)
    })
  }

  // Auto-disconnect on process termination (fixes PgBouncer prepared statement conflicts)
  process.once('SIGTERM', async () => {
    await client.$disconnect()
    process.exit(0)
  })

  // Also disconnect on SIGINT (Ctrl+C) in development
  process.once('SIGINT', async () => {
    await client.$disconnect()
    process.exit(0)
  })

  return client
}

/**
 * Strict singleton pattern - ensures only one PrismaClient instance.
 *
 * - Development (Node.js): cached in globalThis to survive hot-reloads
 * - Production (Node.js): cached to prevent connection exhaustion
 * - Cloudflare Worker: Hyperdrive manages the connection pool externally;
 *   globalThis cache still prevents duplicate clients within a single Worker isolate.
 */
export const db: PrismaClient = (() => {
  // Return existing instance if already created (prevents re-instantiation)
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const prisma = createPrismaClient()

  // Cache in globalThis to prevent connection pool exhaustion on hot-reloads and serverless invocations
  globalForPrisma.prisma = prisma

  return prisma
})()

/**
 * Execute a callback within a PostgreSQL transaction with RLS tenant context.
 *
 * Sets `app.current_business_id` as a transaction-local setting so PostgreSQL
 * RLS policies can enforce tenant isolation at the database level.
 *
 * Using SET LOCAL (not SET) ensures the setting is reset when the transaction
 * ends — critical for pooled connections where sessions are shared.
 *
 * @example
 * const result = await withTenantContext(businessId, async (tx) => {
 *   return tx.product.findMany();
 * });
 */
export async function withTenantContext<T>(
  businessId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    // SET LOCAL only applies within this transaction — safe for pooled connections
    await tx.$executeRaw`SELECT set_config('app.current_business_id', ${businessId}, TRUE)`
    return fn(tx)
  })
}
