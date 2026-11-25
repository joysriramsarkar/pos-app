/**
 * Client idempotency keys for money mutations (MP-32).
 *
 * Every money mutation — /api/due-collection, /api/prepayment*,
 * /api/supplier-payment, /api/sales (create + cancel/refund),
 * /api/sales/returns, /api/refunds and /api/sync — MUST carry a stable
 * `X-Idempotency-Key`. The key is generated once per user submission (not per
 * retry): double-clicks are already blocked by submit guards, and the key
 * covers timeout-retry / offline-replay so the server can return the cached
 * result instead of moving money twice.
 *
 * The server namespaces the key by business and action, and binds it to a
 * canonical hash of the request body: the same key with a different payload is
 * rejected (409 IDEMPOTENCY_KEY_REUSED) instead of being replayed.
 */
export function newIdempotencyKey(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    // fall through to Math.random fallback
  }
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** JSON headers for money-mutation POSTs (fresh key per submission). */
export function moneyMutationHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Idempotency-Key": newIdempotencyKey(),
  };
}
