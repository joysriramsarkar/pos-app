import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// ─── Type for Cloudflare Hyperdrive Binding ────────────────────────────────
interface HyperdriveBinding {
  connectionString: string
}

interface CloudflareEnv {
  HYPERDRIVE?: HyperdriveBinding
  DATABASE_URL?: string
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getCloudflareEnv(): CloudflareEnv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const ctx = getCloudflareContext() as { env: CloudflareEnv } | null
    return ctx?.env ?? null
  } catch {
    return null
  }
}

function getConnectionString(): string {
  const cfEnv = getCloudflareEnv()

  // Prefer direct DATABASE_URL if configured to bypass Hyperdrive issues
  if (process.env.PREFER_DIRECT_DB === 'true') {
    const direct = cfEnv?.DATABASE_URL || process.env.DATABASE_URL
    if (direct) return direct
  }

  // Use Hyperdrive if available in Cloudflare context
  if (cfEnv?.HYPERDRIVE?.connectionString) {
    return cfEnv.HYPERDRIVE.connectionString
  }

  // Fallback to Worker secret or process.env DATABASE_URL
  const envUrl = cfEnv?.DATABASE_URL || process.env.DATABASE_URL
  if (envUrl) {
    return envUrl
  }

  return 'postgresql://dummy:dummy@localhost:5432/dummy'
}

function createPrismaClient(connectionString: string): PrismaClient {
  // node-postgres and pgbouncer/hyperdrive do not support channel_binding=require
  const cleanUrl = connectionString
    .replace(/([?&])channel_binding=[^&]+(&|$)/, '$1')
    .replace(/[?&]$/, '')

  const isEdgeOrWorker = Boolean(
    typeof (globalThis as any).WebSocketPair !== 'undefined' ||
    process.env.NEXT_RUNTIME === 'edge' ||
    getCloudflareEnv() !== null
  )

  const pool = new Pool({
    connectionString: cleanUrl,
    max: isEdgeOrWorker ? 5 : (process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : 10),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
  })

  pool.on('error', (err) => {
    console.error('[DB Pool error] Resetting cached client:', err?.message || err)
    cachedClient = null
    cachedConnStr = null
  })

  const adapter = new PrismaPg(pool as unknown as any)

  const prismaLogs: Prisma.LogDefinition[] =
    process.env.PRISMA_QUERY_LOG === 'true'
      ? [{ emit: 'stdout', level: 'query' }]
      : []

  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 15000,
      timeout: 30000,
    },
    log: prismaLogs,
  })
}

let cachedClient: PrismaClient | null = null
let cachedConnStr: string | null = null

function getPrismaClient(): PrismaClient {
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
 * resets automatically on connection failure.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') {
      return (...args: any[]) => {
        try {
          const res = value.apply(client, args)
          if (res && typeof res.catch === 'function') {
            return res.catch((err: any) => {
              if (
                err?.message?.includes('timeout') ||
                err?.message?.includes('Connection') ||
                err?.message?.includes('closed') ||
                err?.code === 'ECONNRESET' ||
                err?.code === 'EPIPE'
              ) {
                console.warn('[PrismaClient] Connection error detected, resetting client cache:', err.message)
                cachedClient = null
                cachedConnStr = null
              }
              throw err
            })
          }
          return res
        } catch (syncErr: any) {
          cachedClient = null
          cachedConnStr = null
          throw syncErr
        }
      }
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
