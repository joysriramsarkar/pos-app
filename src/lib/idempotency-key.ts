/**
 * Client idempotency keys for money mutations (MP-32).
 *
 * Every POST to /api/due-collection, /api/prepayment*, /api/supplier-payment
 * and /api/sync MUST carry a stable `X-Idempotency-Key`. The key is generated
 * once per user submission (not per retry): double-clicks are already blocked
 * by submit guards, and the key covers timeout-retry / offline-replay so the
 * server can return the cached result instead of moving money twice.
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
