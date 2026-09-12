-- ============================================================================
-- PostgreSQL Row-Level Security (RLS) Policies for Multi-Tenant POS SaaS
-- ============================================================================
-- These policies enforce tenant data isolation at the database layer.
-- Even if an application query omits the businessId filter, Postgres
-- will restrict rows to the session's active business:
--   SET LOCAL app.current_business_id = '<business_id>';
--
-- If app.current_business_id is not set (NULL), queries on RLS-enforced
-- tables return 0 rows for unprivileged connections.
-- ============================================================================

-- Helper function to get current business ID safely (returns NULL if unset)
CREATE OR REPLACE FUNCTION get_current_business_id() RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_business_id', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- 1. Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_tenant_isolation ON products;
CREATE POLICY products_tenant_isolation ON products
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 2. Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_tenant_isolation ON categories;
CREATE POLICY categories_tenant_isolation ON categories
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 3. Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_tenant_isolation ON customers;
CREATE POLICY customers_tenant_isolation ON customers
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 4. Suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_tenant_isolation ON suppliers;
CREATE POLICY suppliers_tenant_isolation ON suppliers
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 5. Sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_tenant_isolation ON sales;
CREATE POLICY sales_tenant_isolation ON sales
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 6. Sale Items (Scoped through Sale)
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_items_tenant_isolation ON sale_items;
CREATE POLICY sale_items_tenant_isolation ON sale_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.business_id = get_current_business_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.business_id = get_current_business_id()
  ));

-- 7. Sale Returns
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_returns_tenant_isolation ON sale_returns;
CREATE POLICY sale_returns_tenant_isolation ON sale_returns
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 8. Sale Return Items (Scoped through SaleReturn)
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_return_items_tenant_isolation ON sale_return_items;
CREATE POLICY sale_return_items_tenant_isolation ON sale_return_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM sale_returns WHERE sale_returns.id = sale_return_items.sale_return_id AND sale_returns.business_id = get_current_business_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sale_returns WHERE sale_returns.id = sale_return_items.sale_return_id AND sale_returns.business_id = get_current_business_id()
  ));

-- 9. Purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchases_tenant_isolation ON purchases;
CREATE POLICY purchases_tenant_isolation ON purchases
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 10. Purchase Items (Scoped through Purchase)
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_items_tenant_isolation ON purchase_items;
CREATE POLICY purchase_items_tenant_isolation ON purchase_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.business_id = get_current_business_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.business_id = get_current_business_id()
  ));

-- 11. Expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expenses_tenant_isolation ON expenses;
CREATE POLICY expenses_tenant_isolation ON expenses
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 12. Stock History
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_history_tenant_isolation ON stock_history;
CREATE POLICY stock_history_tenant_isolation ON stock_history
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 13. Ledger Entries
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_entries_tenant_isolation ON ledger_entries;
CREATE POLICY ledger_entries_tenant_isolation ON ledger_entries
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 14. Business Settings
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_settings_tenant_isolation ON business_settings;
CREATE POLICY business_settings_tenant_isolation ON business_settings
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 15. Audit Logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 16. Sync Queues
ALTER TABLE sync_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_queues_tenant_isolation ON sync_queues;
CREATE POLICY sync_queues_tenant_isolation ON sync_queues
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 17. Daily Manual Records
ALTER TABLE daily_manual_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_manual_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_manual_records_tenant_isolation ON daily_manual_records;
CREATE POLICY daily_manual_records_tenant_isolation ON daily_manual_records
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 18. Product Popularity
ALTER TABLE product_popularity ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_popularity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_popularity_tenant_isolation ON product_popularity;
CREATE POLICY product_popularity_tenant_isolation ON product_popularity
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

-- 19. Memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;
CREATE POLICY memberships_tenant_isolation ON memberships
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());
