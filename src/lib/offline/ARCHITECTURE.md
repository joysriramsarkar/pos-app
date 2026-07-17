# Offline-First Architecture

Lakhan Bhandar POS — current offline stack (as implemented in this repo).

## Module map

| File | Role |
|------|------|
| `indexeddb.ts` | IndexedDB open/upgrade, stores, CRUD helpers (`ProductsDB`, `CustomersDB`, `CartDB`, `SalesDB`, `SyncQueueDB`) |
| `sync-worker.ts` | `OfflineSyncWorker` — drains pending queue → `POST /api/sync` with `X-Idempotency-Key` |
| `network-listener.ts` | Online/offline monitor; auto-triggers sync on reconnect |
| `offline-context.tsx` | React context for UI online/pending state |
| `index.ts` | Public exports |

> **Note:** Older docs mentioned `action-queue.ts` and `local-first-checkout.ts`. Those files were never shipped as separate modules. Queue storage lives as the `action_queue` / `sync_queue` IndexedDB stores in `indexeddb.ts`, and enqueue/process logic lives in `sync-worker.ts` + call sites.

## Data stores (IndexedDB)

Database: `lakhan-bhandar-pos` (see `DB_VERSION` in `indexeddb.ts`).

| Store | Purpose |
|-------|---------|
| `products` | Local product cache |
| `customers` | Local customer cache |
| `suppliers` | Local supplier cache |
| `carts` | Cart persistence |
| `sales` | Local sale records |
| `sync_queue` | Pending/completed sync ops (`SyncQueueDB`) |
| `pending_sales` | Sales awaiting confirmation |
| `action_queue` | Idempotent action queue (status, retries, `idempotencyKey`) |

## Sync flow

```
UI / checkout
    │
    ├─ write local IndexedDB (optimistic UI)
    └─ enqueue item (idempotencyKey = UUID v4)
            │
            ▼
    OfflineSyncWorker.startSync()
            │  (on reconnect / manual)
            ▼
    POST /api/sync
      Header: X-Idempotency-Key
            │
            ▼
    Server SyncQueue (Prisma)
      - unique idempotencyKey
      - process once, cache result
      - retry returns cached result
```

## Network listener

- Listens to `window` `online` / `offline`
- Debounced reconnect → `getSyncWorker().startSync()`
- Optional polling fallback for browsers that miss events

## Money & precision

Server APIs use `decimal.js` (`src/lib/money.ts`). IndexedDB payloads often serialize numbers via `toMoneyNumber()` / `Number()` for JSON/IDB compatibility. Prefer money helpers when reading/writing currency so float drift stays bounded to 2 dp.

## Server endpoint

- `POST /api/sync` — auth required, idempotent processing of `sale:create`, `customer:*`, `product:*`, `prepayment:create`, etc.
- See `src/app/api/sync/route.ts`.

## Integration checklist for features

1. Write local state first (Zustand + IndexedDB).
2. Enqueue sync payload with a fresh UUID idempotency key.
3. Let `OfflineSyncWorker` push when online.
4. Never assume network success for the UI path.
