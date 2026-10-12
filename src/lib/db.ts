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
  PREFER_DIRECT_DB?: string
}

interface CloudflareContext {
  env: CloudflareEnv
  ctx?: object
  cf?: Record<string, unknown>
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Request-scoped Prisma clients for Cloudflare Workers
// In Cloudflare Workers, each request has a unique ExecutionContext (ctx).
// Reusing TCP sockets across different requests causes "Cannot perform I/O on behalf of a different request"
// or connection timeouts. Using a WeakMap keyed by ctx guarantees fresh connections per request without cross-request leaks.
const requestClients = new WeakMap<object, PrismaClient>()

export function getCloudflareContextSafe(): CloudflareContext | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare')
    const ctx = getCloudflareContext() as CloudflareContext | null
    if (ctx?.env) return ctx
  } catch {
    // Not running inside a Cloudflare request or opennextjs context
  }

  try {
    const rawCtx = (globalThis as any)[Symbol.for('__cloudflare-context__')] as CloudflareContext | null
    if (rawCtx?.env) return rawCtx
  } catch {
    // ignore
  }

  return null
}

export function getCloudflareEnv(): CloudflareEnv | null {
  return getCloudflareContextSafe()?.env ?? null
}

export function getConnectionString(): string {
  const cfEnv = getCloudflareEnv()

  // Prefer direct DATABASE_URL if configured to bypass Hyperdrive issues
  const preferDirect =
    cfEnv?.PREFER_DIRECT_DB === 'true' || process.env.PREFER_DIRECT_DB === 'true'

  if (preferDirect) {
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

  // MP-34: dummy URL only for tests — never silently in production/dev server.
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return 'postgresql://dummy:dummy@localhost:5432/dummy'
  }
  throw new Error(
    "[db] DATABASE_URL is not set and no Hyperdrive binding is available. Refusing to use a dummy connection string outside tests."
  )
}

function getPrismaClientClass(): typeof PrismaClient {
  const isCloudflare = Boolean(
    typeof (globalThis as any).WebSocketPair !== 'undefined' ||
    process.env.NEXT_RUNTIME === 'edge' ||
    getCloudflareContextSafe() !== null
  )

  if (isCloudflare) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const edge = require('@prisma/client/edge')
      if (edge?.PrismaClient) return edge.PrismaClient
    } catch {
      // Fallback
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@prisma/client').PrismaClient
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

  const poolConfig = {
    connectionString: cleanUrl,
    max: isEdgeOrWorker ? 2 : (process.env.DATABASE_POOL_SIZE ? parseInt(process.env.DATABASE_POOL_SIZE, 10) : 10),
    idleTimeoutMillis: isEdgeOrWorker ? 3000 : 10000,
    connectionTimeoutMillis: isEdgeOrWorker ? 5000 : 10000,
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

  const PrismaClientClass = getPrismaClientClass()

  return new PrismaClientClass({
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
 * Reset cached clients. Disconnects the old pool first so pool sockets
 * do not leak (MP-04). Only resets on specific transport error codes —
 * never on plain query timeouts or message-substring matches.
 */
export async function resetPrismaClient(): Promise<void> {
  const cfCtx = getCloudflareContextSafe()
  if (cfCtx?.ctx && typeof cfCtx.ctx === 'object') {
    const old = requestClients.get(cfCtx.ctx)
    requestClients.delete(cfCtx.ctx)
    if (old) await old.$disconnect().catch(() => {})
    return
  }
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
  const cfCtx = getCloudflareContextSafe()
  // In Cloudflare Workers:
  // Key the client by request ExecutionContext (ctx) to ensure connections belong exclusively to this request.
  if (cfCtx?.ctx && typeof cfCtx.ctx === 'object') {
    let client = requestClients.get(cfCtx.ctx)
    if (!client) {
      const connStr = getConnectionString()
      client = createPrismaClient(connStr)
      requestClients.set(cfCtx.ctx, client)
    }
    return client
  }

  if (cfCtx) {
    const connStr = getConnectionString()
    return createPrismaClient(connStr)
  }

  // MP-04: Node singleton in ALL environments (dev, test, production).
  return getNodePrismaClient()
}

/**
 * Lazy PrismaClient proxy:
 * Ensures Cloudflare Hyperdrive / request context is resolved dynamically on request,
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
