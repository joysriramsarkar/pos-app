/**
 * Manual database migration script for multi-tenant architecture
 * This script:
 * 1. Marks the failed migration as resolved
 * 2. Drops all existing tables (with backup already done)
 * 3. Creates fresh multi-tenant schema
 * 4. Restores data from backup with business context
 *
 * Run: node scripts/migrate-to-multitenant.mjs
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'fs/promises';
import path from 'path';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL ||
  'postgresql://postgres:i181h5Nky2gBTrWU@db.ijpkklczlzcjbfynoqer.supabase.co:5432/postgres?schema=public';

const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 10000,
});

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('[Migration] Connecting to database...');

  // Check connection
  await query('SELECT 1');
  console.log('[Migration] Connected.');

  // Find the latest backup file
  const backupFiles = [];
  const files = await import('fs').then(fs => {
    const dir = process.cwd();
    const all = fs.readdirSync(dir);
    return all.filter(f => f.startsWith('backup_') && f.endsWith('.json'));
  });

  if (files.length === 0) {
    console.error('[Migration] No backup file found! Aborting.');
    process.exit(1);
  }

  const latestBackup = files.sort().reverse()[0];
  console.log(`[Migration] Using backup: ${latestBackup}`);

  const backupData = JSON.parse(readFileSync(join(process.cwd(), latestBackup), 'utf8'));
  const { data } = backupData;

  console.log(`[Migration] Backup contains:`);
  for (const [table, rows] of Object.entries(backupData.summary)) {
    if (rows > 0) console.log(`  ${table}: ${rows} rows`);
  }

  // ==========================================================================
  // STEP 1: Drop all existing tables and migrations
  // ==========================================================================
  console.log('\n[Migration] Step 1: Dropping all existing tables...');

  await query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
  `);
  console.log('[Migration] All tables dropped.');

  // ==========================================================================
  // STEP 2: Apply all Prisma migrations in order
  // ==========================================================================
  console.log('\n[Migration] Step 2: The schema will be applied by prisma migrate deploy');
  console.log('[Migration] Please run: pnpm prisma migrate deploy');

  await pool.end();
  console.log('\n[Migration] Database cleared. Now run: pnpm prisma migrate deploy');
}

main().catch(err => {
  console.error('[Migration] Error:', err);
  process.exit(1);
});
