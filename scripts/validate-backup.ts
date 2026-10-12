/** CLI wrapper: npx tsx scripts/validate-backup.ts <backup.json> (logic + tests in src/lib/backup-validator.*) */
import { validateBackup } from "../src/lib/backup-validator";

async function main() {
  const fs = await import("node:fs");
  const file = process.argv[2];
  if (!file) {
    console.error("usage: validate-backup.ts <backup.json>");
    process.exit(2);
  }
  if (fs.statSync(file).size > 50 * 1024 * 1024) {
    console.error("refusing to load backup > 50MB");
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(file, "utf-8"));
  const { ok, issues, counts } = validateBackup(payload);
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`tables: ${Object.keys(counts).length}, rows: ${rows}`);
  for (const i of issues) console.log(`${i.severity.toUpperCase()} [${i.check}] ${i.detail}`);
  console.log(ok ? "BACKUP-OK" : "BACKUP-INVALID");
  process.exit(ok ? 0 : 1);
}
main();
