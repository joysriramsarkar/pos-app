/**
 * Database-backed idempotency for money mutations.
 *
 * Application-level "find existing then create" checks are racy: two concurrent
 * requests with the same key both see no existing row and both mutate money.
 * Here we reserve the key up-front using the `SyncQueue.idempotencyKey` unique
 * constraint (the schema already has it, so no migration is required).
 *
 * Two hard rules learned the hard way (P0-A):
 *
 * 1. Inside a Postgres transaction a violated unique constraint ABORTS the
 *    transaction. Catching the P2002 and then running another query on the same
 *    `tx` fails with 25P02 ("current transaction is aborted"), so the caller
 *    never sees a clean replay/in-progress outcome. Claims therefore use
 *    `INSERT ... ON CONFLICT DO NOTHING` (Prisma `createMany({ skipDuplicates })`),
 *    which never raises, and only then read the existing row.
 *
 * 2. A key is not an authorization token. Every claim carries a canonical
 *    fingerprint of the request (tenant + action + payload). A replay is only
 *    returned when the fingerprint matches; a key reused for a different
 *    payload is rejected with 409 IDEMPOTENCY_KEY_REUSED.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { requestFingerprint, toJsonValue } from "@/lib/request-fingerprint";

export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type IdempotencyClaim =
  | { status: "claimed"; idempotencyKey: string }
  | { status: "replay"; result: unknown }
  | { status: "in_progress" };

/** Thrown inside a business transaction when the key is already being processed. */
export class IdempotencyInProgress extends Error {
  status = 409;
  code = "INPROGRESS";

  constructor() {
    super("INPROGRESS: same request is already being processed");
  }
}

/**
 * Thrown when a key is reused for a different tenant/action/payload.
 * This is a permanent client error — retrying with the same key can never
 * succeed, so the client must generate a fresh key.
 */
export class IdempotencyConflict extends Error {
  status = 409;
  code = "IDEMPOTENCY_KEY_REUSED";

  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED: this idempotency key was already used for a different request",
    );
  }
}

/** Returned from a transaction body when the key already completed. */
export interface IdempotencyReplay<T> {
  replay: true;
  result: T;
}

export function namespacedKey(businessId: string, scope: string, key: string): string {
  return `idem:${businessId}:${scope}:${key}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** Raised when a replay is requested with a payload/tenant mismatch. */
function assertFingerprintMatches(storedPayload: unknown, fingerprint?: string): void {
  if (!fingerprint) return;
  const stored = (storedPayload as { fingerprint?: unknown } | null)?.fingerprint;
  if (typeof stored === "string" && stored !== fingerprint) {
    throw new IdempotencyConflict();
  }
}

/**
 * Store enough context to prove later that a replay belongs to the same
 * request. `requestPayload` is kept for forensics/dead-letter inspection.
 */
function claimPayload(scope: string, key: string, options: ClaimOptions): Prisma.InputJsonValue {
  return {
    scope,
    key,
    fingerprint: options.fingerprint ?? null,
    request: options.requestPayload === undefined ? null : toJsonValue(options.requestPayload),
  } as Prisma.InputJsonValue;
}

/**
 * Attempt to claim an idempotency key (outside a business transaction).
 * Returns:
 * - `claimed`     → caller should perform the mutation then call finalize
 * - `replay`      → a completed result already exists, return it
 * - `in_progress` → another identical request is currently running
 */
export async function reserveIdempotency(
  businessId: string,
  scope: string,
  key: string,
  options: ClaimOptions = {},
): Promise<IdempotencyClaim> {
  const idempotencyKey = namespacedKey(businessId, scope, key);

  try {
    await db.syncQueue.create({
      data: {
        id: uuidv4(),
        businessId,
        idempotencyKey,
        entityType: scope,
        action: "idempotent",
        payload: claimPayload(scope, key, options),
        synced: false,
        retryCount: 0,
      },
    });
    return { status: "claimed", idempotencyKey };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await db.syncQueue.findUnique({
      where: { idempotencyKey },
      select: { synced: true, result: true, payload: true },
    });

    assertFingerprintMatches(existing?.payload, options.fingerprint);

    if (existing?.synced) {
      return { status: "replay", result: existing.result };
    }
    return { status: "in_progress" };
  }
}

/** Mark a claim complete and cache its result for replays. */
export async function finalizeIdempotency(
  idempotencyKey: string,
  result: unknown,
): Promise<void> {
  await db.syncQueue.updateMany({
    where: { idempotencyKey },
    data: {
      synced: true,
      syncedAt: new Date(),
      result: (result == null ? Prisma.JsonNull : toJsonValue(result)) as Prisma.InputJsonValue,
    },
  });
}

/** Release a claim after a failed mutation so the client may retry. */
export async function releaseIdempotency(idempotencyKey: string): Promise<void> {
  await db.syncQueue.deleteMany({ where: { idempotencyKey } });
}

// ---------------------------------------------------------------------------
// Transaction-scoped idempotency (MP-32, required for all money mutations).
//
// Claim + finalize happen INSIDE the business transaction, so a crash or
// rollback can never leave a stuck "in_progress" claim behind and a swallowed
// finalize can never double-spend. Usage:
//
//   const outcome = await db.$transaction(async (tx) => {
//     const claim = await claimIdempotencyTx(tx, businessId, scope, key, { fingerprint });
//     if (claim.replay) return { replay: claim.result };
//     // ... mutate ...
//     if (claim.claim) await finalizeIdempotencyTx(tx, claim.claim, payload);
//     return { data };
//   });
// ---------------------------------------------------------------------------

export type ClaimOutcome<T> = { replay: true; result: T } | { replay: false; claim: string | null };

export interface ClaimOptions {
  /** Canonical hash of the request body (`requestFingerprint`). */
  fingerprint?: string;
  /** Original request payload, stored for replay forensics. */
  requestPayload?: unknown;
  /** Entity this mutation touches, surfaced on sync rows. */
  entityType?: string;
  entityId?: string;
}

/**
 * Claim a key inside `tx`. Returns `{ replay: true, result }` when the key
 * already completed with the SAME fingerprint (caller must return it WITHOUT
 * further mutation), else `{ replay: false, claim }`.
 *
 * Throws IdempotencyInProgress when a concurrent request holds the key — the
 * route must surface 409 + Retry-After (transient).
 * Throws IdempotencyConflict when the key belongs to a different request —
 * permanent, the client must use a new key.
 */
export async function claimIdempotencyTx<T>(
  tx: TxClient,
  businessId: string,
  scope: string,
  key: string | null | undefined,
  options: ClaimOptions = {},
): Promise<ClaimOutcome<T>> {
  if (!key) return { replay: false, claim: null };
  const idempotencyKey = namespacedKey(businessId, scope, key);

  // INSERT ... ON CONFLICT DO NOTHING — never aborts the surrounding
  // transaction, so the follow-up SELECT is legal on this tx.
  const inserted = await tx.syncQueue.createMany({
    data: [
      {
        id: uuidv4(),
        businessId,
        idempotencyKey,
        entityType: options.entityType ?? scope,
        entityId: options.entityId ?? null,
        action: "idempotent",
        payload: claimPayload(scope, key, options),
        synced: false,
        retryCount: 0,
      },
    ],
    skipDuplicates: true,
  });

  if (inserted.count > 0) return { replay: false, claim: idempotencyKey };

  const existing = await tx.syncQueue.findUnique({
    where: { idempotencyKey },
    select: { synced: true, result: true, payload: true, businessId: true },
  });

  // A key can never cross tenants: the namespaced key already encodes the
  // business, this is belt-and-braces against a data fix that rewrites keys.
  if (existing && existing.businessId !== businessId) {
    throw new IdempotencyConflict();
  }
  if (!existing) {
    // The competing claim was deleted mid-flight; treat as transient.
    throw new IdempotencyInProgress();
  }

  assertFingerprintMatches(existing.payload, options.fingerprint);

  if (existing.synced) {
    return { replay: true, result: existing.result as T };
  }
  throw new IdempotencyInProgress();
}

/** Finalize a claimed key inside the SAME transaction (never swallowed). */
export async function finalizeIdempotencyTx(
  tx: TxClient,
  idempotencyKey: string,
  result: unknown,
  meta: { entityId?: string; payload?: unknown } = {},
): Promise<void> {
  await tx.syncQueue.updateMany({
    where: { idempotencyKey },
    data: {
      synced: true,
      syncedAt: new Date(),
      result: (result == null ? Prisma.JsonNull : toJsonValue(result)) as Prisma.InputJsonValue,
      ...(meta.entityId ? { entityId: meta.entityId } : {}),
      ...(meta.payload === undefined
        ? {}
        : { payload: toJsonValue(meta.payload) as Prisma.InputJsonValue }),
    },
  });
}

/** Convenience: fingerprint a scope + payload pair for claim/replay checks. */
export function fingerprintFor(scope: string, payload: unknown): string {
  return requestFingerprint({ scope, payload });
}
