import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    console.log("🔍 [HEALTH CHECK] Starting database connection check...");

    // Try to query the database
    const result = await db.$queryRaw`SELECT 1 as connection_test`;

    console.log("✅ [HEALTH CHECK] Database connection successful!");

    return Response.json(
      {
        status: "ok",
        database: "connected",
        timestamp: new Date(),
        environment: process.env.NODE_ENV,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error(
      "❌ [HEALTH CHECK] Database connection failed:",
      (error instanceof Error ? error.message : "Unknown error"),
    );
    console.error("❌ [HEALTH CHECK] Full error:", error);

    return Response.json(
      {
        status: "error",
        database: "failed",
        error: (error instanceof Error ? error.message : "Unknown error"),
        timestamp: new Date(),
      },
      { status: 500 },
    );
  }
}
