import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check — public and intentionally minimal.
 * Uptime monitors only need status + timestamp. Detailed diagnostics (counts,
 * routing mode, connection strings, stack traces) are exposed only when a
 * non-empty HEALTH_DETAILS_TOKEN is configured AND the caller presents it.
 */
export async function GET(request: NextRequest) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const detailToken = process.env.HEALTH_DETAILS_TOKEN;
  const presentedToken =
    request.headers.get("x-health-token") ||
    request.nextUrl.searchParams.get("token");

  if (detailToken && presentedToken === detailToken) {
    return buildDetailedResponse(headers);
  }

  return Response.json(
    {
      status: dbOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers },
  );
}

/**
 * Verbose diagnostics — only reachable with a valid HEALTH_DETAILS_TOKEN.
 * Never expose this anonymously.
 */
async function buildDetailedResponse(headers: Record<string, string>) {
  let cfEnv: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    cfEnv = getCloudflareContext()?.env;
  } catch {}

  const hasHyperdrive = Boolean(cfEnv?.HYPERDRIVE?.connectionString);
  const hasDirectUrl = Boolean(cfEnv?.DATABASE_URL || process.env.DATABASE_URL);
  const preferDirect =
    cfEnv?.PREFER_DIRECT_DB === "true" || process.env.PREFER_DIRECT_DB === "true";

  try {
    const [rawTest, businessCount, productCount, userCount, saleCount, txTest] =
      await Promise.all([
        db.$queryRaw<{ now: string; current_database: string }[]>`SELECT NOW() as now, current_database()`.catch(
          (e: Error) => [{ now: "error: " + e.message, current_database: "error" }],
        ),
        db.business.count().catch(() => -1),
        db.product.count().catch(() => -1),
        db.user.count().catch(() => -1),
        db.sale.count().catch(() => -1),
        db
          .$transaction(async (tx) => tx.user.count(), { maxWait: 15000, timeout: 30000 })
          .catch(() => -1),
      ]);

    return Response.json(
      {
        status: "ok",
        version: "diag-v3",
        database: "connected",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        routing: {
          hasHyperdrive,
          hasDirectUrl,
          preferDirect,
          activeMode: hasHyperdrive && !preferDirect ? "hyperdrive" : "direct",
        },
        dbInfo: rawTest?.[0] ?? null,
        counts: {
          businesses: businessCount,
          products: productCount,
          users: userCount,
          sales: saleCount,
        },
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
