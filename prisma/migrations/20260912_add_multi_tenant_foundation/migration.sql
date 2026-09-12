-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'VIEWER');

-- DropIndex
DROP INDEX "categories_name_key";

-- DropIndex
DROP INDEX "customers_phone_idx";

-- DropIndex
DROP INDEX "customers_phone_key";

-- DropIndex
DROP INDEX "customers_prepaid_balance_idx";

-- DropIndex
DROP INDEX "ledger_entries_customer_id_idx";

-- DropIndex
DROP INDEX "products_barcode_key";

-- DropIndex
DROP INDEX "purchases_supplier_id_idx";

-- DropIndex
DROP INDEX "sales_created_at_idx";

-- DropIndex
DROP INDEX "sales_customer_id_idx";

-- DropIndex
DROP INDEX "sales_invoice_number_key";

-- DropIndex
DROP INDEX "sales_status_idx";

-- DropIndex
DROP INDEX "sales_user_id_idx";

-- DropIndex
DROP INDEX "stock_history_product_id_idx";

-- DropIndex
DROP INDEX "sync_queue_entity_type_entity_id_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "business_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "name_en" TEXT,
ALTER COLUMN "total_due" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total_paid" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "prepaid_balance" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'Cash',
ADD COLUMN     "supplier_id" TEXT,
ADD COLUMN     "supplier_name" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "business_id" TEXT NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "balance_after" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "sub_category" TEXT DEFAULT '',
ALTER COLUMN "buying_price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "selling_price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "current_stock" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "min_stock_level" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "purchase_items" ADD COLUMN     "received_qty" DECIMAL(65,30) NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "buying_price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "delivery_status" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'Cash',
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "role_permissions" DROP COLUMN "role",
ADD COLUMN     "role" "BusinessRole" NOT NULL;

-- AlterTable
ALTER TABLE "sale_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total_price" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "cash_amount" DECIMAL(65,30),
ADD COLUMN     "upi_amount" DECIMAL(65,30),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "discount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "amount_paid" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "stock_history" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "purchase_id" TEXT,
ADD COLUMN     "sale_id" TEXT,
ADD COLUMN     "sale_return_id" TEXT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "business_id" TEXT NOT NULL,
ADD COLUMN     "name_en" TEXT;

-- AlterTable
ALTER TABLE "sync_queue" ADD COLUMN     "business_id" TEXT,
ADD COLUMN     "user_id" TEXT,
ALTER COLUMN "entity_id" DROP NOT NULL,
DROP COLUMN "payload",
ADD COLUMN     "payload" JSONB NOT NULL,
ALTER COLUMN "idempotency_key" SET NOT NULL,
DROP COLUMN "result",
ADD COLUMN     "result" JSONB;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password",
DROP COLUMN "role",
ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT NOT NULL,
ADD COLUMN     "requires_password_change" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "name" SET NOT NULL;

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "businesses" (
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'CASHIER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_popularity" (
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

-- CreateTable
CREATE TABLE "sale_returns" (
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

-- CreateTable
CREATE TABLE "sale_return_items" (
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

-- CreateTable
CREATE TABLE "audit_logs" (
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

-- CreateTable
CREATE TABLE "daily_manual_records" (
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

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_business_id_idx" ON "memberships"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_business_id_key" ON "memberships"("user_id", "business_id");

-- CreateIndex
CREATE INDEX "business_settings_business_id_idx" ON "business_settings"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_settings_business_id_key_key" ON "business_settings"("business_id", "key");

-- CreateIndex
CREATE INDEX "product_popularity_business_id_idx" ON "product_popularity"("business_id");

-- CreateIndex
CREATE INDEX "product_popularity_business_id_monthly_sales_count_idx" ON "product_popularity"("business_id", "monthly_sales_count");

-- CreateIndex
CREATE INDEX "product_popularity_business_id_weekly_sales_count_idx" ON "product_popularity"("business_id", "weekly_sales_count");

-- CreateIndex
CREATE UNIQUE INDEX "product_popularity_product_id_period_start_key" ON "product_popularity"("product_id", "period_start");

-- CreateIndex
CREATE INDEX "sale_returns_business_id_idx" ON "sale_returns"("business_id");

-- CreateIndex
CREATE INDEX "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");

-- CreateIndex
CREATE INDEX "sale_returns_created_at_idx" ON "sale_returns"("created_at");

-- CreateIndex
CREATE INDEX "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");

-- CreateIndex
CREATE INDEX "sale_return_items_sale_item_id_idx" ON "sale_return_items"("sale_item_id");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_idx" ON "audit_logs"("business_id");

-- CreateIndex
CREATE INDEX "audit_logs_business_id_created_at_idx" ON "audit_logs"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "daily_manual_records_business_id_idx" ON "daily_manual_records"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_manual_records_business_id_date_key" ON "daily_manual_records"("business_id", "date");

-- CreateIndex
CREATE INDEX "categories_business_id_idx" ON "categories"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_business_id_name_key" ON "categories"("business_id", "name");

-- CreateIndex
CREATE INDEX "customers_business_id_idx" ON "customers"("business_id");

-- CreateIndex
CREATE INDEX "customers_business_id_phone_idx" ON "customers"("business_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_business_id_phone_key" ON "customers"("business_id", "phone");

-- CreateIndex
CREATE INDEX "expenses_business_id_idx" ON "expenses"("business_id");

-- CreateIndex
CREATE INDEX "expenses_business_id_date_idx" ON "expenses"("business_id", "date");

-- CreateIndex
CREATE INDEX "expenses_business_id_supplier_id_idx" ON "expenses"("business_id", "supplier_id");

-- CreateIndex
CREATE INDEX "ledger_entries_business_id_idx" ON "ledger_entries"("business_id");

-- CreateIndex
CREATE INDEX "ledger_entries_business_id_customer_id_idx" ON "ledger_entries"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "ledger_entries_business_id_customer_id_created_at_idx" ON "ledger_entries"("business_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_business_id_customer_id_entryType_created_at_idx" ON "ledger_entries"("business_id", "customer_id", "entryType", "created_at");

-- CreateIndex
CREATE INDEX "products_business_id_idx" ON "products"("business_id");

-- CreateIndex
CREATE INDEX "products_business_id_is_active_idx" ON "products"("business_id", "is_active");

-- CreateIndex
CREATE INDEX "products_business_id_category_is_active_idx" ON "products"("business_id", "category", "is_active");

-- CreateIndex
CREATE INDEX "products_business_id_category_is_active_name_idx" ON "products"("business_id", "category", "is_active", "name");

-- CreateIndex
CREATE INDEX "products_business_id_name_idx" ON "products"("business_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_business_id_barcode_key" ON "products"("business_id", "barcode");

-- CreateIndex
CREATE INDEX "purchases_business_id_idx" ON "purchases"("business_id");

-- CreateIndex
CREATE INDEX "purchases_business_id_supplier_id_idx" ON "purchases"("business_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_business_id_invoice_number_key" ON "purchases"("business_id", "invoice_number");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

-- CreateIndex
CREATE INDEX "sales_business_id_idx" ON "sales"("business_id");

-- CreateIndex
CREATE INDEX "sales_business_id_customer_id_idx" ON "sales"("business_id", "customer_id");

-- CreateIndex
CREATE INDEX "sales_business_id_user_id_idx" ON "sales"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "sales_business_id_created_at_idx" ON "sales"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_business_id_status_idx" ON "sales"("business_id", "status");

-- CreateIndex
CREATE INDEX "sales_business_id_created_at_status_idx" ON "sales"("business_id", "created_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_business_id_invoice_number_key" ON "sales"("business_id", "invoice_number");

-- CreateIndex
CREATE INDEX "stock_history_business_id_idx" ON "stock_history"("business_id");

-- CreateIndex
CREATE INDEX "stock_history_business_id_product_id_idx" ON "stock_history"("business_id", "product_id");

-- CreateIndex
CREATE INDEX "suppliers_business_id_idx" ON "suppliers"("business_id");

-- CreateIndex
CREATE INDEX "sync_queue_business_id_idx" ON "sync_queue"("business_id");

-- CreateIndex
CREATE INDEX "sync_queue_idempotency_key_idx" ON "sync_queue"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_popularity" ADD CONSTRAINT "product_popularity_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_popularity" ADD CONSTRAINT "product_popularity_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_manual_records" ADD CONSTRAINT "daily_manual_records_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
