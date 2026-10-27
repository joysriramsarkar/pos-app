import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export function getConnectionString(): string {
  const envUrl = process.env.DATABASE_URL
  if (envUrl) {
    return envUrl
  }

  // MP-34: dummy URL only for tests — never silently in production/dev server.
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return 'postgresql://dummy:dummy@localhost:5432/dummy'
  }
  throw new Error(
    "[db] DATABASE_URL is not set. Refusing to use a dummy connection string outside tests."
  )
}

function createPrismaClient(connectionString: string): PrismaClient {
  // node-postgres and pgbouncer transaction poolers do not support channel_binding=require
  const cleanUrl = connectionString
    .replace(/([?&])channel_binding=[^&]+(&|$)/, '$1')
    .replace(/[?&]$/, '')

  const isPgBouncer = /(?:[?&])pgbouncer=true(?:&|$)/i.test(cleanUrl)

  const poolConfig = {
    connectionString: cleanUrl,
    // Supabase transaction poolers reject bursts from a large app-side pool.
    // Keep the local pool bounded while still allowing parallel dashboard reads.
    max: process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : isPgBouncer ? 4 : 10,
    idleTimeoutMillis: isPgBouncer ? 5000 : 10000,
    connectionTimeoutMillis: isPgBouncer ? 20000 : 10000,
    allowExitOnIdle: true,
  }

  const adapter = new PrismaPg(poolConfig, {
    onPoolError: (err) => {
      console.error('[DB Pool error]:', err?.message || err)
    },
  })

  const prismaLogs: Prisma.LogDefinition[] =
    process.env.PRISMA_QUERY_LOG === 'true'
      ? [{ emit: 'stdout', level: 'query' }]
      : [{ emit: 'stdout', level: 'error' }]

  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
    log: prismaLogs,
  })
}

function getNodePrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient(getConnectionString())
  }
  return globalForPrisma.prisma
}

/**
 * Reset the cached client. Disconnects the old pool first so pool sockets
 * do not leak (MP-04). Only resets on specific transport error codes —
 * never on plain query timeouts or message-substring matches.
 */
export async function resetPrismaClient(): Promise<void> {
  const old = globalForPrisma.prisma
  globalForPrisma.prisma = undefined
  if (old) await old.$disconnect().catch(() => {})
}

function isTransportError(err: any): boolean {
  const code = err?.code as string | undefined
  return (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === '57P01' || // admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '08006' // connection_failure
  )
}

function getPrismaClient(): PrismaClient {
  // MP-04: Node singleton in ALL environments (dev, test, production).
  return getNodePrismaClient()
}

/**
 * Lazy PrismaClient proxy:
 * Resolves the singleton on first use and resets it automatically on
 * connection failure.
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
              if (isTransportError(err)) {
                console.warn('[PrismaClient] Transport error detected:', err?.code ?? err?.message)
                void resetPrismaClient()
              }
              throw err
            })
          }
          return res
        } catch (syncErr: any) {
          if (isTransportError(syncErr)) {
            void resetPrismaClient()
          }
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
 * RLS policies enforce tenant isolation at the database level.
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
