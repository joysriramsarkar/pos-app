-- SQL Cleanup & Verification Script for Financial Precision Fix
-- Run this to verify and clean up any remaining floating-point errors
-- Date: 2026-05-12

-- ============================================================================
-- VERIFICATION: Check for suspicious decimal values (likely floating-point errors)
-- ============================================================================

-- Find products with unusual decimal places in prices
SELECT id, name, buying_price, selling_price 
FROM products 
WHERE 
  CAST(buying_price AS TEXT) LIKE '%.%____' OR 
  CAST(selling_price AS TEXT) LIKE '%.%____'
LIMIT 10;

-- Find sales items with unusual pricing
SELECT id, product_name, unit_price, total_price 
FROM sale_items 
WHERE 
  CAST(unit_price AS TEXT) LIKE '%.%____' OR 
  CAST(total_price AS TEXT) LIKE '%.%____'
LIMIT 10;

-- Find customers with unusual balances
SELECT id, name, total_due, total_paid, prepaid_balance
FROM customers
WHERE 
  CAST(total_due AS TEXT) LIKE '%.%____' OR 
  CAST(total_paid AS TEXT) LIKE '%.%____' OR
  CAST(prepaid_balance AS TEXT) LIKE '%.%____'
LIMIT 10;

-- ============================================================================
-- CLEANUP: Fix any detected floating-point errors
-- Uncomment and run if issues are found
-- ============================================================================

-- Verify all financial tables are now NUMERIC type
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('products', 'customers', 'sales', 'sale_items', 'ledger_entries', 
--                      'purchases', 'purchase_items', 'sale_returns', 'sale_return_items', 'expenses')
-- AND column_name IN ('buying_price', 'selling_price', 'total_due', 'total_paid', 'prepaid_balance',
--                     'subtotal', 'discount', 'tax', 'total_amount', 'amount_paid', 'cash_amount', 'upi_amount',
--                     'unit_price', 'total_price', 'refund_amount', 'amount', 'balance_after');
