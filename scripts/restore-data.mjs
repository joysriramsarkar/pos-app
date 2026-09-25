/**
 * Data restore script — restores backup data into multi-tenant schema
 *
 * Strategy:
 * 1. Create a default Business for all existing data
 * 2. Migrate all existing Users to new schema (password → passwordHash)
 * 3. Create Membership for each user as OWNER of the default business
 * 4. Restore all tenant-owned data with businessId = default business
 * 5. Restore permissions/settings
 *
 * Run: node scripts/restore-data.mjs
 */

import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required.");
}

const pool = new Pool({ connectionString, max: 3 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Find latest backup
const dir = process.cwd();
const backupFiles = readdirSync(dir).filter(f => f.startsWith('backup_') && f.endsWith('.json')).sort().reverse();

if (backupFiles.length === 0) {
  console.error('No backup file found!');
  process.exit(1);
}

const backupFile = backupFiles[0];
console.log(`[Restore] Using backup: ${backupFile}`);
const { data } = JSON.parse(readFileSync(join(dir, backupFile), 'utf8'));

// Default business that all existing data will belong to
const DEFAULT_BUSINESS = {
  id: 'biz_default_lakhan_bhandar',
  name: 'Lakhan Bhandar',
  slug: 'lakhan-bhandar',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function insertBatch(label, items, insertFn) {
  const chunks = chunkArray(items, 100);
  let total = 0;
  for (const chunk of chunks) {
    await insertFn(chunk);
    total += chunk.length;
    process.stdout.write(`\r[Restore] ${label}: ${total}/${items.length}`);
  }
  console.log(` ✓`);
}

async function main() {
  console.log('[Restore] Starting data restore...\n');

  // ==========================================================================
  // 1. Create default business
  // ==========================================================================
  console.log('[Restore] Creating default business...');
  await prisma.business.upsert({
    where: { id: DEFAULT_BUSINESS.id },
    create: DEFAULT_BUSINESS,
    update: {},
  });
  console.log(`[Restore] Business created: ${DEFAULT_BUSINESS.name}`);

  // ==========================================================================
  // 2. Restore Users (password → passwordHash)
  // ==========================================================================
  if (data.users?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.users.length} users...`);
    for (const user of data.users) {
      await prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          username: user.username,
          email: user.email || null,
          passwordHash: user.password, // old 'password' field was already bcrypt hash
          name: user.name || user.username,
          phone: user.phone || null,
          isActive: user.is_active ?? user.isActive ?? true,
          requiresPasswordChange: user.requires_password_change ?? user.requiresPasswordChange ?? false,
          failedLoginAttempts: user.failed_login_attempts ?? user.failedLoginAttempts ?? 0,
          lockedUntil: user.locked_until ?? user.lockedUntil ?? null,
          createdAt: user.created_at ? new Date(user.created_at) : new Date(),
          updatedAt: user.updated_at ? new Date(user.updated_at) : new Date(),
        },
        update: {},
      });
    }
    console.log(`[Restore] Users restored: ${data.users.length} ✓`);
  }

  // ==========================================================================
  // 3. Create Memberships — first user with ADMIN role gets OWNER, rest get based on old role
  // ==========================================================================
  if (data.users?.length > 0) {
    console.log(`\n[Restore] Creating memberships...`);
    for (const user of data.users) {
      // Map old roles to new BusinessRole
      const roleMap = { ADMIN: 'OWNER', MANAGER: 'MANAGER', CASHIER: 'CASHIER', VIEWER: 'VIEWER' };
      const oldRole = user.role || 'VIEWER';
      const newRole = roleMap[oldRole] || 'CASHIER';

      await prisma.membership.upsert({
        where: { userId_businessId: { userId: user.id, businessId: DEFAULT_BUSINESS.id } },
        create: {
          userId: user.id,
          businessId: DEFAULT_BUSINESS.id,
          role: newRole,
          isActive: true,
        },
        update: {},
      });
    }
    console.log(`[Restore] Memberships created: ${data.users.length} ✓`);
  }

  // ==========================================================================
  // 4. Restore Categories (now tenant-scoped)
  // ==========================================================================
  if (data.categories?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.categories.length} categories...`);
    for (const cat of data.categories) {
      await prisma.category.upsert({
        where: { businessId_name: { businessId: DEFAULT_BUSINESS.id, name: cat.name } },
        create: {
          id: cat.id,
          businessId: DEFAULT_BUSINESS.id,
          name: cat.name,
          nameBn: cat.name_bn ?? cat.nameBn ?? null,
          description: cat.description ?? null,
          createdAt: cat.created_at ? new Date(cat.created_at) : new Date(),
          updatedAt: cat.updated_at ? new Date(cat.updated_at) : new Date(),
        },
        update: {},
      });
    }
    console.log(`[Restore] Categories restored: ${data.categories.length} ✓`);
  }

  // ==========================================================================
  // 5. Restore Products (now tenant-scoped)
  // ==========================================================================
  if (data.products?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.products.length} products...`);
    await insertBatch('Products', data.products, async (chunk) => {
      await prisma.product.createMany({
        data: chunk.map(p => ({
          id: p.id,
          businessId: DEFAULT_BUSINESS.id,
          barcode: p.barcode ?? null,
          name: p.name,
          nameBn: p.name_bn ?? p.nameBn ?? null,
          category: p.category || 'General',
          subCategory: p.sub_category ?? p.subCategory ?? null,
          buyingPrice: p.buying_price ?? p.buyingPrice ?? 0,
          sellingPrice: p.selling_price ?? p.sellingPrice ?? 0,
          unit: p.unit || 'piece',
          currentStock: p.current_stock ?? p.currentStock ?? 0,
          minStockLevel: p.min_stock_level ?? p.minStockLevel ?? 5,
          isActive: p.is_active ?? p.isActive ?? true,
          imageUrl: p.image_url ?? p.imageUrl ?? null,
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
          updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 6. Restore Suppliers
  // ==========================================================================
  if (data.suppliers?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.suppliers.length} suppliers...`);
    await insertBatch('Suppliers', data.suppliers, async (chunk) => {
      await prisma.supplier.createMany({
        data: chunk.map(s => ({
          id: s.id,
          businessId: DEFAULT_BUSINESS.id,
          name: s.name,
          nameEn: s.name_en ?? s.nameEn ?? null,
          phone: s.phone ?? null,
          address: s.address ?? null,
          email: s.email ?? null,
          gstNumber: s.gst_number ?? s.gstNumber ?? null,
          notes: s.notes ?? null,
          isActive: s.is_active ?? s.isActive ?? true,
          createdAt: s.created_at ? new Date(s.created_at) : new Date(),
          updatedAt: s.updated_at ? new Date(s.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 7. Restore Customers
  // ==========================================================================
  if (data.customers?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.customers.length} customers...`);
    await insertBatch('Customers', data.customers, async (chunk) => {
      await prisma.customer.createMany({
        data: chunk.map(c => ({
          id: c.id,
          businessId: DEFAULT_BUSINESS.id,
          name: c.name,
          nameEn: c.name_en ?? c.nameEn ?? null,
          phone: c.phone ?? null,
          address: c.address ?? null,
          totalDue: c.total_due ?? c.totalDue ?? 0,
          totalPaid: c.total_paid ?? c.totalPaid ?? 0,
          prepaidBalance: c.prepaid_balance ?? c.prepaidBalance ?? 0,
          notes: c.notes ?? null,
          isActive: c.is_active ?? c.isActive ?? true,
          createdAt: c.created_at ? new Date(c.created_at) : new Date(),
          updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 8. Restore Sales
  // ==========================================================================
  if (data.sales?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.sales.length} sales...`);
    await insertBatch('Sales', data.sales, async (chunk) => {
      await prisma.sale.createMany({
        data: chunk.map(s => ({
          id: s.id,
          businessId: DEFAULT_BUSINESS.id,
          invoiceNumber: s.invoice_number ?? s.invoiceNumber,
          customerId: s.customer_id ?? s.customerId ?? null,
          userId: s.user_id ?? s.userId ?? null,
          subtotal: s.subtotal ?? 0,
          discount: s.discount ?? 0,
          tax: s.tax ?? 0,
          totalAmount: s.total_amount ?? s.totalAmount ?? 0,
          amountPaid: s.amount_paid ?? s.amountPaid ?? 0,
          paymentMethod: s.payment_method ?? s.paymentMethod ?? 'Cash',
          paymentStatus: s.payment_status ?? s.paymentStatus ?? 'Paid',
          status: s.status ?? 'Completed',
          cashAmount: s.cash_amount ?? s.cashAmount ?? null,
          upiAmount: s.upi_amount ?? s.upiAmount ?? null,
          notes: s.notes ?? null,
          offlineSynced: s.offline_synced ?? s.offlineSynced ?? true,
          createdAt: s.created_at ? new Date(s.created_at) : new Date(),
          updatedAt: s.updated_at ? new Date(s.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 9. Restore SaleItems
  // ==========================================================================
  if (data.saleItems?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.saleItems.length} sale items...`);
    await insertBatch('SaleItems', data.saleItems, async (chunk) => {
      await prisma.saleItem.createMany({
        data: chunk.map(si => ({
          id: si.id,
          saleId: si.sale_id ?? si.saleId,
          productId: si.product_id ?? si.productId,
          productName: si.product_name ?? si.productName,
          quantity: si.quantity,
          unitPrice: si.unit_price ?? si.unitPrice,
          costPriceAtSale: si.cost_price_at_sale ?? si.costPriceAtSale ?? 0,
          totalPrice: si.total_price ?? si.totalPrice,
          createdAt: si.created_at ? new Date(si.created_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 10. Restore Purchases
  // ==========================================================================
  if (data.purchases?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.purchases.length} purchases...`);
    await insertBatch('Purchases', data.purchases, async (chunk) => {
      await prisma.purchase.createMany({
        data: chunk.map(p => ({
          id: p.id,
          businessId: DEFAULT_BUSINESS.id,
          supplierId: p.supplier_id ?? p.supplierId ?? null,
          invoiceNumber: p.invoice_number ?? p.invoiceNumber ?? null,
          totalAmount: p.total_amount ?? p.totalAmount ?? 0,
          paidAmount: p.paid_amount ?? p.paidAmount ?? 0,
          paymentStatus: p.payment_status ?? p.paymentStatus ?? 'Pending',
          deliveryStatus: p.delivery_status ?? p.deliveryStatus ?? 'Pending',
          notes: p.notes ?? null,
          paymentMethod: p.payment_method ?? p.paymentMethod ?? 'Cash',
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
          updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 11. Restore PurchaseItems
  // ==========================================================================
  if (data.purchaseItems?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.purchaseItems.length} purchase items...`);
    await insertBatch('PurchaseItems', data.purchaseItems, async (chunk) => {
      await prisma.purchaseItem.createMany({
        data: chunk.map(pi => ({
          id: pi.id,
          purchaseId: pi.purchase_id ?? pi.purchaseId,
          productId: pi.product_id ?? pi.productId,
          productName: pi.product_name ?? pi.productName,
          quantity: pi.quantity,
          receivedQty: pi.received_qty ?? pi.receivedQty ?? 0,
          buyingPrice: pi.buying_price ?? pi.buyingPrice,
          totalPrice: pi.total_price ?? pi.totalPrice,
          createdAt: pi.created_at ? new Date(pi.created_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 12. Restore StockHistory
  // ==========================================================================
  if (data.stockHistory?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.stockHistory.length} stock history...`);
    await insertBatch('StockHistory', data.stockHistory, async (chunk) => {
      await prisma.stockHistory.createMany({
        data: chunk.map(sh => ({
          id: sh.id,
          businessId: DEFAULT_BUSINESS.id,
          productId: sh.product_id ?? sh.productId,
          changeType: sh.change_type ?? sh.changeType,
          quantity: sh.quantity,
          reason: sh.reason ?? null,
          referenceId: sh.reference_id ?? sh.referenceId ?? null,
          saleId: sh.sale_id ?? sh.saleId ?? null,
          purchaseId: sh.purchase_id ?? sh.purchaseId ?? null,
          saleReturnId: sh.sale_return_id ?? sh.saleReturnId ?? null,
          createdAt: sh.created_at ? new Date(sh.created_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 13. Restore LedgerEntries
  // ==========================================================================
  if (data.ledgerEntries?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.ledgerEntries.length} ledger entries...`);
    await insertBatch('LedgerEntries', data.ledgerEntries, async (chunk) => {
      await prisma.ledgerEntry.createMany({
        data: chunk.map(le => ({
          id: le.id,
          businessId: DEFAULT_BUSINESS.id,
          customerId: le.customer_id ?? le.customerId,
          entryType: le.entry_type ?? le.entryType,
          amount: le.amount,
          balanceAfter: le.balance_after ?? le.balanceAfter,
          description: le.description ?? null,
          referenceId: le.reference_id ?? le.referenceId ?? null,
          createdAt: le.created_at ? new Date(le.created_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 14. Restore Expenses
  // ==========================================================================
  if (data.expenses?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.expenses.length} expenses...`);
    await insertBatch('Expenses', data.expenses, async (chunk) => {
      await prisma.expense.createMany({
        data: chunk.map(e => ({
          id: e.id,
          businessId: DEFAULT_BUSINESS.id,
          amount: e.amount,
          category: e.category,
          notes: e.notes ?? null,
          paymentMethod: e.payment_method ?? e.paymentMethod ?? 'Cash',
          date: e.date ? new Date(e.date) : new Date(),
          supplierId: e.supplier_id ?? e.supplierId ?? null,
          supplierName: e.supplier_name ?? e.supplierName ?? null,
          isActive: e.is_active ?? e.isActive ?? true,
          createdAt: e.created_at ? new Date(e.created_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 15. Restore Settings as BusinessSettings
  // ==========================================================================
  if (data.settings?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.settings.length} settings as business settings...`);
    for (const s of data.settings) {
      await prisma.businessSetting.upsert({
        where: { businessId_key: { businessId: DEFAULT_BUSINESS.id, key: s.key } },
        create: {
          businessId: DEFAULT_BUSINESS.id,
          key: s.key,
          value: s.value,
        },
        update: {},
      });
      // Also keep in global settings for backward compat
      await prisma.setting.upsert({
        where: { key: s.key },
        create: { id: s.id, key: s.key, value: s.value, description: s.description ?? null },
        update: {},
      });
    }
    console.log(`[Restore] Settings restored: ${data.settings.length} ✓`);
  }

  // ==========================================================================
  // 16. Restore DailyManualRecords
  // ==========================================================================
  if (data.dailyManualRecords?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.dailyManualRecords.length} daily records...`);
    for (const r of data.dailyManualRecords) {
      await prisma.dailyManualRecord.upsert({
        where: { businessId_date: { businessId: DEFAULT_BUSINESS.id, date: r.date } },
        create: {
          id: r.id,
          businessId: DEFAULT_BUSINESS.id,
          date: r.date,
          sales: r.sales ?? 0,
          expenses: r.expenses ?? 0,
          profit: r.profit ?? 0,
          notes: r.notes ?? null,
          createdAt: r.created_at ? new Date(r.created_at) : new Date(),
          updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
        },
        update: {},
      });
    }
    console.log(`[Restore] Daily records restored: ${data.dailyManualRecords.length} ✓`);
  }

  // ==========================================================================
  // 17. Restore ProductPopularity
  // ==========================================================================
  if (data.productPopularity?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.productPopularity.length} product popularity...`);
    await insertBatch('ProductPopularity', data.productPopularity, async (chunk) => {
      await prisma.productPopularity.createMany({
        data: chunk.map(pp => ({
          id: pp.id,
          businessId: DEFAULT_BUSINESS.id,
          productId: pp.product_id ?? pp.productId,
          monthlySalesCount: pp.monthly_sales_count ?? pp.monthlySalesCount ?? 0,
          weeklySalesCount: pp.weekly_sales_count ?? pp.weeklySalesCount ?? 0,
          totalRevenue: pp.total_revenue ?? pp.totalRevenue ?? 0,
          periodStart: pp.period_start ? new Date(pp.period_start) : new Date(),
          periodEnd: pp.period_end ? new Date(pp.period_end) : new Date(),
          updatedAt: pp.updated_at ? new Date(pp.updated_at) : new Date(),
        })),
        skipDuplicates: true,
      });
    });
  }

  // ==========================================================================
  // 18. Restore Permissions & RolePermissions
  // ==========================================================================
  if (data.permissions?.length > 0) {
    console.log(`\n[Restore] Restoring ${data.permissions.length} permissions...`);
    for (const p of data.permissions) {
      await prisma.permission.upsert({
        where: { code: p.code },
        create: {
          id: p.id,
          code: p.code,
          description: p.description ?? null,
          category: p.category,
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
        },
        update: {},
      });
    }

    if (data.rolePermissions?.length > 0) {
      console.log(`[Restore] Restoring ${data.rolePermissions.length} role permissions...`);
      for (const rp of data.rolePermissions) {
        // Map old UserRole to new BusinessRole
        const roleMap = { ADMIN: 'OWNER', MANAGER: 'MANAGER', CASHIER: 'CASHIER', VIEWER: 'VIEWER' };
        const newRole = roleMap[rp.role] || rp.role;

        // Check if permission exists
        const perm = await prisma.permission.findUnique({ where: { id: rp.permission_id ?? rp.permissionId } });
        if (!perm) continue;

        try {
          await prisma.rolePermission.upsert({
            where: { role_permissionId: { role: newRole, permissionId: perm.id } },
            create: {
              id: rp.id,
              role: newRole,
              permissionId: perm.id,
              createdAt: rp.created_at ? new Date(rp.created_at) : new Date(),
            },
            update: {},
          });
        } catch (e) {
          // Skip duplicates silently
        }
      }
    }
    console.log(`[Restore] Permissions restored ✓`);
  }

  console.log('\n[Restore] ✅ All data restored successfully!');
  console.log(`\n[Restore] Summary:`);
  console.log(`  Business: ${DEFAULT_BUSINESS.name} (id: ${DEFAULT_BUSINESS.id})`);
  console.log(`  All existing data migrated to this business`);
  console.log(`  All users have memberships created`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(err => {
  console.error('[Restore] Error:', err);
  process.exit(1);
});
