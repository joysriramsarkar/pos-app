-- ============================================================================
-- PostgreSQL Row Level Security (RLS) for Multi-Tenant POS
-- ============================================================================
--
-- IMPORTANT: This script must be run as a PostgreSQL superuser or the
-- database owner. It should NOT be applied via Prisma migrate because
-- Prisma uses the same role for all queries; instead apply it once via
-- a migration script or directly in your database.
--
-- HOW IT WORKS:
--   1. Before each query, the application sets:
--        SET LOCAL app.current_business_id = '<uuid>';
--      inside a transaction.
--   2. PostgreSQL RLS policies enforce that every row returned or modified
--      matches current_setting('app.current_business_id').
--   3. The `anon_role` (used by app connections) is subject to RLS.
--      The `service_role` (Supabase admin) bypasses RLS — do NOT use
--      service_role in the request path.
--
-- WHEN TO APPLY:
--   Run this script once after the schema migration is applied and data
--   has been backfilled with business_id values.
--
-- TESTING:
--   After applying, run:
--     SET app.current_business_id = '<biz_a_id>';
--     SELECT count(*) FROM products; -- should only return biz_a products
-- ============================================================================

-- Helper function: safely get current business ID, returns NULL if not set
CREATE OR REPLACE FUNCTION app_current_business_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_business_id', TRUE), '');
$$;

-- ============================================================================
-- PRODUCTS
-- ============================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_tenant_isolation ON products;
CREATE POLICY products_tenant_isolation ON products
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- CATEGORIES
-- ============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_tenant_isolation ON categories;
CREATE POLICY categories_tenant_isolation ON categories
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
CREATE POLICY customers_tenant_isolation ON customers
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- LEDGER ENTRIES
-- ============================================================================
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_entries_tenant_isolation ON ledger_entries;
CREATE POLICY ledger_entries_tenant_isolation ON ledger_entries
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- SUPPLIERS
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_tenant_isolation ON suppliers;
CREATE POLICY suppliers_tenant_isolation ON suppliers
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- SALES
-- ============================================================================
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_tenant_isolation ON sales;
CREATE POLICY sales_tenant_isolation ON sales
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- SALE RETURNS
-- ============================================================================
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_returns_tenant_isolation ON sale_returns;
CREATE POLICY sale_returns_tenant_isolation ON sale_returns
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- PURCHASES
-- ============================================================================
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchases_tenant_isolation ON purchases;
CREATE POLICY purchases_tenant_isolation ON purchases
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- STOCK HISTORY
-- ============================================================================
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_history_tenant_isolation ON stock_history;
CREATE POLICY stock_history_tenant_isolation ON stock_history
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- EXPENSES
-- ============================================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_tenant_isolation ON expenses;
CREATE POLICY expenses_tenant_isolation ON expenses
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- BUSINESS SETTINGS
-- ============================================================================
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_settings_tenant_isolation ON business_settings;
CREATE POLICY business_settings_tenant_isolation ON business_settings
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- SYNC QUEUE (nullable business_id — allow NULLs through for system records)
-- ============================================================================
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_queue_tenant_isolation ON sync_queue;
CREATE POLICY sync_queue_tenant_isolation ON sync_queue
  FOR ALL
  USING (
    business_id IS NULL OR
    business_id = app_current_business_id()
  )
  WITH CHECK (
    business_id IS NULL OR
    business_id = app_current_business_id()
  );

-- ============================================================================
-- AUDIT LOGS (nullable business_id — system-level events have NULL)
-- ============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  FOR ALL
  USING (
    business_id IS NULL OR
    business_id = app_current_business_id()
  )
  WITH CHECK (
    business_id IS NULL OR
    business_id = app_current_business_id()
  );

-- ============================================================================
-- DAILY MANUAL RECORDS
-- ============================================================================
ALTER TABLE daily_manual_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_manual_records_tenant_isolation ON daily_manual_records;
CREATE POLICY daily_manual_records_tenant_isolation ON daily_manual_records
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- PRODUCT POPULARITY
-- ============================================================================
ALTER TABLE product_popularity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_popularity_tenant_isolation ON product_popularity;
CREATE POLICY product_popularity_tenant_isolation ON product_popularity
  FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());

-- ============================================================================
-- NOTE: The following tables are NOT tenant-scoped (global):
--   users          — global identity table
--   memberships    — cross-business join table (app filters by userId)
--   businesses     — tenant registry (app filters by membership)
--   settings       — system-level defaults
--   permissions    — static permission catalog
--   role_permissions — static RBAC mapping
--   sale_items     — joined via sales (already tenant-isolated through sales)
--   sale_return_items — joined via sale_returns
--   purchase_items — joined via purchases
-- ============================================================================

-- Verification query (run after applying):
-- SET app.current_business_id = '<your-biz-id>';
-- SELECT tablename, rowsecurity, forcerolusecurity FROM pg_tables
--   JOIN pg_class ON pg_tables.tablename = pg_class.relname
--   WHERE pg_tables.schemaname = 'public'
--   AND pg_class.relrowsecurity = true;
