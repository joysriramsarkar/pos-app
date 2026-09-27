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

  return 'postgresql://dummy:dummy@localhost:5432/dummy'
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

  // In Node.js / Vercel / local development:
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const connStr = getConnectionString()
  const client = createPrismaClient(connStr)

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
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
              if (
                err?.message?.includes('timeout') ||
                err?.message?.includes('Connection') ||
                err?.message?.includes('closed') ||
                err?.code === 'ECONNRESET' ||
                err?.code === 'EPIPE'
              ) {
                console.warn('[PrismaClient] Connection error detected:', err.message)
                const cfCtx = getCloudflareContextSafe()
                if (cfCtx?.ctx && typeof cfCtx.ctx === 'object') {
                  requestClients.delete(cfCtx.ctx)
                } else {
                  globalForPrisma.prisma = undefined
                }
              }
              throw err
            })
          }
          return res
        } catch (syncErr: any) {
          const cfCtx = getCloudflareContextSafe()
          if (cfCtx?.ctx && typeof cfCtx.ctx === 'object') {
            requestClients.delete(cfCtx.ctx)
          } else {
            globalForPrisma.prisma = undefined
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
