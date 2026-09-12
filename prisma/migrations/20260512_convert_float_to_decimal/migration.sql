-- Convert all financial Float fields to Decimal (NUMERIC in PostgreSQL)
-- This prevents floating-point precision errors in monetary calculations
-- Using DO blocks to handle tables/columns that may not exist in shadow DB

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customers') THEN
    ALTER TABLE "customers"
      ALTER COLUMN "total_due" TYPE NUMERIC(10,2) USING ROUND("total_due"::numeric, 2),
      ALTER COLUMN "total_paid" TYPE NUMERIC(10,2) USING ROUND("total_paid"::numeric, 2),
      ALTER COLUMN "prepaid_balance" TYPE NUMERIC(10,2) USING ROUND("prepaid_balance"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- LEDGER ENTRIES TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ledger_entries') THEN
    ALTER TABLE "ledger_entries"
      ALTER COLUMN "amount" TYPE NUMERIC(10,2) USING ROUND("amount"::numeric, 2),
      ALTER COLUMN "balance_after" TYPE NUMERIC(10,2) USING ROUND("balance_after"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- SALES TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sales') THEN
    ALTER TABLE "sales"
      ALTER COLUMN "subtotal" TYPE NUMERIC(10,2) USING ROUND("subtotal"::numeric, 2),
      ALTER COLUMN "discount" TYPE NUMERIC(10,2) USING ROUND("discount"::numeric, 2),
      ALTER COLUMN "tax" TYPE NUMERIC(10,2) USING ROUND("tax"::numeric, 2),
      ALTER COLUMN "total_amount" TYPE NUMERIC(10,2) USING ROUND("total_amount"::numeric, 2),
      ALTER COLUMN "amount_paid" TYPE NUMERIC(10,2) USING ROUND("amount_paid"::numeric, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='cash_amount') THEN
      ALTER TABLE "sales" ALTER COLUMN "cash_amount" TYPE NUMERIC(10,2) USING ROUND("cash_amount"::numeric, 2);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='upi_amount') THEN
      ALTER TABLE "sales" ALTER COLUMN "upi_amount" TYPE NUMERIC(10,2) USING ROUND("upi_amount"::numeric, 2);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- SALE ITEMS TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sale_items') THEN
    ALTER TABLE "sale_items"
      ALTER COLUMN "unit_price" TYPE NUMERIC(10,2) USING ROUND("unit_price"::numeric, 2),
      ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- SALE RETURNS TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sale_returns') THEN
    ALTER TABLE "sale_returns"
      ALTER COLUMN "refund_amount" TYPE NUMERIC(10,2) USING ROUND("refund_amount"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- SALE RETURN ITEMS TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='sale_return_items') THEN
    ALTER TABLE "sale_return_items"
      ALTER COLUMN "unit_price" TYPE NUMERIC(10,2) USING ROUND("unit_price"::numeric, 2),
      ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- PURCHASES TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='purchases') THEN
    ALTER TABLE "purchases"
      ALTER COLUMN "total_amount" TYPE NUMERIC(10,2) USING ROUND("total_amount"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- PURCHASE ITEMS TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='purchase_items') THEN
    ALTER TABLE "purchase_items"
      ALTER COLUMN "buying_price" TYPE NUMERIC(10,2) USING ROUND("buying_price"::numeric, 2),
      ALTER COLUMN "total_price" TYPE NUMERIC(10,2) USING ROUND("total_price"::numeric, 2);
  END IF;
END $$;

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='expenses') THEN
    ALTER TABLE "expenses"
      ALTER COLUMN "amount" TYPE NUMERIC(10,2) USING ROUND("amount"::numeric, 2);
  END IF;
END $$;
