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

  try {
    const [rawTest, businessCount, productCount, userCount, saleCount, sampleProduct, txTest] = await Promise.all([
      db.$queryRaw<{ now: string; current_database: string }[]>`SELECT NOW() as now, current_database()`,
      db.business.count().catch((e: Error) => `error: ${e.message}`),
      db.product.count().catch((e: Error) => `error: ${e.message}`),
      db.user.count().catch((e: Error) => `error: ${e.message}`),
      db.sale.count().catch((e: Error) => `error: ${e.message}`),
      db.product.findFirst({ select: { id: true, name: true, businessId: true } }).catch((e: Error) => `error: ${e.message}`),
      db.$transaction(async (tx) => {
        return tx.user.count();
      }, { maxWait: 15000, timeout: 30000 }).catch((e: Error) => `error: ${e.message}`),
    ]);

    return Response.json(
      {
        status: "ok",
        version: "diag-v1",
        database: "connected",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
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
    console.error(
      "[HEALTH CHECK] Database connection failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

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
