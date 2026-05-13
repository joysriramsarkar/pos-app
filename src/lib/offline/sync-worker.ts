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
  async startSync(): Promise<void> {
    console.log('[SyncWorker] startSync requested. isRunning:', this.isRunning);
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

      for (const item of pendingItems) {
        if (item.retryCount >= 5) {
          await SyncQueueDB.markFailed(item.id, "Max retries exceeded");
          failureCount++;
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

      for (const batch of batches) {
        if (sessionExpired) break;

        const results = await Promise.allSettled(
          batch.map(async (item) => {
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
              throw new Error(
                `HTTP ${response.status}: ${response.statusText} ${text}`,
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

        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
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
            const newRetryCount = item.retryCount + 1;
            if (newRetryCount >= 5) {
              await SyncQueueDB.markFailed(item.id, errorMsg);
            } else {
              await SyncQueueDB.incrementRetry(item.id, errorMsg);
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
