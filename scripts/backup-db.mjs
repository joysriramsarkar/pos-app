/**
 * Database backup script — exports all tables as JSON before migration
 * Run: node scripts/backup-db.mjs
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 2 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function backup() {
  console.log('[Backup] Connecting to database...');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    const data = {};

    const tables = [
      ['users', () => prisma.user.findMany()],
      ['products', () => prisma.product.findMany()],
      ['categories', () => prisma.category.findMany()],
      ['customers', () => prisma.customer.findMany()],
      ['suppliers', () => prisma.supplier.findMany()],
      ['sales', () => prisma.sale.findMany()],
      ['saleItems', () => prisma.saleItem.findMany()],
      ['saleReturns', () => prisma.saleReturn.findMany()],
      ['saleReturnItems', () => prisma.saleReturnItem.findMany()],
      ['purchases', () => prisma.purchase.findMany()],
      ['purchaseItems', () => prisma.purchaseItem.findMany()],
      ['stockHistory', () => prisma.stockHistory.findMany()],
      ['ledgerEntries', () => prisma.ledgerEntry.findMany()],
      ['expenses', () => prisma.expense.findMany()],
      ['settings', () => prisma.setting.findMany()],
      ['auditLogs', () => prisma.auditLog.findMany()],
      ['syncQueue', () => prisma.syncQueue.findMany()],
      ['dailyManualRecords', () => prisma.dailyManualRecord.findMany()],
      ['productPopularity', () => prisma.productPopularity.findMany()],
      ['permissions', () => prisma.permission.findMany()],
      ['rolePermissions', () => prisma.rolePermission.findMany()],
    ];

    for (const [name, query] of tables) {
      process.stdout.write(`[Backup] Exporting ${name}... `);
      try {
        data[name] = await query();
        console.log(`${data[name].length} rows`);
      } catch (e) {
        console.log(`SKIPPED (${e.message.split('\n')[0]})`);
        data[name] = [];
      }
    }

    const summary = {};
    for (const [table, rows] of Object.entries(data)) {
      summary[table] = rows.length;
    }

    console.log('\n[Backup] Summary:');
    for (const [table, count] of Object.entries(summary)) {
      console.log(`  ${table}: ${count} rows`);
    }

    const filename = `backup_${timestamp}.json`;
    const filepath = join(process.cwd(), filename);
    writeFileSync(filepath, JSON.stringify({ timestamp, summary, data }, null, 2), 'utf8');

    console.log(`\n[Backup] Saved to: ${filename}`);
    return filepath;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

backup().catch((err) => {
  console.error('[Backup] Failed:', err);
  process.exit(1);
});
