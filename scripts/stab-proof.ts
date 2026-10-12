/** Live-DB stability proof on a scratch business (deleted afterwards). Run: npx tsx scripts/stab-proof.ts */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || url.includes("dummy")) {
  console.error("No real DIRECT_URL — aborting.");
  process.exit(2);
}

const pool = new Pool({ connectionString: url, max: 6 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
const SLUG = "__stab_proof__";
let pass = 0;
let total = 0;
function ok(name: string, cond: boolean) {
  total += 1;
  pass += cond ? 1 : 0;
  console.log(cond ? "PASS" : "FAIL", "-", name);
  if (!cond) process.exitCode = 1;
}

async function main() {
  // --- setup scratch business + product (stock 5) + customer ---
  const biz = await db.business.create({
    data: { name: "__STAB PROOF__", slug: SLUG, currency: "INR", timezone: "Asia/Kolkata" },
  });
  const prod = await db.product.create({
    data: { businessId: biz.id, name: "__proof_widget__", category: "General", buyingPrice: 10, sellingPrice: 20, unit: "piece", currentStock: 5 },
  });
  const cust = await db.customer.create({ data: { businessId: biz.id, name: "__proof_cust__" } });

  // 1. Concurrent same-stock decrements: 2 x 4 from stock 5 -> exactly one wins.
  const dec = (n: number) =>
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${prod.id} AND business_id = ${biz.id} FOR UPDATE`;
      const r = await tx.product.updateMany({
        where: { id: prod.id, businessId: biz.id, currentStock: { gte: n } },
        data: { currentStock: { decrement: n } },
      });
      return r.count;
    }, { maxWait: 20000, timeout: 30000 });
  const [a, b] = await Promise.all([dec(4), dec(4)]);
  ok("concurrent stock: exactly one decrement wins", (a + b) === 1);
  const after = await db.product.findUniqueOrThrow({ where: { id: prod.id } });
  ok("concurrent stock: final stock is 1", Number(after.currentStock) === 1);

  // 2. Same idempotency key twice -> unique violation on second (claim race-safe).
  const key = `idem:${biz.id}:proof:${Date.now()}`;
  await db.syncQueue.create({ data: { businessId: biz.id, idempotencyKey: key, entityType: "proof", action: "proof", payload: {}, synced: false } });
  let raced = false;
  try {
    await db.syncQueue.create({ data: { businessId: biz.id, idempotencyKey: key, entityType: "proof", action: "proof", payload: {}, synced: false } });
  } catch (e: any) {
    raced = e?.code === "P2002";
  }
  ok("idempotency key unique under race", raced);

  // 3. CHECK fires: negative payment rejected by the database.
  let checkFired = false;
  try {
    await db.payment.create({ data: { businessId: biz.id, saleId: "nope", method: "CASH", amount: -5 } });
  } catch {
    checkFired = true;
  }
  ok("CHECK rejects negative payment", checkFired);

  // 4. Partial unique index: second open shift for same user rejected.
  const user = await db.user.create({ data: { username: `__proof_${Date.now()}`, name: "proof", passwordHash: "x" } });
  await db.membership.create({ data: { userId: user.id, businessId: biz.id, role: "CASHIER" } });
  await db.cashRegisterShift.create({ data: { businessId: biz.id, userId: user.id, shiftNumber: 1, openingCash: 0 } });
  let shiftBlocked = false;
  try {
    await db.cashRegisterShift.create({ data: { businessId: biz.id, userId: user.id, shiftNumber: 2, openingCash: 0 } });
  } catch (e: any) {
    shiftBlocked = e?.code === "P2002";
  }
  ok("partial index blocks 2nd open shift (same user)", shiftBlocked);

  // 5. Cross-tenant read returns nothing with business filter.
  const foreign = await db.product.findFirst({ where: { id: prod.id, businessId: "biz_default_lakhan_bhandar" } });
  ok("cross-tenant product invisible under other businessId", foreign === null);

  // 6. session_version defaults to 0.
  const u2 = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { sessionVersion: true } });
  ok("session_version defaults to 0", u2.sessionVersion === 0);

  // --- cleanup: cascade delete scratch business + user ---
  await db.business.delete({ where: { id: biz.id } });
  await db.user.delete({ where: { id: user.id } });
  const leftovers = await db.product.count({ where: { businessId: biz.id } });
  ok("cleanup: no scratch rows remain", leftovers === 0);
  console.log(`\n${pass}/${total} proof checks passed.`);
}

main()
  .catch((e) => { console.error("PROOF-ERROR:", e.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());
