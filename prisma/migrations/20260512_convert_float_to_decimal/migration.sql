-- Convert all financial Float fields to Decimal (NUMERIC in PostgreSQL)
-- This prevents floating-point precision errors in monetary calculations

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================
ALTER TABLE "customers" 
  ALTER COLUMN "total_due" TYPE NUMERIC(10,2) USING ROUND("total_due"::numeric, 2),
  ALTER COLUMN "total_paid" TYPE NUMERIC(10,2) USING ROUND("total_paid"::numeric, 2),
  ALTER COLUMN "prepaid_balance" TYPE NUMERIC(10,2) USING ROUND("prepaid_balance"::numeric, 2);

-- ============================================================================
-- LEDGER ENTRIES TABLE
-- ============================================================================
ALTER TABLE "ledger_entries"
  ALTER COLUMN "amount" TYPE NUMERIC(10,2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "balance_after" TYPE NUMERIC(10,2) USING ROUND("balance_after"::numeric, 2);

-- ============================================================================
-- SALES TABLE
-- ============================================================================
ALTER TABLE "sales"
  ALTER COLUMN "subtotal" TYPE NUMERIC(10,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "discount" TYPE NUMERIC(10,2) USING ROUND("discount"::numeric, 2),
  ALTER COLUMN "tax" TYPE NUMERIC(10,2) USING ROUND("tax"::numeric, 2),
  ALTER COLUMN "total_amount" TYPE NUMERIC(10,2) USING ROUND("total_amount"::numeric, 2),
  ALTER COLUMN "amount_paid" TYPE NUMERIC(10,2) USING ROUND("amount_paid"::numeric, 2),
  ALTER COLUMN "cash_amount" TYPE NUMERIC(10,2) USING ROUND("cash_amount"::numeric, 2),
  ALTER COLUMN "upi_amount" TYPE NUMERIC(10,2) USING ROUND("upi_amount"::numeric, 2);

-- ============================================================================
-- SALE ITEMS TABLE
-- ============================================================================
ALTER TABLE "sale_items"
  ALTER COLUMN "unit_price" TYPE NUMERIC(10,2) USING ROUND("unit_price"::numeric, 2),
  ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);

-- ============================================================================
-- SALE RETURNS TABLE
-- ============================================================================
ALTER TABLE "sale_returns"
  ALTER COLUMN "refund_amount" TYPE NUMERIC(10,2) USING ROUND("refund_amount"::numeric, 2);

-- ============================================================================
-- SALE RETURN ITEMS TABLE
-- ============================================================================
ALTER TABLE "sale_return_items"
  ALTER COLUMN "unit_price" TYPE NUMERIC(10,2) USING ROUND("unit_price"::numeric, 2),
  ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);

-- ============================================================================
-- PURCHASES TABLE
-- ============================================================================
ALTER TABLE "purchases"
  ALTER COLUMN "total_amount" TYPE NUMERIC(10,2) USING ROUND("total_amount"::numeric, 2);

-- ============================================================================
-- PURCHASE ITEMS TABLE
-- ============================================================================
ALTER TABLE "purchase_items"
  ALTER COLUMN "buying_price" TYPE NUMERIC(10,2) USING ROUND("buying_price"::numeric, 2),
  ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE NUMERIC(10,2) USING ROUND("amount"::numeric, 2);
