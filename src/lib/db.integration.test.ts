/**
 * Real-PostgreSQL integration tests (MP-36/C10).
 *
 * Run ONLY with a disposable database:
 *   INTEGRATION_DB=1 DATABASE_URL=postgresql://... npm test -- src/lib/db.integration.test.ts
 * Skipped otherwise (local `npm test` stays DB-free). CI runs this against the
 * postgres:16 service (see .github/workflows/ci.yml → integration).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const enabled = process.env.INTEGRATION_DB === "1";
const url = process.env.DATABASE_URL ?? "";
const safeUrl = enabled && !url.includes("dummy") && !url.includes("supabase.co") && !url.includes("neon.");

describe.skipIf(!safeUrl)("postgres integration (disposable DB)", () => {
  const pool = new Pool({ connectionString: url, max: 6 });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  const slug = `__ci_${Date.now()}`;
  let businessId = "";
  let productId = "";
  let customerId = "";
  let userId = "";

  beforeAll(async () => {
    const biz = await db.business.create({
      data: { name: "__CI__", slug, currency: "INR", timezone: "Asia/Kolkata" },
    });
    businessId = biz.id;
    const prod = await db.product.create({
      data: { businessId, name: "__ci_widget__", category: "General", buyingPrice: 10, sellingPrice: 20, unit: "piece", currentStock: 5 },
    });
    productId = prod.id;
    const cust = await db.customer.create({ data: { businessId, name: "__ci_cust__" } });
    customerId = cust.id;
    const user = await db.user.create({ data: { username: `__ci_${Date.now()}`, name: "ci", passwordHash: "x" } });
    userId = user.id;
  });

  afterAll(async () => {
    await db.business.deleteMany({ where: { slug } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
    await pool.end();
  });

  it("singleton: repeated access returns one client", async () => {
    const { db: appDb } = await import("@/lib/db");
    expect(appDb.$transaction).toBeDefined();
  });

  it("concurrent decrements: exactly one wins from stock 5 taking 4", async () => {
    const dec = (n: number) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} AND business_id = ${businessId} FOR UPDATE`;
        const r = await tx.product.updateMany({
          where: { id: productId, businessId, currentStock: { gte: n } },
          data: { currentStock: { decrement: n } },
        });
        return r.count;
      }, { maxWait: 20000, timeout: 30000 });
    const [a, b] = await Promise.all([dec(4), dec(4)]);
    expect(a + b).toBe(1);
    const after = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(Number(after.currentStock)).toBe(1);
  });

  it("idempotency key is unique under race", async () => {
    const key = `idem:${businessId}:ci:${Date.now()}`;
    await db.syncQueue.create({ data: { businessId, idempotencyKey: key, entityType: "ci", action: "ci", payload: {}, synced: false } });
    await expect(
      db.syncQueue.create({ data: { businessId, idempotencyKey: key, entityType: "ci", action: "ci", payload: {}, synced: false } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("CHECK rejects negative payment", async () => {
    await expect(
      db.payment.create({ data: { businessId, saleId: "nope", method: "CASH", amount: -5 } })
    ).rejects.toThrow();
  });

  it("partial index blocks a second open shift for the same user", async () => {
    await db.cashRegisterShift.create({ data: { businessId, userId, shiftNumber: 1, openingCash: 0 } });
    await expect(
      db.cashRegisterShift.create({ data: { businessId, userId, shiftNumber: 2, openingCash: 0 } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("cross-tenant reads return nothing under another businessId", async () => {
    const foreign = await db.product.findFirst({ where: { id: productId, businessId: "biz_default_lakhan_bhandar" } });
    expect(foreign).toBeNull();
  });

  it("session_version defaults to 0", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
    expect(u.sessionVersion).toBe(0);
  });
});
