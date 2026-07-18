# Offline-First — Summary

What is implemented **today** (not aspirational).

## Delivered

1. **Local persistence** — IndexedDB via `indexeddb.ts` (`ProductsDB`, `CustomersDB`, `SalesDB`, `SyncQueueDB`, …).
2. **Sync queue** — `action_queue` + `sync_queue` stores; `OfflineSyncWorker` in `sync-worker.ts`.
3. **Idempotency** — client UUID keys; server `SyncQueue.idempotencyKey` unique; `/api/sync` returns cached results on retry.
4. **Network monitor** — `network-listener.ts` auto-sync on reconnect.
5. **React surface** — `offline-context.tsx` + exports from `index.ts`.

## Not separate modules

These names appear only in old design notes; **do not look for these files**:

- ~~`action-queue.ts`~~ → logic in `indexeddb.ts` stores + `sync-worker.ts`
- ~~`local-first-checkout.ts`~~ → checkout still primarily hits `/api/sales` when online; offline path uses queue helpers in the worker/call sites

## Operational notes

| Topic | Behavior |
|-------|----------|
| Max retries | ~5 per item (see worker) |
| Conflict batches | FIFO with dependency grouping in worker |
| Session expiry | Worker stops batch if auth fails |
| Money | Use `toMoneyNumber` / `decimal.js` at boundaries |

## Related docs

- Detailed flow: [ARCHITECTURE.md](./ARCHITECTURE.md)
- API: `src/app/api/sync/route.ts`
