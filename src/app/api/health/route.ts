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
    await db.$queryRaw`SELECT 1 as connection_test`;

    return Response.json(
      {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
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
        // Do not expose raw DB errors to unauthenticated callers
        error: "database_unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}
