import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public health check — no auth (excluded from proxy matcher).
 * Safe for uptime monitors; does not leak secrets.
 */
export async function GET() {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  let cfEnv: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    cfEnv = getCloudflareContext()?.env;
  } catch {}

  const hasHyperdrive = Boolean(cfEnv?.HYPERDRIVE?.connectionString);
  const hasDirectUrl = Boolean(cfEnv?.DATABASE_URL || process.env.DATABASE_URL);
  const preferDirect = cfEnv?.PREFER_DIRECT_DB === 'true' || process.env.PREFER_DIRECT_DB === 'true';

  let rawPgTest: any = null;
  const targetConn = hasHyperdrive && !preferDirect ? cfEnv.HYPERDRIVE.connectionString : (cfEnv?.DATABASE_URL || process.env.DATABASE_URL);

  if (targetConn) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');
      const clean = targetConn.replace(/([?&])channel_binding=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
      const testPool = new Pool({ connectionString: clean, max: 1, connectionTimeoutMillis: 5000 });
      const queryRes = await testPool.query('SELECT NOW() as now, current_database() as db');
      await testPool.end();
      rawPgTest = { success: true, rows: queryRes.rows };
    } catch (e: any) {
      rawPgTest = { success: false, error: e?.message, stack: e?.stack };
    }
  }

  try {
    const [rawTest, businessCount, productCount, userCount, saleCount, sampleProduct, txTest] = await Promise.all([
      db.$queryRaw<{ now: string; current_database: string }[]>`SELECT NOW() as now, current_database()`.catch((e: Error) => [{ now: 'error: ' + e.message, current_database: 'error' }]),
      db.business.count().catch((e: Error) => ({ error: e.message, stack: e.stack })),
      db.product.count().catch((e: Error) => ({ error: e.message, stack: e.stack })),
      db.user.count().catch((e: Error) => ({ error: e.message, stack: e.stack })),
      db.sale.count().catch((e: Error) => ({ error: e.message, stack: e.stack })),
      db.product.findFirst({ select: { id: true, name: true, businessId: true } }).catch((e: Error) => ({ error: e.message, stack: e.stack })),
      db.$transaction(async (tx) => {
        return tx.user.count();
      }, { maxWait: 15000, timeout: 30000 }).catch((e: Error) => ({ error: e.message, stack: e.stack })),
    ]);

    return Response.json(
      {
        status: "ok",
        version: "diag-v2",
        database: "connected",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        routing: {
          hasHyperdrive,
          hasDirectUrl,
          preferDirect,
          activeMode: hasHyperdrive && !preferDirect ? 'hyperdrive' : 'direct',
        },
        rawPgTest,
        activeDbString: targetConn ? targetConn.replace(/:[^:@]+@/, ':***@') : null,
        dbInfo: rawTest?.[0] ?? null,
        counts: {
          businesses: businessCount,
          products: productCount,
          users: userCount,
          sales: saleCount,
        },
        sampleProduct,
        transactionTest: txTest,
      },
      { status: 200, headers },
    );
  } catch (error: unknown) {
    return Response.json(
      {
        status: "error",
        database: "failed",
        error: "database_unavailable",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}
