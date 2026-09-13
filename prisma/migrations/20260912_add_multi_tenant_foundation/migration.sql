-- ============================================================================
-- Multi-Tenant Foundation Migration (Safe Production Backfill)
-- Migration: 20260912_add_multi_tenant_foundation
-- ============================================================================
-- Safe sequence:
-- 1. Create BusinessRole enum
-- 2. Drop legacy conflicting unique indexes
-- 3. Create businesses table
-- 4. Insert default Business ('biz_default_lakhan_bhandar')
-- 5. Create memberships table
-- 6. Insert OWNER memberships for all existing users into the default business
-- 7. Safely migrate users table (copy password -> password_hash, fill name)
-- 8. Add business_id as NULLABLE to existing tables
-- 9. Backfill all existing rows with default business_id
-- 10. Verify & alter business_id SET NOT NULL
-- 11. Create new feature tables
-- 12. Create indexes & unique constraints
-- 13. Add foreign keys
-- ============================================================================

-- 1. Create BusinessRole Enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BusinessRole') THEN
        CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'VIEWER');
    END IF;
END $$;

-- 2. Drop legacy conflicting indexes
DROP INDEX IF EXISTS "categories_name_key";
DROP INDEX IF EXISTS "customers_phone_idx";
DROP INDEX IF EXISTS "customers_phone_key";
DROP INDEX IF EXISTS "customers_prepaid_balance_idx";
DROP INDEX IF EXISTS "ledger_entries_customer_id_idx";
DROP INDEX IF EXISTS "products_barcode_key";
DROP INDEX IF EXISTS "purchases_supplier_id_idx";
DROP INDEX IF EXISTS "sales_created_at_idx";
DROP INDEX IF EXISTS "sales_customer_id_idx";
DROP INDEX IF EXISTS "sales_invoice_number_key";
DROP INDEX IF EXISTS "sales_status_idx";
DROP INDEX IF EXISTS "sales_user_id_idx";
DROP INDEX IF EXISTS "stock_history_product_id_idx";
DROP INDEX IF EXISTS "sync_queue_entity_type_entity_id_idx";

-- 3. Create businesses table
CREATE TABLE IF NOT EXISTS "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- 4. Upsert Default Business for Existing Data Backfill
INSERT INTO "businesses" ("id", "name", "slug", "currency", "timezone", "is_active", "created_at", "updated_at")
VALUES (
    'biz_default_lakhan_bhandar',
    'Lakhan Bhandar',
    'lakhan-bhandar',
    'INR',
    'Asia/Kolkata',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

-- 5. Create memberships table
CREATE TABLE IF NOT EXISTS "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'CASHIER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- 6. Insert OWNER membership for all existing users into the default business
INSERT INTO "memberships" ("id", "user_id", "business_id", "role", "is_active", "created_at")
SELECT 
    'mem_' || substr(md5(random()::text || clock_timestamp()::text || u.id), 1, 20),
    u.id,
    'biz_default_lakhan_bhandar',
    'OWNER'::"BusinessRole",
    true,
    CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "memberships" m 
    WHERE m.user_id = u.id AND m.business_id = 'biz_default_lakhan_bhandar'
);

-- 7. Safely migrate users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "requires_password_change" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- Copy existing password to password_hash if password column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password'
    ) THEN
        UPDATE "users" 
        SET "password_hash" = "password" 
        WHERE "password_hash" IS NULL AND "password" IS NOT NULL;
    END IF;
END $$;

-- Provide dummy fallback hash if any nulls remain
UPDATE "users" 
SET "password_hash" = '$2a$10$w8T0qG9x1vJ1rO0sZ.X4u.N7t8s4bM5vG2b.0Z4x8y5a6b7c8d9e.' 
WHERE "password_hash" IS NULL;

-- Enforce NOT NULL on password_hash
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

-- Ensure name is not null
UPDATE "users" SET "name" = "username" WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

-- Drop legacy password and role columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "password";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";

-- Drop legacy UserRole enum if exists
DROP TYPE IF EXISTS "UserRole";

-- 8. Add business_id as NULLABLE first & apply column updates to existing tables

-- categories
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "business_id" TEXT;

-- customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "name_en" TEXT;
ALTER TABLE "customers" ALTER COLUMN "total_due" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "customers" ALTER COLUMN "total_paid" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "customers" ALTER COLUMN "prepaid_balance" SET DATA TYPE DECIMAL(65,30);

-- expenses
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT 'Cash';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplier_name" TEXT;
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- ledger_entries
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "ledger_entries" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "ledger_entries" ALTER COLUMN "balance_after" SET DATA TYPE DECIMAL(65,30);

-- products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sub_category" TEXT DEFAULT '';
ALTER TABLE "products" ALTER COLUMN "buying_price" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "products" ALTER COLUMN "selling_price" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "products" ALTER COLUMN "current_stock" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "products" ALTER COLUMN "min_stock_level" SET DATA TYPE DECIMAL(65,30);

-- purchase_items
ALTER TABLE "purchase_items" ADD COLUMN IF NOT EXISTS "received_qty" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "purchase_items" ALTER COLUMN "buying_price" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "purchase_items" ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(65,30);

-- purchases
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "delivery_status" TEXT NOT NULL DEFAULT 'Pending';
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "payment_method" TEXT NOT NULL DEFAULT 'Cash';
ALTER TABLE "purchases" ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(65,30);

-- role_permissions
ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "role";
ALTER TABLE "role_permissions" ADD COLUMN "role" "BusinessRole" NOT NULL DEFAULT 'CASHIER';

-- sale_items
ALTER TABLE "sale_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sale_items" ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sale_items" ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(65,30);

-- sales
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "cash_amount" DECIMAL(65,30);
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "upi_amount" DECIMAL(65,30);
ALTER TABLE "sales" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sales" ALTER COLUMN "discount" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sales" ALTER COLUMN "tax" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sales" ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(65,30);
ALTER TABLE "sales" ALTER COLUMN "amount_paid" SET DATA TYPE DECIMAL(65,30);

-- stock_history
ALTER TABLE "stock_history" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "stock_history" ADD COLUMN IF NOT EXISTS "purchase_id" TEXT;
ALTER TABLE "stock_history" ADD COLUMN IF NOT EXISTS "sale_id" TEXT;
ALTER TABLE "stock_history" ADD COLUMN IF NOT EXISTS "sale_return_id" TEXT;
ALTER TABLE "stock_history" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30);

-- suppliers
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "name_en" TEXT;

-- sync_queue
ALTER TABLE "sync_queue" ADD COLUMN IF NOT EXISTS "business_id" TEXT;
ALTER TABLE "sync_queue" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "sync_queue" ALTER COLUMN "entity_id" DROP NOT NULL;
ALTER TABLE "sync_queue" DROP COLUMN IF EXISTS "payload";
ALTER TABLE "sync_queue" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "sync_queue" ALTER COLUMN "idempotency_key" SET NOT NULL;
ALTER TABLE "sync_queue" DROP COLUMN IF EXISTS "result";
ALTER TABLE "sync_queue" ADD COLUMN "result" JSONB;

-- 9. BACKFILL: Update all existing rows with default business_id
UPDATE "categories" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "customers" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "expenses" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "ledger_entries" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "products" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "purchases" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "sales" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "stock_history" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;
UPDATE "suppliers" SET "business_id" = 'biz_default_lakhan_bhandar' WHERE "business_id" IS NULL;

-- 10. Enforce NOT NULL on business_id after backfill
ALTER TABLE "categories" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "purchases" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "sales" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "stock_history" ALTER COLUMN "business_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "business_id" SET NOT NULL;

-- 11. Create new feature tables
CREATE TABLE IF NOT EXISTS "business_settings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_popularity" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "monthly_sales_count" INTEGER NOT NULL DEFAULT 0,
    "weekly_sales_count" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_popularity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sale_returns" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "user_id" TEXT,
    "refund_amount" DECIMAL(65,30) NOT NULL,
    "refund_method" TEXT NOT NULL DEFAULT 'Cash',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sale_return_items" (
    "id" TEXT NOT NULL,
    "sale_return_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "total_price" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "daily_manual_records" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sales" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_manual_records_pkey" PRIMARY KEY ("id")
);

-- 12. Create Indexes and Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_slug_key" ON "businesses"("slug");
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships"("user_id");
CREATE INDEX IF NOT EXISTS "memberships_business_id_idx" ON "memberships"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_id_business_id_key" ON "memberships"("user_id", "business_id");
CREATE INDEX IF NOT EXISTS "business_settings_business_id_idx" ON "business_settings"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "business_settings_business_id_key_key" ON "business_settings"("business_id", "key");
CREATE INDEX IF NOT EXISTS "product_popularity_business_id_idx" ON "product_popularity"("business_id");
CREATE INDEX IF NOT EXISTS "product_popularity_business_id_monthly_sales_count_idx" ON "product_popularity"("business_id", "monthly_sales_count");
CREATE INDEX IF NOT EXISTS "product_popularity_business_id_weekly_sales_count_idx" ON "product_popularity"("business_id", "weekly_sales_count");
CREATE UNIQUE INDEX IF NOT EXISTS "product_popularity_product_id_period_start_key" ON "product_popularity"("product_id", "period_start");
CREATE INDEX IF NOT EXISTS "sale_returns_business_id_idx" ON "sale_returns"("business_id");
CREATE INDEX IF NOT EXISTS "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");
CREATE INDEX IF NOT EXISTS "sale_returns_created_at_idx" ON "sale_returns"("created_at");
CREATE INDEX IF NOT EXISTS "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");
CREATE INDEX IF NOT EXISTS "sale_return_items_sale_item_id_idx" ON "sale_return_items"("sale_item_id");
CREATE INDEX IF NOT EXISTS "audit_logs_business_id_idx" ON "audit_logs"("business_id");
CREATE INDEX IF NOT EXISTS "audit_logs_business_id_created_at_idx" ON "audit_logs"("business_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entityType_idx" ON "audit_logs"("entityType");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "daily_manual_records_business_id_idx" ON "daily_manual_records"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "daily_manual_records_business_id_date_key" ON "daily_manual_records"("business_id", "date");
CREATE INDEX IF NOT EXISTS "categories_business_id_idx" ON "categories"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "categories_business_id_name_key" ON "categories"("business_id", "name");
CREATE INDEX IF NOT EXISTS "customers_business_id_idx" ON "customers"("business_id");
CREATE INDEX IF NOT EXISTS "customers_business_id_phone_idx" ON "customers"("business_id", "phone");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_id_phone_key" ON "customers"("business_id", "phone");
CREATE INDEX IF NOT EXISTS "expenses_business_id_idx" ON "expenses"("business_id");
CREATE INDEX IF NOT EXISTS "expenses_business_id_date_idx" ON "expenses"("business_id", "date");
CREATE INDEX IF NOT EXISTS "expenses_business_id_supplier_id_idx" ON "expenses"("business_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_idx" ON "ledger_entries"("business_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_customer_id_idx" ON "ledger_entries"("business_id", "customer_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_customer_id_created_at_idx" ON "ledger_entries"("business_id", "customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_customer_id_entryType_created_at_idx" ON "ledger_entries"("business_id", "customer_id", "entryType", "created_at");
CREATE INDEX IF NOT EXISTS "products_business_id_idx" ON "products"("business_id");
CREATE INDEX IF NOT EXISTS "products_business_id_is_active_idx" ON "products"("business_id", "is_active");
CREATE INDEX IF NOT EXISTS "products_business_id_category_is_active_idx" ON "products"("business_id", "category", "is_active");
CREATE INDEX IF NOT EXISTS "products_business_id_category_is_active_name_idx" ON "products"("business_id", "category", "is_active", "name");
CREATE INDEX IF NOT EXISTS "products_business_id_name_idx" ON "products"("business_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "products_business_id_barcode_key" ON "products"("business_id", "barcode");
CREATE INDEX IF NOT EXISTS "purchases_business_id_idx" ON "purchases"("business_id");
CREATE INDEX IF NOT EXISTS "purchases_business_id_supplier_id_idx" ON "purchases"("business_id", "supplier_id");
CREATE UNIQUE INDEX IF NOT EXISTS "purchases_business_id_invoice_number_key" ON "purchases"("business_id", "invoice_number");
CREATE INDEX IF NOT EXISTS "role_permissions_role_idx" ON "role_permissions"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");
CREATE INDEX IF NOT EXISTS "sales_business_id_idx" ON "sales"("business_id");
CREATE INDEX IF NOT EXISTS "sales_business_id_customer_id_idx" ON "sales"("business_id", "customer_id");
CREATE INDEX IF NOT EXISTS "sales_business_id_user_id_idx" ON "sales"("business_id", "user_id");
CREATE INDEX IF NOT EXISTS "sales_business_id_created_at_idx" ON "sales"("business_id", "created_at");
CREATE INDEX IF NOT EXISTS "sales_business_id_status_idx" ON "sales"("business_id", "status");
CREATE INDEX IF NOT EXISTS "sales_business_id_created_at_status_idx" ON "sales"("business_id", "created_at", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_business_id_invoice_number_key" ON "sales"("business_id", "invoice_number");
CREATE INDEX IF NOT EXISTS "stock_history_business_id_idx" ON "stock_history"("business_id");
CREATE INDEX IF NOT EXISTS "stock_history_business_id_product_id_idx" ON "stock_history"("business_id", "product_id");
CREATE INDEX IF NOT EXISTS "suppliers_business_id_idx" ON "suppliers"("business_id");
CREATE INDEX IF NOT EXISTS "sync_queue_business_id_idx" ON "sync_queue"("business_id");
CREATE INDEX IF NOT EXISTS "sync_queue_idempotency_key_idx" ON "sync_queue"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- 13. Add Foreign Keys (Drop if exists first to make idempotent)
DO $$
BEGIN
    ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_user_id_fkey";
    ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "memberships" DROP CONSTRAINT IF EXISTS "memberships_business_id_fkey";
    ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "business_settings" DROP CONSTRAINT IF EXISTS "business_settings_business_id_fkey";
    ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_business_id_fkey";
    ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_business_id_fkey";
    ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "stock_history" DROP CONSTRAINT IF EXISTS "stock_history_business_id_fkey";
    ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "stock_history" DROP CONSTRAINT IF EXISTS "stock_history_sale_id_fkey";
    ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "stock_history" DROP CONSTRAINT IF EXISTS "stock_history_purchase_id_fkey";
    ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "stock_history" DROP CONSTRAINT IF EXISTS "stock_history_sale_return_id_fkey";
    ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "product_popularity" DROP CONSTRAINT IF EXISTS "product_popularity_product_id_fkey";
    ALTER TABLE "product_popularity" ADD CONSTRAINT "product_popularity_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "product_popularity" DROP CONSTRAINT IF EXISTS "product_popularity_business_id_fkey";
    ALTER TABLE "product_popularity" ADD CONSTRAINT "product_popularity_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_business_id_fkey";
    ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_business_id_fkey";
    ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_business_id_fkey";
    ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_business_id_fkey";
    ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_sale_id_fkey";
    ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "sale_returns_user_id_fkey";
    ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "sale_return_items" DROP CONSTRAINT IF EXISTS "sale_return_items_sale_return_id_fkey";
    ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sale_return_items" DROP CONSTRAINT IF EXISTS "sale_return_items_sale_item_id_fkey";
    ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_business_id_fkey";
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "purchases" DROP CONSTRAINT IF EXISTS "purchases_business_id_fkey";
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "sync_queue" DROP CONSTRAINT IF EXISTS "sync_queue_business_id_fkey";
    ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_business_id_fkey";
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_supplier_id_fkey";
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_business_id_fkey";
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "daily_manual_records" DROP CONSTRAINT IF EXISTS "daily_manual_records_business_id_fkey";
    ALTER TABLE "daily_manual_records" ADD CONSTRAINT "daily_manual_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;
