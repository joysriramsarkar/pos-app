-- MP-13/H3: extend RLS coverage to the remaining tenant tables.
-- 20260913_enable_rls covered 19 tables; these 4 were missed:
-- payments, supplier_ledger_entries, cash_register_shifts, tax_categories.
-- Safe for the app: the runtime role has BYPASSRLS (verified 2026-10-11),
-- so policies are defense-in-depth for non-bypass roles only (Path B:
-- application-level isolation stays authoritative).

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
CREATE POLICY payments_tenant_isolation ON payments
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_ledger_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_ledger_entries_tenant_isolation ON supplier_ledger_entries;
CREATE POLICY supplier_ledger_entries_tenant_isolation ON supplier_ledger_entries
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

ALTER TABLE cash_register_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_register_shifts_tenant_isolation ON cash_register_shifts;
CREATE POLICY cash_register_shifts_tenant_isolation ON cash_register_shifts
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());

ALTER TABLE tax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_categories_tenant_isolation ON tax_categories;
CREATE POLICY tax_categories_tenant_isolation ON tax_categories
  FOR ALL
  USING (business_id = get_current_business_id())
  WITH CHECK (business_id = get_current_business_id());
