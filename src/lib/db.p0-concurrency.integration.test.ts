/**
 * P0 acceptance tests (real PostgreSQL, disposable DB only).
 *
 * Run with:
 *   INTEGRATION_DB=1 DATABASE_URL=postgresql://... npm test -- src/lib/db.p0-concurrency.integration.test.ts
 *
 * Skipped otherwise, so local `npm test` stays DB-free.
 *
 * These encode the two guarantees the review asked us to PROVE, not assume:
 *   - a retried request never moves money twice (at-most-once claim),
 *   - concurrent returns never exceed sold quantity and never restore stock
 *     twice, even when both requests pass validation simultaneously.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { processSaleReturn } from "@/lib/sale-returns";
import {
  claimIdempotencyTx,
  finalizeIdempotencyTx,
  IdempotencyConflict,
  IdempotencyInProgress,
} from "@/lib/idempotency";

const enabled = process.env.INTEGRATION_DB === "1";
const url = process.env.DATABASE_URL ?? "";
const safeUrl =
  enabled &&
  !url.includes("dummy") &&
  !url.includes("supabase.co") &&
  !url.includes("neon.");

describe.skipIf(!safeUrl)("P0 concurrency guarantees (disposable DB)", () => {
  const pool = new Pool({ connectionString: url, max: 6 });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const slug = `__p0_${Date.now()}`;
  let businessId = "";

  beforeAll(async () => {
    const biz = await db.business.create({
      data: { name: "__P0__", slug, currency: "INR", timezone: "Asia/Kolkata" },
    });
    businessId = biz.id;
  });

  afterAll(async () => {
    await db.business.deleteMany({ where: { slug } });
    await db.$disconnect();
    await pool.end();
  });

  it("concurrent identical returns restore stock exactly once", async () => {
    const prod = await db.product.create({
      data: {
        businessId,
        name: "__p0_return__",
        category: "General",
        buyingPrice: 10,
        sellingPrice: 100,
        unit: "piece",
        currentStock: 7, // the sale of 2 below is already deducted
      },
    });

    const sale = await db.sale.create({
      data: {
        businessId,
        invoiceNumber: `__p0_ret_${Date.now()}`,
        subtotal: 200,
        discount: 0,
        tax: 0,
        totalAmount: 200,
        amountPaid: 200,
        paymentMethod: "CASH",
        paymentStatus: "PAID",
        status: "COMPLETED",
        items: {
          create: [
            {
              productId: prod.id,
              productName: "__p0_return__",
              quantity: 2,
              unitPrice: 100,
              totalPrice: 200,
            },
          ],
        },
      },
      include: { items: true },
    });

    const saleItemId = sale.items[0].id;
    const attempt = () =>
      db.$transaction(
        (tx) =>
          processSaleReturn(tx, {
            saleId: sale.id,
            businessId,
            items: [{ saleItemId, quantity: 2 }],
            refundMethod: "CASH",
          }),
        { maxWait: 20000, timeout: 30000 },
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    // Exactly one full return may win; the loser must fail, not refund again.
    expect(fulfilled).toHaveLength(1);

    const after = await db.product.findUniqueOrThrow({ where: { id: prod.id } });
    expect(Number(after.currentStock)).toBe(9); // 7 + 2, never 11

    const returned = await db.saleReturnItem.findMany({
      where: { saleItem: { saleId: sale.id } },
      select: { quantity: true },
    });
    const totalReturned = returned.reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(totalReturned).toBe(2); // never 4 — cannot exceed sold quantity

    const finalSale = await db.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(finalSale.status).toBe("REFUNDED");
  });

  it("claims an idempotency key at most once under concurrency", async () => {
    const key = `race_${Date.now()}`;
    const scope = "ci:sale:create";

    const attempt = () =>
      db.$transaction(
        async (tx) => {
          const claim = await claimIdempotencyTx<{ ok: number }>(tx, businessId, scope, key);
          if (claim.replay) return "replay" as const;
          if (claim.claim) await finalizeIdempotencyTx(tx, claim.claim, { ok: 1 });
          return "claimed" as const;
        },
        { maxWait: 20000, timeout: 30000 },
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const claimed = results.filter(
      (r) => r.status === "fulfilled" && r.value === "claimed",
    ).length;
    const replayed = results.filter(
      (r) => r.status === "fulfilled" && r.value === "replay",
    ).length;
    const inProgress = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason instanceof IdempotencyInProgress ||
          (r.reason as { code?: string })?.code === "P2002"),
    ).length;

    expect(claimed).toBe(1);
    expect(claimed + replayed + inProgress).toBe(2);

    const rows = await db.syncQueue.count({
      where: { businessId, idempotencyKey: `idem:${businessId}:${scope}:${key}` },
    });
    expect(rows).toBe(1);
  });

  it("rejects a key reused with a different payload, replays the matching one", async () => {
    const key = `reuse_${Date.now()}`;
    const scope = "ci:prepayment:create";

    await db.$transaction(async (tx) => {
      const claim = await claimIdempotencyTx<{ ok: number }>(tx, businessId, scope, key, {
        fingerprint: "fingerprint-A",
      });
      if (!claim.replay && claim.claim) {
        await finalizeIdempotencyTx(tx, claim.claim, { ok: 1 });
      }
    });

    await expect(
      db.$transaction(async (tx) => {
        await claimIdempotencyTx(tx, businessId, scope, key, {
          fingerprint: "fingerprint-B",
        });
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflict);

    const replay = await db.$transaction((tx) =>
      claimIdempotencyTx<{ ok: number }>(tx, businessId, scope, key, {
        fingerprint: "fingerprint-A",
      }),
    );
    expect(replay).toEqual({ replay: true, result: { ok: 1 } });
  });
});
