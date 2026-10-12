/**
 * SyncQueue retention (MP-32 follow-up, §11 docx observation).
 *
 * Idempotency rows accumulate forever: every sale/prepayment/withdraw writes
 * one. Retention rule — delete ONLY rows that are:
 *   - synced = true (completed; failed/pending rows are NEVER purged), AND
 *   - syncedAt older than RETENTION_DAYS (default 90).
 *
 * Why 90 days and not 30: a replay arriving after the purge would re-execute
 * instead of returning the cached result. Offline devices normally sync within
 * hours; 90 days keeps the replay window generous while bounding table growth.
 */
import { db } from "@/lib/db";

export const SYNC_RETENTION_DAYS = 90;

export async function purgeOldSyncedQueue(
  olderThanDays = SYNC_RETENTION_DAYS,
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const res = await db.syncQueue.deleteMany({
    where: {
      synced: true,
      syncedAt: { lt: cutoff },
    },
  });
  return { deleted: res.count };
}
