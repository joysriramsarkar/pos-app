/** Read-only pre-migration validation. Never writes. Run: npx tsx scripts/validate-migration-readiness.ts */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || url.includes("dummy")) {
  console.error("No real DIRECT_URL/DATABASE_URL — aborting (refusing dummy).");
  process.exit(2);
}
const pool = new Pool({ connectionString: url, max: 2 });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

async function count(sql: string, label: string) {
  const rows = await db.$queryRawUnsafe<Array<{ n: string }>>(sql);
  const n = Number(rows[0]?.n ?? 0);
  console.log(`${n}\t${label}`);
  return n;
}

async function main() {
  console.log("--- orphan / mismatch checks (expect 0) ---");
  await count(
    `SELECT COUNT(*)::text AS n FROM sale_return_items sri LEFT JOIN products p ON p.id = sri.product_id WHERE p.id IS NULL`,
    "orphan sale_return_items (no product)"
  );
  await count(
    `SELECT COUNT(*)::text AS n FROM payments pay JOIN sales s ON s.id = pay.sale_id WHERE pay.business_id <> s.business_id`,
    "payment.business_id <> sale.business_id"
  );
  await count(
    `SELECT COUNT(*)::text AS n FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id WHERE sr.business_id <> s.business_id`,
    "sale_return.business_id <> sale.business_id"
  );
  await count(
    `SELECT COUNT(*)::text AS n FROM stock_history sh LEFT JOIN products p ON p.id = sh.product_id WHERE p.id IS NULL`,
    "orphan stock_history (no product)"
  );
  await count(
    `SELECT COUNT(*)::text AS n FROM tax_categories t LEFT JOIN businesses b ON b.id = t.business_id WHERE b.id IS NULL`,
    "orphan tax_categories (no business)"
  );

  console.log("--- negative / out-of-range checks ---");
  await count(`SELECT COUNT(*)::text AS n FROM products WHERE selling_price < 0 OR buying_price < 0`, "products negative price");
  await count(`SELECT COUNT(*)::text AS n FROM customers WHERE total_due < 0 OR prepaid_balance < 0 OR total_paid < 0`, "customers negative balance");
  await count(`SELECT COUNT(*)::text AS n FROM sales WHERE total_amount < 0 OR amount_paid < 0`, "sales negative totals");
  await count(`SELECT COUNT(*)::text AS n FROM payments WHERE amount < 0`, "payments negative amount");
  await count(`SELECT COUNT(*)::text AS n FROM sale_items WHERE quantity <= 0`, "sale_items qty <= 0");
  await count(`SELECT COUNT(*)::text AS n FROM sale_items WHERE discount < 0 OR tax_rate < 0 OR tax_rate > 100`, "sale_items bad discount/tax");

  console.log("--- concurrency / scale checks ---");
  await count(
    `SELECT COUNT(*)::text AS n FROM (SELECT business_id, user_id FROM cash_register_shifts WHERE is_active = true GROUP BY business_id, user_id HAVING COUNT(*) > 1) t`,
    "user/business with >1 open shift"
  );
  await count(`SELECT COUNT(*)::text AS n FROM sync_queue WHERE synced = true`, "sync_queue synced rows (retention candidates)");
  await count(`SELECT COUNT(*)::text AS n FROM sync_queue WHERE synced = false`, "sync_queue pending rows");

  console.log("--- decimal scale violations (money >2dp) ---");
  await count(`SELECT COUNT(*)::text AS n FROM products WHERE selling_price <> ROUND(selling_price, 2) OR buying_price <> ROUND(buying_price, 2)`, "products price scale>2");
  await count(`SELECT COUNT(*)::text AS n FROM sales WHERE total_amount <> ROUND(total_amount, 2) OR amount_paid <> ROUND(amount_paid, 2)`, "sales totals scale>2");
  await count(`SELECT COUNT(*)::text AS n FROM customers WHERE total_due <> ROUND(total_due, 2) OR prepaid_balance <> ROUND(prepaid_balance, 2)`, "customers balance scale>2");
  console.log("done.");
}

main()
  .catch((e) => { console.error("VALIDATION-SCRIPT-ERROR:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
