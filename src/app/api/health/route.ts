import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check — public and intentionally minimal.
 * Uptime monitors only need status + timestamp. Detailed diagnostics (counts,
 * routing mode, connection strings, stack traces) are exposed only when a
 * non-empty HEALTH_DETAILS_TOKEN is configured AND the caller presents it
 * via the x-health-token HEADER (MP-39/H4: query-param tokens leak into
 * URL logs, browser history and proxy analytics — never accept ?token=).
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
  // H4: header-only + constant-time compare.
  const presentedToken = request.headers.get("x-health-token") || "";
  if (detailToken && presentedToken && tokensEqual(presentedToken, detailToken)) {
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

function tokensEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  // Hash first so timingSafeEqual works for different-length secrets.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
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
    const [dbNow, businessCount, productCount, userCount, saleCount, txTest] =
      await Promise.all([
        db.$queryRaw<{ now: string }[]>`SELECT NOW() as now`.catch(
          () => [{ now: "unavailable" }],
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
        dbInfo: dbNow?.[0] ?? null,
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
    console.error("[health] detailed diagnostics failed:", error);
    return Response.json(
      {
        status: "error",
        database: "failed",
        error: "database_unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}
