import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Strict singleton factory function for PrismaClient
 * Prevents connection exhaustion during hot-reloading
 */
function createPrismaClient(): PrismaClient {
  // Create PostgreSQL connection pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      // Allow build to pass without DATABASE_URL by returning a mock client or avoiding throwing
      console.warn('DATABASE_URL environment variable is not set during build phase.');
    } else {
      console.warn('DATABASE_URL environment variable is not set. Database operations will fail.');
    }
  }

  // Use dummy connection string if building to prevent throw
  const pool = new Pool({
    connectionString: connectionString || "postgresql://dummy:dummy@localhost:5432/dummy",
    max: 5,
    idleTimeoutMillis: 30000,
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

  // Auto-disconnect on process termination (fixes PgBouncer prepared statement conflicts on Vercel)
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
 * Strict singleton pattern - ensures only one PrismaClient instance
 * In development: cached in globalThis to survive hot-reloads
 * In production: also cached to prevent connection exhaustion
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
