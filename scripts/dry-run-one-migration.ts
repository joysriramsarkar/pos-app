/** Dry-run a migration dir inside a rolled-back transaction. Usage: npx tsx scripts/dry-run-one-migration.ts <dir> */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: dry-run-one-migration.ts <migration-dir>");
  process.exit(2);
}
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || url.includes("dummy")) {
  console.error("No real DIRECT_URL — aborting.");
  process.exit(2);
}
const sql = fs.readFileSync(path.join(process.cwd(), "prisma", "migrations", dir, "migration.sql"), "utf-8");

async function main() {
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query(sql);
    console.log(`DRY-RUN-OK: ${dir} valid against live data (rolled back, nothing persisted).`);
    await client.query("ROLLBACK");
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("DRY-RUN-FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
