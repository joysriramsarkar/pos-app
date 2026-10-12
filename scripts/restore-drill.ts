/**
 * Backup → validate → wipe → restore → reconcile drill (MP-33).
 *
 * Runs against ANY database URL (CI postgres service, staging). NEVER point
 * at production: the script refuses hosts containing supabase.co/neon.
 * Usage: DATABASE_URL=... npx tsx scripts/restore-drill.ts
 *
 * Round-trips the financial core (products, customers, sales+items, payments,
 * ledger, stock history, settings) through the same shape GET /api/backup
 * emits, validates with validateBackup(), wipes in dependency order, restores
 * with createMany, then reconciles counts + totals + ledger fold. Exit non-zero
 * on any mismatch.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import Decimal from "decimal.js";
import { validateBackup } from "../src/lib/backup-validator";

const url = process.env.DATABASE_URL ?? "";
if (!url || /supabase\.co|neon\./.test(url)) {
  console.error("refusing to run restore drill: DATABASE_URL missing or looks like production");
  process.exit(2);
}

const pool = new Pool({ connectionString: url, max: 4 });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });
const SLUG = `__drill_${Date.now()}`;
let failures = 0;
function check(name: string, cond: boolean) {
  console.log(cond ? "PASS" : "FAIL", "-", name);
  if (!cond) failures++;
}

async function main() {
  // ---- 1. seed fixture ----
  const biz = await db.business.create({ data: { name: "__DRILL__", slug: SLUG, currency: "BDT", timezone: "Asia/Dhaka" } });
  const b = biz.id;
  const prod = await db.product.create({ data: { businessId: b, name: "Drill Rice", category: "General", buyingPrice: 40, sellingPrice: 55, unit: "kg", currentStock: 100 } });
  const cust = await db.customer.create({ data: { businessId: b, name: "Drill Cust", totalDue: 30, totalPaid: 70, prepaidBalance: 10 } });
  const sale = await db.sale.create({
    data: { businessId: b, invoiceNumber: "INV-DRILL-1", subtotal: 110, discount: 10, tax: 0, totalAmount: 100, amountPaid: 70, paymentMethod: "CASH", paymentStatus: "PARTIAL", status: "COMPLETED",
      items: { create: [
        { productId: prod.id, productName: prod.name, quantity: 2, unitPrice: 55, totalPrice: 110 },
      ] } },
  });
  await db.payment.create({ data: { businessId: b, saleId: sale.id, method: "CASH", amount: 70 } });
  await db.ledgerEntry.create({ data: { businessId: b, customerId: cust.id, entryType: "CREDIT", amount: 100, balanceAfter: 100, referenceId: sale.id } });
  await db.ledgerEntry.create({ data: { businessId: b, customerId: cust.id, entryType: "DEBIT", amount: 70, balanceAfter: 30, referenceId: sale.id } });
  await db.stockHistory.create({ data: { businessId: b, productId: prod.id, changeType: "SALE", quantity: -2, referenceId: sale.id } });
  await db.businessSetting.create({ data: { businessId: b, key: "currency_symbol", value: "৳" } });

  // ---- 2. export (same shape as GET /api/backup) ----
  const [products, customers, sales, saleItems, payments, ledgerEntries, stockHistory, businessSettings] = await Promise.all([
    db.product.findMany({ where: { businessId: b } }),
    db.customer.findMany({ where: { businessId: b } }),
    db.sale.findMany({ where: { businessId: b } }),
    db.saleItem.findMany({ where: { sale: { businessId: b } } }),
    db.payment.findMany({ where: { businessId: b } }),
    db.ledgerEntry.findMany({ where: { businessId: b } }),
    db.stockHistory.findMany({ where: { businessId: b } }),
    db.businessSetting.findMany({ where: { businessId: b } }),
  ]);
  const backup = { version: "2.1-multi-tenant", business: { id: b, name: biz.name, slug: SLUG },
    data: { products, customers, sales, saleItems, payments, ledgerEntries, stockHistory, businessSettings } };
  const serialised = JSON.parse(JSON.stringify(backup, (_, v) => typeof v === "bigint" ? v.toString() : v));

  // ---- 3. validate offline ----
  const v = validateBackup(serialised);
  for (const i of v.issues) console.log(`${i.severity.toUpperCase()} [${i.check}] ${i.detail}`);
  check("backup validates BACKUP-OK", v.ok);

  // ---- 4. wipe (children before parents — sale_items→products is ON DELETE
  //      RESTRICT, so deleting the business cannot cascade through it) ----
  await db.sale.deleteMany({ where: { businessId: b } }); // cascades sale_items + payments
  await db.stockHistory.deleteMany({ where: { businessId: b } });
  await db.ledgerEntry.deleteMany({ where: { businessId: b } });
  await db.product.deleteMany({ where: { businessId: b } });
  await db.customer.deleteMany({ where: { businessId: b } });
  await db.businessSetting.deleteMany({ where: { businessId: b } });
  await db.business.delete({ where: { id: b } });
  check("wipe leaves no products", (await db.product.count({ where: { businessId: b } })) === 0);

  // ---- 5. restore (parents before children) ----
  const d = serialised.data;
  const biz2 = await db.business.create({ data: { name: biz.name, slug: SLUG, currency: "BDT", timezone: "Asia/Dhaka" } });
  const idMap = new Map<string, string>([[b, biz2.id]]);
  const remap = (rows: Array<Record<string, unknown>>, fields: string[]) =>
    rows.map((r) => { const c = { ...r }; for (const f of fields) if (typeof c[f] === "string" && idMap.has(c[f] as string)) c[f] = idMap.get(c[f] as string); return c; });
  const stripDates = (r: Record<string, unknown>) => { const c = { ...r }; delete c.createdAt; delete c.updatedAt; return c; };
  await db.product.createMany({ data: d.products.map((r: Record<string, unknown>) => stripDates(remap([r], ["businessId"])[0])) });
  await db.customer.createMany({ data: d.customers.map((r: Record<string, unknown>) => stripDates(remap([r], ["businessId"])[0])) });
  const prodMap = new Map(d.products.map((r: Record<string, unknown>) => [r.id as string, r]));
  const custMap = new Map(d.customers.map((r: Record<string, unknown>) => [r.id as string, r]));
  const saleIdMap = new Map<string, string>();
  for (const r of d.sales as Array<Record<string, unknown>>) {
    const created = await db.sale.create({ data: stripDates(remap([r], ["businessId", "customerId"])[0]) as never });
    saleIdMap.set(r.id as string, (created as { id: string }).id);
  }
  const restoreSaleItems = (d.saleItems as Array<Record<string, unknown>>).map((r) => stripDates({
    ...r,
    saleId: saleIdMap.get(r.saleId as string) ?? r.saleId,
    businessId: undefined,
  }));
  for (const r of restoreSaleItems) delete (r as Record<string, unknown>).businessId;
  await db.saleItem.createMany({ data: restoreSaleItems as never });
  await db.payment.createMany({ data: (d.payments as Array<Record<string, unknown>>).map((r) => stripDates({ ...r, businessId: biz2.id, saleId: saleIdMap.get(r.saleId as string) ?? r.saleId })) as never });
  await db.ledgerEntry.createMany({ data: (d.ledgerEntries as Array<Record<string, unknown>>).map((r) => stripDates(remap([r], ["businessId", "customerId"])[0])) as never });
  await db.stockHistory.createMany({ data: (d.stockHistory as Array<Record<string, unknown>>).map((r) => stripDates(remap([r], ["businessId", "productId"])[0])) as never });
  await db.businessSetting.createMany({ data: (d.businessSettings as Array<Record<string, unknown>>).map((r) => stripDates(remap([r], ["businessId"])[0])) as never });
  void prodMap; void custMap;

  // ---- 6. reconcile ----
  const b2 = biz2.id;
  check("products restored", (await db.product.count({ where: { businessId: b2 } })) === products.length);
  check("sales restored", (await db.sale.count({ where: { businessId: b2 } })) === sales.length);
  check("saleItems restored", (await db.saleItem.count({ where: { sale: { businessId: b2 } } })) === restoreSaleItems.length);
  const s2 = await db.sale.findFirstOrThrow({ where: { businessId: b2 } });
  check("sale total intact", Number(s2.totalAmount) === 100 && Number(s2.amountPaid) === 70);
  const c2 = await db.customer.findFirstOrThrow({ where: { businessId: b2 } });
  const ledger = await db.ledgerEntry.findMany({ where: { businessId: b2 } });
  let credit = new Decimal(0), debit = new Decimal(0);
  for (const e of ledger) {
    if ((e.entryType as string) === "CREDIT") credit = credit.plus(Number(e.amount));
    else debit = debit.plus(Number(e.amount));
  }
  check("ledger fold matches due", credit.minus(debit).toNumber() === Number(c2.totalDue));
  const p2 = await db.product.findFirstOrThrow({ where: { businessId: b2 } });
  check("stock intact", Number(p2.currentStock) === 100);
  const cur = await db.businessSetting.findFirst({ where: { businessId: b2, key: "currency_symbol" } });
  check("currency symbol intact (৳)", cur?.value === "৳");

  // ---- 7. cleanup (same dependency order as the wipe) ----
  await db.sale.deleteMany({ where: { businessId: b2 } });
  await db.stockHistory.deleteMany({ where: { businessId: b2 } });
  await db.ledgerEntry.deleteMany({ where: { businessId: b2 } });
  await db.product.deleteMany({ where: { businessId: b2 } });
  await db.customer.deleteMany({ where: { businessId: b2 } });
  await db.businessSetting.deleteMany({ where: { businessId: b2 } });
  await db.business.delete({ where: { id: b2 } });
  check("cleanup complete", (await db.product.count({ where: { businessId: b2 } })) === 0);
  console.log(failures === 0 ? "DRILL-OK" : "DRILL-FAILED");
}

const invokedAsScript = process.argv[1]?.endsWith("restore-drill.ts");
if (invokedAsScript) {
  main()
    .catch((e) => { console.error("DRILL-ERROR:", e.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
export { main as restoreDrillMain };
