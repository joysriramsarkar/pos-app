-- MP: schema parity migration — close the gap between the migration-replayable
-- schema and what schema.prisma describes.
--
-- Why this exists:
--   The 20260912 and 20261011 hand-authored migrations were (re)written against
--   the PRODUCTION database, which carries years of `prisma db push` drift:
--   enum types, whole tables (payments, supplier_ledger_entries,
--   cash_register_shifts, tax_categories) and columns that no migration ever
--   created. Replaying the migration history from scratch (new staging, CI
--   integration job, disaster-recovery restore) therefore died at the first
--   statement that touched a drifted object — e.g. 2BP01 on the legacy
--   UserRole enum, 42703 "column discount does not exist", 42P01
--   "relation payments does not exist".
--
--   This migration (name-ordered between 20260913_enable_rls and
--   20261011_hardening) creates every drifted object idempotently BEFORE the
--   hardening/RLS migrations run. On databases that already carry the drift it
--   is a strict no-op; on fresh databases it makes the history replayable.
--
-- Every statement is idempotent (IF NOT EXISTS / DO $$ guards), matching the
-- style of the surrounding hand-authored migrations.

-- ---------------------------------------------------------------------------
-- 1. Enum types declared by schema.prisma but created by no migration
--    (PostgreSQL has no CREATE TYPE IF NOT EXISTS, so guard each one)
-- ---------------------------------------------------------------------------

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
  CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'DUE');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleStatus') THEN
  CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIAL_RETURN');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK', 'CREDIT', 'PREPAID', 'MIXED');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockChangeType') THEN
  CREATE TYPE "StockChangeType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'OPENING');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchasePaymentStatus') THEN
  CREATE TYPE "PurchasePaymentStatus" AS ENUM ('PAID', 'PENDING', 'PARTIAL');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseDeliveryStatus') THEN
  CREATE TYPE "PurchaseDeliveryStatus" AS ENUM ('PENDING', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefundMethod') THEN
  CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'PREPAID', 'UPI', 'BANK', 'CARD', 'CREDIT', 'ORIGINAL_METHOD');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') THEN
  CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerEntryType') THEN
  CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'DEBIT', 'PREPAYMENT_ADDED', 'PREPAYMENT_USED', 'PREPAYMENT_WITHDRAW', 'PREPAYMENT_RESTORED');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierLedgerType') THEN
  CREATE TYPE "SupplierLedgerType" AS ENUM ('PURCHASE', 'PAYMENT', 'RETURN', 'ADJUSTMENT');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpensePaymentMethod') THEN
  CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK', 'CARD', 'CHEQUE', 'OTHER');
END IF; END $$;

-- ---------------------------------------------------------------------------
-- 2. Tables that only ever existed as db-push drift
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "reference_no" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supplier_ledger_entries" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "entryType" "SupplierLedgerType" NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "balance_after" DECIMAL(19,2) NOT NULL,
    "description" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cash_register_shifts" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift_number" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_cash" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "closing_cash" DECIMAL(19,2),
    "expected_cash" DECIMAL(19,2),
    "cash_difference" DECIMAL(19,2),
    "total_sales" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "total_expenses" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "total_refunds" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cash_register_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tax_categories" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "cgst" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "igst" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_categories_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. Missing columns on existing tables
-- ---------------------------------------------------------------------------

ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(19,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "discount_type" "DiscountType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(19,2) NOT NULL DEFAULT 0;
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "discount_type" "DiscountType" NOT NULL DEFAULT 'FIXED';
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "shift_id" TEXT;

ALTER TABLE "stock_history" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "total_due" DECIMAL(19,2) NOT NULL DEFAULT 0;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "total_paid" DECIMAL(19,2) NOT NULL DEFAULT 0;

-- Note: users.session_version is intentionally created by the hardening
-- migration (20261011) itself, which runs after this one on fresh databases.

-- ---------------------------------------------------------------------------
-- 4. TEXT -> enum column migrations (drifted via db push on production).
--    Guarded so already-converted production columns are untouched; the old
--    TEXT defaults ('Cash', 'Paid', ...) would otherwise break the cast.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sales'
               AND column_name = 'status' AND udt_name <> 'SaleStatus') THEN
    ALTER TABLE "sales" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "sales" ALTER COLUMN "status" TYPE "SaleStatus" USING "status"::"SaleStatus";
    ALTER TABLE "sales" ALTER COLUMN "status" SET DEFAULT 'COMPLETED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sales'
               AND column_name = 'payment_method' AND udt_name <> 'PaymentMethod') THEN
    ALTER TABLE "sales" ALTER COLUMN "payment_method" DROP DEFAULT;
    ALTER TABLE "sales" ALTER COLUMN "payment_method" TYPE "PaymentMethod" USING "payment_method"::"PaymentMethod";
    ALTER TABLE "sales" ALTER COLUMN "payment_method" SET DEFAULT 'CASH';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sales'
               AND column_name = 'payment_status' AND udt_name <> 'PaymentStatus') THEN
    ALTER TABLE "sales" ALTER COLUMN "payment_status" DROP DEFAULT;
    ALTER TABLE "sales" ALTER COLUMN "payment_status" TYPE "PaymentStatus" USING "payment_status"::"PaymentStatus";
    ALTER TABLE "sales" ALTER COLUMN "payment_status" SET DEFAULT 'PAID';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'purchases'
               AND column_name = 'payment_status' AND udt_name <> 'PurchasePaymentStatus') THEN
    ALTER TABLE "purchases" ALTER COLUMN "payment_status" DROP DEFAULT;
    ALTER TABLE "purchases" ALTER COLUMN "payment_status" TYPE "PurchasePaymentStatus" USING "payment_status"::"PurchasePaymentStatus";
    ALTER TABLE "purchases" ALTER COLUMN "payment_status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'purchases'
               AND column_name = 'delivery_status' AND udt_name <> 'PurchaseDeliveryStatus') THEN
    ALTER TABLE "purchases" ALTER COLUMN "delivery_status" DROP DEFAULT;
    ALTER TABLE "purchases" ALTER COLUMN "delivery_status" TYPE "PurchaseDeliveryStatus" USING "delivery_status"::"PurchaseDeliveryStatus";
    ALTER TABLE "purchases" ALTER COLUMN "delivery_status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'purchases'
               AND column_name = 'payment_method' AND udt_name <> 'PaymentMethod') THEN
    ALTER TABLE "purchases" ALTER COLUMN "payment_method" DROP DEFAULT;
    ALTER TABLE "purchases" ALTER COLUMN "payment_method" TYPE "PaymentMethod" USING "payment_method"::"PaymentMethod";
    ALTER TABLE "purchases" ALTER COLUMN "payment_method" SET DEFAULT 'CASH';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'expenses'
               AND column_name = 'payment_method' AND udt_name <> 'ExpensePaymentMethod') THEN
    ALTER TABLE "expenses" ALTER COLUMN "payment_method" DROP DEFAULT;
    ALTER TABLE "expenses" ALTER COLUMN "payment_method" TYPE "ExpensePaymentMethod" USING "payment_method"::"ExpensePaymentMethod";
    ALTER TABLE "expenses" ALTER COLUMN "payment_method" SET DEFAULT 'CASH';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'sale_returns'
               AND column_name = 'refund_method' AND udt_name <> 'RefundMethod') THEN
    ALTER TABLE "sale_returns" ALTER COLUMN "refund_method" DROP DEFAULT;
    ALTER TABLE "sale_returns" ALTER COLUMN "refund_method" TYPE "RefundMethod" USING "refund_method"::"RefundMethod";
    ALTER TABLE "sale_returns" ALTER COLUMN "refund_method" SET DEFAULT 'CASH';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'ledger_entries'
               AND column_name = 'entryType' AND udt_name <> 'LedgerEntryType') THEN
    ALTER TABLE "ledger_entries" ALTER COLUMN "entryType" TYPE "LedgerEntryType" USING "entryType"::"LedgerEntryType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'stock_history'
               AND column_name = 'changeType' AND udt_name <> 'StockChangeType') THEN
    ALTER TABLE "stock_history" ALTER COLUMN "changeType" TYPE "StockChangeType" USING "changeType"::"StockChangeType";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Drop defaults that schema.prisma no longer declares (idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE "businesses" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "role_permissions" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "sync_queue" ALTER COLUMN "payload" DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 6. Missing indexes (the two 20261011-hardening indexes and the
--    sale_return_items_product_id_idx are created by that migration itself)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "payments_sale_id_idx" ON "payments"("sale_id");
CREATE INDEX IF NOT EXISTS "payments_business_id_idx" ON "payments"("business_id");
CREATE INDEX IF NOT EXISTS "payments_business_id_method_idx" ON "payments"("business_id", "method");

CREATE INDEX IF NOT EXISTS "supplier_ledger_entries_business_id_idx" ON "supplier_ledger_entries"("business_id");
CREATE INDEX IF NOT EXISTS "supplier_ledger_entries_business_id_supplier_id_idx" ON "supplier_ledger_entries"("business_id", "supplier_id");
CREATE INDEX IF NOT EXISTS "supplier_ledger_entries_business_id_supplier_id_created_at_idx" ON "supplier_ledger_entries"("business_id", "supplier_id", "created_at");

CREATE INDEX IF NOT EXISTS "cash_register_shifts_business_id_idx" ON "cash_register_shifts"("business_id");
CREATE INDEX IF NOT EXISTS "cash_register_shifts_business_id_user_id_idx" ON "cash_register_shifts"("business_id", "user_id");
CREATE INDEX IF NOT EXISTS "cash_register_shifts_business_id_is_active_idx" ON "cash_register_shifts"("business_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "cash_register_shifts_business_id_shift_number_key" ON "cash_register_shifts"("business_id", "shift_number");

CREATE INDEX IF NOT EXISTS "tax_categories_business_id_idx" ON "tax_categories"("business_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tax_categories_business_id_name_key" ON "tax_categories"("business_id", "name");

CREATE INDEX IF NOT EXISTS "ledger_entries_business_id_customer_id_entryType_created_at_idx" ON "ledger_entries"("business_id", "customer_id", "entryType", "created_at");
CREATE INDEX IF NOT EXISTS "sales_business_id_status_idx" ON "sales"("business_id", "status");
CREATE INDEX IF NOT EXISTS "sales_business_id_created_at_status_idx" ON "sales"("business_id", "created_at", "status");
CREATE INDEX IF NOT EXISTS "stock_history_business_id_product_id_created_at_idx" ON "stock_history"("business_id", "product_id", "created_at");

-- ---------------------------------------------------------------------------
-- 7. Foreign keys on the new tables (+ sales.shift_id). The three FKs that
--    the hardening migration itself adds (payments_business_id_fkey,
--    tax_categories_business_id_fkey, sale_return_items_product_id_fkey)
--    are left to it.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_shift_id_fkey') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey"
      FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_sale_id_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_ledger_entries_business_id_fkey') THEN
    ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_ledger_entries_supplier_id_fkey') THEN
    ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_shifts_business_id_fkey') THEN
    ALTER TABLE "cash_register_shifts" ADD CONSTRAINT "cash_register_shifts_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_shifts_user_id_fkey') THEN
    ALTER TABLE "cash_register_shifts" ADD CONSTRAINT "cash_register_shifts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;