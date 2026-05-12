-- Standard Master Categories for POS System
-- Created: 2026-05-12
-- Purpose: Establish consistent taxonomy for inventory management, reporting, and analysis

-- ============================================================================
-- INSERT STANDARD MASTER CATEGORIES
-- ============================================================================
-- Note: Run this BEFORE migrating existing products to these categories

INSERT INTO "categories" (id, name, "name_bn", description, "created_at", "updated_at")
VALUES
  (
    'cat_groceries_' || substr(md5(random()::text), 1, 8),
    'Groceries',
    'মুদি ও চাল-ডাল',
    'Rice, lentils, oil, flour, spices, and other basic grocery items',
    NOW(),
    NOW()
  ),
  (
    'cat_packaged_' || substr(md5(random()::text), 1, 8),
    'Packaged Snacks',
    'প্যাকেটজাত খাবার',
    'Biscuits, chips, cookies, noodles, and packaged snack foods',
    NOW(),
    NOW()
  ),
  (
    'cat_beverages' || substr(md5(random()::text), 1, 8),
    'Beverages',
    'পানীয়',
    'Cold drinks, juices, water, tea leaves, coffee, and other beverages',
    NOW(),
    NOW()
  ),
  (
    'cat_dairy_' || substr(md5(random()::text), 1, 8),
    'Dairy & Frozen',
    'দুগ্ধজাত ও হিমায়িত',
    'Milk, cheese, butter, ghee, ice cream, and frozen products',
    NOW(),
    NOW()
  ),
  (
    'cat_personal_' || substr(md5(random()::text), 1, 8),
    'Personal Care',
    'ব্যক্তিগত যত্ন',
    'Soap, shampoo, toothpaste, oil, and personal hygiene products',
    NOW(),
    NOW()
  ),
  (
    'cat_household' || substr(md5(random()::text), 1, 8),
    'Household & Cleaning',
    'গৃহস্থালি ও পরিষ্কার',
    'Detergent, disinfectant, dishwash, tissues, and cleaning supplies',
    NOW(),
    NOW()
  ),
  (
    'cat_confection' || substr(md5(random()::text), 1, 8),
    'Confectionery',
    'মিষ্টান্ন ও চকোলেট',
    'Chocolate, candies, lozenges, chewing gum, and confectionery items',
    NOW(),
    NOW()
  ),
  (
    'cat_general_' || substr(md5(random()::text), 1, 8),
    'General',
    'সাধারণ',
    'Miscellaneous items that do not fit into other categories',
    NOW(),
    NOW()
  );

-- ============================================================================
-- VERIFICATION: List all categories after insertion
-- ============================================================================
SELECT id, name, "name_bn", description FROM "categories" ORDER BY "created_at";
