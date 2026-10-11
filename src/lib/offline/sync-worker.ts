// ============================================================================
// Offline Sync Worker - Background Queue Processing Engine
// Lakhan Bhandar POS - Autonomous Sync with Idempotency & Retry
// ============================================================================

import { SyncQueueDB } from "./indexeddb";
import type { SyncQueueItem } from "@/types/pos";

export interface SyncResult {
  success: boolean;
  idempotencyKey: string;
  data?: unknown;
  error?: string;
}

/** Error carrying the HTTP status so the worker can classify retryability. */
class SyncHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * HTTP statuses that indicate a permanent failure — retrying will never succeed
 * without user intervention (validation error, forbidden, not found, conflict).
 * Network errors, 408 and 429 are transient and should be retried.
 */
function isPermanentStatus(status: number): boolean {
  // MP-32: 409 is NOT blanket-permanent. INPROGRESS (concurrent claim) is
  // transient and must be retried; only VERSION_CONFLICT/CONFLICT is permanent.
  // The fetch handler below reclassifies 409 by body code; this stays
  // conservative so unknown 409s retry rather than dead-letter a real sale.
  return status >= 400 && status < 500 && status !== 408 && status !== 429 && status !== 409;
}

function isFinancialEntity(entityType: string): boolean {
  const t = (entityType || '').toLowerCase();
  return t.includes('sale') || t.includes('payment') || t.includes('prepayment') || t.includes('due') || t.includes('stock') || t.includes('ledger') || t.includes('return') || t.includes('refund');
}

/**
 * SYNC WORKER: Processes offline sync items in background
 * - Runs on network reconnection
 * - Processes FIFO (oldest first)
 * - Auto-retries with exponential backoff
 */
export class OfflineSyncWorker {
  private isRunning = false;

  /**
   * START SYNC: Begin processing all pending actions
   * Safe to call multiple times (only runs once at a time)
   */
  async startSync(options?: { retryFailed?: boolean }): Promise<void> {
    // MP-32/H15: cross-tab mutual exclusion via Web Locks (fallback: in-memory).
    const locks = (navigator as unknown as { locks?: { request: (name: string, opts: unknown, fn: (lock: unknown) => Promise<void>) => Promise<void> } }).locks;
    if (locks) {
      let acquired = false;
      await locks.request('pos-sync', { ifAvailable: true }, async (lock) => {
        if (!lock) return;
        acquired = true;
        await this.runQueue(options);
      });
      if (!acquired) console.log('[SyncWorker] another tab holds the sync lock; skipping run');
      return;
    }
    await this.runQueue(options);
  }

  private async runQueue(options?: { retryFailed?: boolean }): Promise<void> {
    console.log('[SyncWorker] runQueue requested. isRunning:', this.isRunning);
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Fire sync start event so UI can show loading state
    this.notifyStart();

    try {
      let successCount = 0;
      let failureCount = 0;

      // Get pending sync items from SyncQueueDB
      if (options?.retryFailed) {
        await SyncQueueDB.resetFailed();
      }
      const pendingItems = await SyncQueueDB.getUnsynced();
      console.log('[SyncWorker] Pending items found:', pendingItems.length);

      if (pendingItems.length === 0) {
        this.notifyUI({ synced: 0, failed: 0, total: 0 });
        return;
      }

      // Helper to check for dependency conflicts between two items
      const hasConflict = (
        a: (typeof pendingItems)[0],
        b: (typeof pendingItems)[0],
      ) => {
        try {
          const aPayload = JSON.parse(a.payload);
          const bPayload = JSON.parse(b.payload);

          const getIds = (payload: Record<string, unknown>) => {
            const ids = new Set<string>();
            if (typeof payload.id === 'string') ids.add(payload.id);
            if (typeof payload.customerId === 'string') ids.add(payload.customerId);
            if (typeof payload.productId === 'string') ids.add(payload.productId);
            if (Array.isArray(payload.items)) {
              payload.items.forEach((i: { productId?: string }) => {
                if (i.productId) ids.add(i.productId);
              });
            }
            return ids;
          };

          const aIds = getIds(aPayload);
          const bIds = getIds(bPayload);

          // If they share any IDs, they might conflict, must be sequential
          for (const id of aIds) {
            if (bIds.has(id)) return true;
          }
        } catch (e) {
          return true; // if unparseable, assume conflict to be safe
        }
        return false;
      };

      // Group into conflict-free batches (max 5 per batch)
      const batches: (typeof pendingItems)[] = [];
      let currentBatch: typeof pendingItems = [];

            const latestVersions = new Map<string, number>();

      // Pre-process for Last-Write-Wins (LWW)
      for (const item of pendingItems) {
        try {
          if (isFinancialEntity(item.entityType)) continue;
          const payload = JSON.parse(item.payload);
          if (payload.id && payload.updatedAt) {
             const time = new Date(payload.updatedAt).getTime();
             if (!Number.isFinite(time)) continue;
             const key = `${item.entityType}_${payload.id}`;
             if (!latestVersions.has(key) || time > latestVersions.get(key)!) {
                 latestVersions.set(key, time);
             }
          }
        } catch(e) {}
      }

      for (const item of pendingItems) {
        if (item.retryCount >= 5) {
          await SyncQueueDB.markFailed(item.id, "Max retries exceeded");
          failureCount++;
          continue;
        }

        let isStale = false;
        try {
          if (!isFinancialEntity(item.entityType)) {
            const payload = JSON.parse(item.payload);
            if (payload.id && payload.updatedAt) {
               const time = new Date(payload.updatedAt).getTime();
               const key = `${item.entityType}_${payload.id}`;
               if (latestVersions.has(key) && Number.isFinite(time) && time < latestVersions.get(key)!) {
                  isStale = true;
               }
            }
          }
        } catch(e) {}

        if (isStale) {
           // Skip older versions of the same entity update (Last-Write-Wins)
           await SyncQueueDB.markSynced(item.id);
           successCount++;
           continue;
        }

        const conflict = currentBatch.some((batchItem) =>
          hasConflict(item, batchItem),
        );

        if (conflict || currentBatch.length >= 5) {
          if (currentBatch.length > 0) batches.push(currentBatch);
          currentBatch = [item];
        } else {
          currentBatch.push(item);
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);

      let sessionExpired = false;
      // MP-30: entity IDs whose item already failed in THIS run. Later items
      // touching them are HELD (left pending for the next run) — never
      // attempted against a missing dependency and dead-lettered.
      const blockedIds = new Set<string>();
      const idsOf = (item: (typeof pendingItems)[0]): Set<string> => {
        try {
          const payload = JSON.parse(item.payload) as Record<string, unknown>;
          const ids = new Set<string>();
          if (typeof payload.id === "string") ids.add(payload.id);
          if (typeof payload.customerId === "string") ids.add(payload.customerId);
          if (typeof payload.productId === "string") ids.add(payload.productId);
          if (Array.isArray(payload.items)) {
            for (const i of payload.items as { productId?: string }[]) {
              if (i?.productId) ids.add(i.productId);
            }
          }
          return ids;
        } catch {
          return new Set();
        }
      };

      for (const batch of batches) {
        if (sessionExpired) break;

        // Hold dependents of already-failed items (no retry-count cost).
        const held: typeof batch = [];
        const runnable = batch.filter((item) => {
          const ids = idsOf(item);
          for (const id of ids) {
            if (blockedIds.has(id)) {
              held.push(item);
              return false;
            }
          }
          return true;
        });
        if (held.length > 0) {
          console.log(`[SyncWorker] holding ${held.length} dependent item(s) for next run`);
        }

        const results = await Promise.allSettled(
          runnable.map(async (item) => {
            const actionType = this.mapQueueItemToActionType(item);
            if (!actionType) {
              throw new Error(
                `Unsupported sync item: ${item.entityType}.${item.action}`,
              );
            }

            const parsedPayload = JSON.parse(item.payload);

            const response = await fetch("/api/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Idempotency-Key": item.id,
              },
              body: JSON.stringify({
                idempotencyKey: item.id,
                actionType,
                payload: parsedPayload,
              }),
            });

            if (response.status === 401) {
              sessionExpired = true;
              throw new Error("Unauthorized");
            }

            if (!response.ok) {
              const text = await response.text();
              let code = "";
              try {
                const parsed = JSON.parse(text);
                code = parsed?.code ?? "";
              } catch {}
              // MP-32: INPROGRESS (same key being processed) is transient.
              if (response.status === 409 && code === "INPROGRESS") {
                const t = new SyncHttpError(429, "INPROGRESS: same request is being processed; retry");
                throw t;
              }
              // MP-32: real invoice/version CONFLICT is permanent — dead-letter it.
              if (response.status === 409) {
                throw new SyncHttpError(
                  409,
                  `HTTP 409: ${text.slice(0, 300)}`,
                );
              }
              throw new SyncHttpError(
                response.status,
                `HTTP ${response.status}: ${response.statusText} ${text.slice(0, 300)}`,
              );
            }

            // MP-28: success requires JSON + body.success. A 307-redirect to
            // /login returns 200 text/html — that must NEVER mark items synced.
            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
              throw new SyncHttpError(
                response.status,
                `Unexpected content-type ${contentType}; refusing to mark synced`,
              );
            }
            const result = await response.json();
            if (!result.success) {
              throw new Error(result.error || "Sync API returned failure");
            }

            await SyncQueueDB.markSynced(item.id);
            return item.id;
          }),
        );

        for (let i = 0; i < runnable.length; i++) {
          const item = runnable[i];
          const result = results[i];

          if (result.status === "fulfilled") {
            successCount++;
          } else {
            if (sessionExpired && result.reason.message === "Unauthorized") {
              window.dispatchEvent(new CustomEvent("syncSessionExpired"));
              continue; // don't increment failure for auth timeout
            }

            const errorMsg =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);
            const status =
              result.reason instanceof SyncHttpError ? result.reason.status : 0;

            // MP-30: this item failed — hold its dependents in later batches.
            for (const id of idsOf(item)) blockedIds.add(id);

            const isConflict409 = status === 409;
            if (isPermanentStatus(status) || isConflict409) {
              // Dead-letter: validation / permission / conflict — do not retry.
              await SyncQueueDB.markFailed(item.id, errorMsg, true);
            } else {
              const newRetryCount = item.retryCount + 1;
              if (newRetryCount >= 5) {
                await SyncQueueDB.markFailed(item.id, errorMsg, false);
              } else {
                await SyncQueueDB.incrementRetry(item.id, errorMsg);
              }
            }
            failureCount++;
          }
        }

        if (sessionExpired) {
          this.notifyUI({
            synced: successCount,
            failed: failureCount,
            total: pendingItems.length,
          });
          return;
        }
      }

      this.notifyUI({
        synced: successCount,
        failed: failureCount,
        total: pendingItems.length,
      });
    } finally {
      this.isRunning = false;
    }
  }

  private mapQueueItemToActionType(item: SyncQueueItem): string | null {
    if (item.entityType === "Sale" && item.action === "create")
      return "sale:create";
    if (item.entityType === "Customer" && item.action === "create")
      return "customer:create";
    if (item.entityType === "Customer" && item.action === "update")
      return "customer:update";
    if (item.entityType === "Product" && item.action === "create")
      return "product:create";
    if (item.entityType === "Product" && item.action === "update") {
      const payload = JSON.parse(item.payload);
      if (payload.quantityChange !== undefined) return "product:stock:update";
      return "product:update";
    }
    if (item.entityType === "Prepayment" && item.action === "create")
      return "prepayment:create";

    return null;
  }

  /**
   * GET QUEUE STATS: Dashboard health view
   */
  async getStats() {
    const allItems = await SyncQueueDB.getAll();
    const stats = {
      pending: allItems.filter((item) => !item.synced && !item.failed).length,
      processed: allItems.filter((item) => item.synced).length,
      failed: allItems.filter((item) => item.failed).length,
      total: allItems.length,
    };
    return stats;
  }

  /**
   * NOTIFY START: Emit sync start event
   */
  private notifyStart(): void {
    const event = new CustomEvent("offlineSyncStart", { detail: {} });
    window.dispatchEvent(event);
  }

  /**
   * NOTIFY UI: Emit sync state change (for UI updates)
   */
  private notifyUI(stats: {
    synced: number;
    failed: number;
    total: number;
  }): void {
    // Fire custom event that components can listen to
    const event = new CustomEvent("offlineSyncComplete", { detail: stats });
    window.dispatchEvent(event);

    // Also update localStorage with status
    localStorage.setItem(
      "offline-sync-status",
      JSON.stringify({
        lastSyncAt: Date.now(),
        stats,
      }),
    );
  }
}

// Singleton instance
let workerInstance: OfflineSyncWorker | null = null;

export async function getSyncWorker(): Promise<OfflineSyncWorker> {
  if (!workerInstance) {
    workerInstance = new OfflineSyncWorker();
  }
  return workerInstance;
}
