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

export type IdempotencyClaim =
  | { status: "claimed"; idempotencyKey: string }
  | { status: "replay"; result: unknown }
  | { status: "in_progress" };

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
