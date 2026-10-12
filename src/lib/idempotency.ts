/**
 * Database-backed idempotency for money mutations.
 *
 * Application-level "find existing then create" checks are racy: two concurrent
 * requests with the same key both see no existing row and both mutate money.
 * Here we reserve the key up-front using the `SyncQueue.idempotencyKey` unique
 * constraint (the schema already has it, so no migration is required). The
 * reservation happens outside the business transaction so a rollback of the
 * business transaction does not poison the reservation.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export type IdempotencyClaim =
  | { status: "claimed"; idempotencyKey: string }
  | { status: "replay"; result: unknown }
  | { status: "in_progress" };

/** Thrown inside a business transaction when the key is already being processed. */
export class IdempotencyInProgress extends Error {
  constructor() {
    super("INPROGRESS: same request is already being processed");
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

/**
 * Attempt to claim an idempotency key. Returns:
 * - `claimed`     → caller should perform the mutation then call finalize
 * - `replay`      → a completed result already exists, return it
 * - `in_progress` → another identical request is currently running
 */
export async function reserveIdempotency(
  businessId: string,
  scope: string,
  key: string,
): Promise<IdempotencyClaim> {
  const idempotencyKey = `idem:${businessId}:${scope}:${key}`;

  try {
    await db.syncQueue.create({
      data: {
        id: uuidv4(),
        businessId,
        idempotencyKey,
        entityType: scope,
        action: "idempotent",
        payload: { scope, key },
        synced: false,
        retryCount: 0,
      },
    });
    return { status: "claimed", idempotencyKey };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await db.syncQueue.findUnique({
      where: { idempotencyKey },
      select: { synced: true, result: true },
    });

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
      result: (result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}

/** Release a claim after a failed mutation so the client may retry. */
export async function releaseIdempotency(idempotencyKey: string): Promise<void> {
  await db.syncQueue.deleteMany({ where: { idempotencyKey } });
}

// ---------------------------------------------------------------------------
// Transaction-scoped idempotency (MP-32, preferred for all money mutations).
//
// Claim + finalize happen INSIDE the business transaction, so a crash or
// rollback can never leave a stuck "in_progress" claim behind and a swallowed
// finalize can never double-spend. Usage:
//
//   const outcome = await db.$transaction(async (tx) => {
//     let claim: string | null = null;
//     if (key) claim = await claimIdempotencyTx(tx, businessId, scope, key);
//     // ... mutate ...
//     if (claim) await finalizeIdempotencyTx(tx, claim, resultPayload);
//     return { data };
//   });
//   if (isReplay(outcome)) return replayResponse(outcome.result);
// ---------------------------------------------------------------------------

export type ClaimOutcome<T> = { replay: true; result: T } | { replay: false; claim: string | null };

/**
 * Claim a key inside `tx`. Returns `{ replay: true, result }` when the key
 * already completed (caller must return it WITHOUT further mutation), else
 * `{ replay: false, claim }`. Throws IdempotencyInProgress when a concurrent
 * request holds the key — the route must surface 409 + Retry-After (transient).
 */
export async function claimIdempotencyTx<T>(
  tx: TxClient,
  businessId: string,
  scope: string,
  key: string | null | undefined,
): Promise<ClaimOutcome<T>> {
  if (!key) return { replay: false, claim: null };
  const idempotencyKey = namespacedKey(businessId, scope, key);
  try {
    await tx.syncQueue.create({
      data: {
        id: uuidv4(),
        businessId,
        idempotencyKey,
        entityType: scope,
        action: "idempotent",
        payload: { scope, key },
        synced: false,
        retryCount: 0,
      },
    });
    return { replay: false, claim: idempotencyKey };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await tx.syncQueue.findUnique({
      where: { idempotencyKey },
      select: { synced: true, result: true },
    });
    if (existing?.synced) {
      return { replay: true, result: existing.result as T };
    }
    throw new IdempotencyInProgress();
  }
}

/** Finalize a claimed key inside the SAME transaction (never swallowed). */
export async function finalizeIdempotencyTx(
  tx: TxClient,
  idempotencyKey: string,
  result: unknown,
): Promise<void> {
  await tx.syncQueue.updateMany({
    where: { idempotencyKey },
    data: {
      synced: true,
      syncedAt: new Date(),
      result: (result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });
}
