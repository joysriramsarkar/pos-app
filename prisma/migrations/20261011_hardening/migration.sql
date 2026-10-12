-- MP-16/17/18/19 hardening migration (authored by hand; apply with `prisma migrate deploy` in staging first).
-- Pre-validated read-only on production data (2026-10-11, scripts/validate-migration-readiness.ts):
--   * 0 orphan sale_return_items / stock_history / tax_categories; 0 cross-tenant payment/sale_return refs
--   * 0 duplicate open shifts per (business, user)
--   * 1 legacy customer with total_due = -6 (clamped below; app already clamps new writes at >= 0)
--   * 133 products with buying_price scale > 2 (float noise, max |diff| 0.005; rounded below)
--   * 7 rows with quantity scale > 6 (float noise, e.g. 9.300000000000001; rounded below)

-- ---------------------------------------------------------------------------
-- 0. Legacy data repairs (transparent, match current app policy)
-- ---------------------------------------------------------------------------

-- Single legacy overpayment row (customer "কাদের আলি"): app clamps new due at >= 0.
UPDATE "customers" SET "total_due" = 0 WHERE "total_due" < 0;

-- Float-noise cleanup before tightening precision.
UPDATE "products" SET "buying_price" = ROUND("buying_price", 2) WHERE "buying_price" <> ROUND("buying_price", 2);
UPDATE "products" SET "selling_price" = ROUND("selling_price", 2) WHERE "selling_price" <> ROUND("selling_price", 2);
UPDATE "products" SET "current_stock" = ROUND("current_stock", 6) WHERE "current_stock" <> ROUND("current_stock", 6);
UPDATE "sale_items" SET "quantity" = ROUND("quantity", 6) WHERE "quantity" <> ROUND("quantity", 6);
UPDATE "stock_history" SET "quantity" = ROUND("quantity", 6) WHERE "quantity" <> ROUND("quantity", 6);

-- ---------------------------------------------------------------------------
-- 1. Explicit numeric precision: money (19,2), quantity (19,6), rate (7,4)
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ALTER COLUMN "buying_price" TYPE NUMERIC(19,2) USING ROUND("buying_price", 2);
ALTER TABLE "products" ALTER COLUMN "selling_price" TYPE NUMERIC(19,2) USING ROUND("selling_price", 2);
ALTER TABLE "products" ALTER COLUMN "current_stock" TYPE NUMERIC(19,6) USING ROUND("current_stock", 6);
ALTER TABLE "products" ALTER COLUMN "min_stock_level" TYPE NUMERIC(19,6) USING ROUND("min_stock_level", 6);

ALTER TABLE "customers" ALTER COLUMN "total_due" TYPE NUMERIC(19,2) USING ROUND("total_due", 2);
ALTER TABLE "customers" ALTER COLUMN "total_paid" TYPE NUMERIC(19,2) USING ROUND("total_paid", 2);
ALTER TABLE "customers" ALTER COLUMN "prepaid_balance" TYPE NUMERIC(19,2) USING ROUND("prepaid_balance", 2);

ALTER TABLE "ledger_entries" ALTER COLUMN "amount" TYPE NUMERIC(19,2) USING ROUND("amount", 2);
ALTER TABLE "ledger_entries" ALTER COLUMN "balance_after" TYPE NUMERIC(19,2) USING ROUND("balance_after", 2);

ALTER TABLE "sales" ALTER COLUMN "subtotal" TYPE NUMERIC(19,2) USING ROUND("subtotal", 2);
ALTER TABLE "sales" ALTER COLUMN "discount" TYPE NUMERIC(19,2) USING ROUND("discount", 2);
ALTER TABLE "sales" ALTER COLUMN "tax" TYPE NUMERIC(19,2) USING ROUND("tax", 2);
ALTER TABLE "sales" ALTER COLUMN "total_amount" TYPE NUMERIC(19,2) USING ROUND("total_amount", 2);
ALTER TABLE "sales" ALTER COLUMN "amount_paid" TYPE NUMERIC(19,2) USING ROUND("amount_paid", 2);
ALTER TABLE "sales" ALTER COLUMN "cash_amount" TYPE NUMERIC(19,2) USING ROUND("cash_amount", 2);
ALTER TABLE "sales" ALTER COLUMN "upi_amount" TYPE NUMERIC(19,2) USING ROUND("upi_amount", 2);

ALTER TABLE "sale_items" ALTER COLUMN "quantity" TYPE NUMERIC(19,6) USING ROUND("quantity", 6);
ALTER TABLE "sale_items" ALTER COLUMN "unit_price" TYPE NUMERIC(19,6) USING ROUND("unit_price", 6);
ALTER TABLE "sale_items" ALTER COLUMN "cost_price_at_sale" TYPE NUMERIC(19,6) USING ROUND("cost_price_at_sale", 6);
ALTER TABLE "sale_items" ALTER COLUMN "discount" TYPE NUMERIC(19,2) USING ROUND("discount", 2);
ALTER TABLE "sale_items" ALTER COLUMN "total_price" TYPE NUMERIC(19,2) USING ROUND("total_price", 2);
ALTER TABLE "sale_items" ALTER COLUMN "tax_rate" TYPE NUMERIC(7,4) USING ROUND("tax_rate", 4);
ALTER TABLE "sale_items" ALTER COLUMN "tax_amount" TYPE NUMERIC(19,2) USING ROUND("tax_amount", 2);

ALTER TABLE "payments" ALTER COLUMN "amount" TYPE NUMERIC(19,2) USING ROUND("amount", 2);
ALTER TABLE "sale_returns" ALTER COLUMN "refund_amount" TYPE NUMERIC(19,2) USING ROUND("refund_amount", 2);

ALTER TABLE "sale_return_items" ALTER COLUMN "quantity" TYPE NUMERIC(19,6) USING ROUND("quantity", 6);
ALTER TABLE "sale_return_items" ALTER COLUMN "unit_price" TYPE NUMERIC(19,6) USING ROUND("unit_price", 6);
ALTER TABLE "sale_return_items" ALTER COLUMN "total_price" TYPE NUMERIC(19,2) USING ROUND("total_price", 2);

ALTER TABLE "suppliers" ALTER COLUMN "total_due" TYPE NUMERIC(19,2) USING ROUND("total_due", 2);
ALTER TABLE "suppliers" ALTER COLUMN "total_paid" TYPE NUMERIC(19,2) USING ROUND("total_paid", 2);

ALTER TABLE "supplier_ledger_entries" ALTER COLUMN "amount" TYPE NUMERIC(19,2) USING ROUND("amount", 2);
ALTER TABLE "supplier_ledger_entries" ALTER COLUMN "balance_after" TYPE NUMERIC(19,2) USING ROUND("balance_after", 2);

ALTER TABLE "purchases" ALTER COLUMN "total_amount" TYPE NUMERIC(19,2) USING ROUND("total_amount", 2);
ALTER TABLE "purchases" ALTER COLUMN "paid_amount" TYPE NUMERIC(19,2) USING ROUND("paid_amount", 2);

ALTER TABLE "purchase_items" ALTER COLUMN "quantity" TYPE NUMERIC(19,6) USING ROUND("quantity", 6);
ALTER TABLE "purchase_items" ALTER COLUMN "received_qty" TYPE NUMERIC(19,6) USING ROUND("received_qty", 6);
ALTER TABLE "purchase_items" ALTER COLUMN "buying_price" TYPE NUMERIC(19,6) USING ROUND("buying_price", 6);
ALTER TABLE "purchase_items" ALTER COLUMN "total_price" TYPE NUMERIC(19,2) USING ROUND("total_price", 2);

ALTER TABLE "stock_history" ALTER COLUMN "quantity" TYPE NUMERIC(19,6) USING ROUND("quantity", 6);
ALTER TABLE "product_popularity" ALTER COLUMN "total_revenue" TYPE NUMERIC(19,2) USING ROUND("total_revenue", 2);
ALTER TABLE "expenses" ALTER COLUMN "amount" TYPE NUMERIC(19,2) USING ROUND("amount", 2);

ALTER TABLE "daily_manual_records" ALTER COLUMN "sales" TYPE NUMERIC(19,2) USING ROUND("sales", 2);
ALTER TABLE "daily_manual_records" ALTER COLUMN "expenses" TYPE NUMERIC(19,2) USING ROUND("expenses", 2);
ALTER TABLE "daily_manual_records" ALTER COLUMN "profit" TYPE NUMERIC(19,2) USING ROUND("profit", 2);

ALTER TABLE "cash_register_shifts" ALTER COLUMN "opening_cash" TYPE NUMERIC(19,2) USING ROUND("opening_cash", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "closing_cash" TYPE NUMERIC(19,2) USING ROUND("closing_cash", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "expected_cash" TYPE NUMERIC(19,2) USING ROUND("expected_cash", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "cash_difference" TYPE NUMERIC(19,2) USING ROUND("cash_difference", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "total_sales" TYPE NUMERIC(19,2) USING ROUND("total_sales", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "total_expenses" TYPE NUMERIC(19,2) USING ROUND("total_expenses", 2);
ALTER TABLE "cash_register_shifts" ALTER COLUMN "total_refunds" TYPE NUMERIC(19,2) USING ROUND("total_refunds", 2);

ALTER TABLE "tax_categories" ALTER COLUMN "rate" TYPE NUMERIC(7,4) USING ROUND("rate", 4);
ALTER TABLE "tax_categories" ALTER COLUMN "cgst" TYPE NUMERIC(7,4) USING ROUND("cgst", 4);
ALTER TABLE "tax_categories" ALTER COLUMN "sgst" TYPE NUMERIC(7,4) USING ROUND("sgst", 4);
ALTER TABLE "tax_categories" ALTER COLUMN "igst" TYPE NUMERIC(7,4) USING ROUND("igst", 4);

-- ---------------------------------------------------------------------------
-- 2. Session revocation (MP-07)
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Missing tenant relations (MP-17): Payment.business, TaxCategory.business,
--    SaleReturnItem.product (0 orphans / 0 mismatches verified pre-migration)
-- ---------------------------------------------------------------------------

-- Idempotent: "payments_business_id_fkey" already exists on some databases
-- (historical db-push drift with identical definition) — skip if present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_business_id_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_categories_business_id_fkey') THEN
    ALTER TABLE "tax_categories" ADD CONSTRAINT "tax_categories_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_return_items_product_id_fkey') THEN
    ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "sale_return_items_product_id_idx" ON "sale_return_items"("product_id");

-- ---------------------------------------------------------------------------
-- 4. Non-negative / range invariants (MP-19)
--    NOTE: products.current_stock intentionally unconstrained — offline
--    auto-adjust policy permits negative stock by design (MP-39/H2).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_selling_price_nonnegative') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_selling_price_nonnegative" CHECK ("selling_price" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_buying_price_nonnegative') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_buying_price_nonnegative" CHECK ("buying_price" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_total_due_nonnegative') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_total_due_nonnegative" CHECK ("total_due" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_total_paid_nonnegative') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_total_paid_nonnegative" CHECK ("total_paid" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_prepaid_nonnegative') THEN
    ALTER TABLE "customers" ADD CONSTRAINT "customers_prepaid_nonnegative" CHECK ("prepaid_balance" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_subtotal_nonnegative') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_subtotal_nonnegative" CHECK ("subtotal" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_discount_nonnegative') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_nonnegative" CHECK ("discount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tax_nonnegative') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_tax_nonnegative" CHECK ("tax" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_total_nonnegative') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_total_nonnegative" CHECK ("total_amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_paid_nonnegative') THEN
    ALTER TABLE "sales" ADD CONSTRAINT "sales_paid_nonnegative" CHECK ("amount_paid" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_qty_positive') THEN
    ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_qty_positive" CHECK ("quantity" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_unit_nonnegative') THEN
    ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_nonnegative" CHECK ("unit_price" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_total_nonnegative') THEN
    ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_total_nonnegative" CHECK ("total_price" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_discount_nonnegative') THEN
    ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_discount_nonnegative" CHECK ("discount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_tax_rate_range') THEN
    ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tax_rate_range" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonnegative') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonnegative" CHECK ("amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_returns_refund_nonnegative') THEN
    ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_refund_nonnegative" CHECK ("refund_amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_return_items_qty_positive') THEN
    ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_qty_positive" CHECK ("quantity" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_return_items_total_nonnegative') THEN
    ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_total_nonnegative" CHECK ("total_price" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_due_nonnegative') THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_due_nonnegative" CHECK ("total_due" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_paid_nonnegative') THEN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_paid_nonnegative" CHECK ("total_paid" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_total_nonnegative') THEN
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_nonnegative" CHECK ("total_amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_paid_nonnegative') THEN
    ALTER TABLE "purchases" ADD CONSTRAINT "purchases_paid_nonnegative" CHECK ("paid_amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_qty_positive') THEN
    ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_qty_positive" CHECK ("quantity" > 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_received_nonnegative') THEN
    ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_received_nonnegative" CHECK ("received_qty" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_nonnegative') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_nonnegative" CHECK ("amount" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_amount_nonnegative') THEN
    ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_nonnegative" CHECK ("amount" >= 0);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_ledger_amount_nonnegative') THEN
    ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_amount_nonnegative" CHECK ("amount" >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. One open shift per (business, user) (MP-18) + sync queue lookup index
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "one_open_shift_per_user_business"
  ON "cash_register_shifts" ("business_id", "user_id") WHERE "is_active" = true;

CREATE INDEX IF NOT EXISTS "sync_queue_business_id_synced_idx"
  ON "sync_queue" ("business_id", "synced");
