import { NextRequest, NextResponse } from "next/server";
import { purgeOldSyncedQueue } from "@/lib/sync-retention";

/**
 * GET /api/cron/purge-sync — delete completed idempotency rows older than
 * 90 days. Fail-closed like update-popularity (MP-37): no CRON_SECRET means
 * 500, never an open expensive job. Never touches pending/failed rows.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { deleted } = await purgeOldSyncedQueue();
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error("[cron] purge-sync failed:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
