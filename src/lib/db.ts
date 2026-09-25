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
  // opennextjs-cloudflare request context-এ sync call করা যায়।
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const ctx = getCloudflareContext() as { env: CloudflareEnv } | null
    if (ctx?.env?.HYPERDRIVE?.connectionString) {
      return ctx.env.HYPERDRIVE.connectionString
    }
  } catch {
    // Not in request context or Node.js environment
  }

  const envUrl = process.env.DATABASE_URL
  if (envUrl) {
    return envUrl
  }

  // Neon direct pooler fallback
  return "postgresql://neondb_owner:npg_w5VvfR1XTDMN@ep-odd-hall-azkgbyhl-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
}

function createPrismaClient(connectionString: string): PrismaClient {
  const pool = new Pool({
    connectionString,
    max: process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  })
  const adapter = new PrismaPg(pool as unknown as any)

  const prismaLogs: Prisma.LogDefinition[] =
    process.env.PRISMA_QUERY_LOG === 'true'
      ? [{ emit: 'stdout', level: 'query' }]
      : []

  return new PrismaClient({
    adapter,
    log: prismaLogs,
  })
}

let cachedClient: PrismaClient | null = null
let cachedConnStr: string | null = null

function getPrismaClient(): PrismaClient {
  // Development (Node.js hot-reload cache)
  if (process.env.NODE_ENV === 'development' && globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const connStr = getConnectionString()
  if (cachedClient && cachedConnStr === connStr) {
    return cachedClient
  }

  cachedClient = createPrismaClient(connStr)
  cachedConnStr = connStr

  if (process.env.NODE_ENV === 'development') {
    globalForPrisma.prisma = cachedClient
  }

  return cachedClient
}

/**
 * Lazy PrismaClient proxy:
 * Ensures Cloudflare Hyperdrive context is resolved dynamically on request,
 * while maintaining 100% compatibility with existing codebase imports (`db.user`, etc.).
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

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
