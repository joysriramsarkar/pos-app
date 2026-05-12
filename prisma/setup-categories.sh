#!/bin/bash

# ============================================================================
# CATEGORY MIGRATION & SETUP SCRIPT
# ============================================================================
# Purpose: Establish standard category taxonomy and migrate existing products
# Date: 2026-05-12
# 
# This script helps you:
# 1. View current categories and products
# 2. Insert standard master categories
# 3. Update existing products to use standard categories
# 4. Verify the migration
#
# Usage: ./setup-categories.sh <option>
# ============================================================================

DB_CONNECTION_STRING="${DATABASE_URL}"

if [ -z "$DB_CONNECTION_STRING" ]; then
  echo "❌ Error: DATABASE_URL environment variable not set"
  echo "Set it with: export DATABASE_URL='postgresql://user:password@host:port/database'"
  exit 1
fi

# ============================================================================
# FUNCTIONS
# ============================================================================

show_current_categories() {
  echo "📊 Current Categories:"
  psql "$DB_CONNECTION_STRING" -c "SELECT id, name, name_bn, COUNT(p.id) as product_count FROM categories c LEFT JOIN products p ON c.name = p.category GROUP BY c.id, c.name, c.name_bn ORDER BY product_count DESC;"
}

show_unique_product_categories() {
  echo "📋 Unique Product Categories (Current):"
  psql "$DB_CONNECTION_STRING" -c "SELECT DISTINCT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC;"
}

insert_standard_categories() {
  echo "🔄 Inserting Standard Master Categories..."
  psql "$DB_CONNECTION_STRING" << 'EOF'
INSERT INTO "categories" (id, name, "name_bn", description, "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Groceries', 'মুদি ও চাল-ডাল', 'Rice, lentils, oil, flour, spices, and other basic grocery items', NOW(), NOW()),
  (gen_random_uuid(), 'Packaged Snacks', 'প্যাকেটজাত খাবার', 'Biscuits, chips, cookies, noodles, and packaged snack foods', NOW(), NOW()),
  (gen_random_uuid(), 'Beverages', 'পানীয়', 'Cold drinks, juices, water, tea leaves, coffee, and other beverages', NOW(), NOW()),
  (gen_random_uuid(), 'Dairy & Frozen', 'দুগ্ধজাত ও হিমায়িত', 'Milk, cheese, butter, ghee, ice cream, and frozen products', NOW(), NOW()),
  (gen_random_uuid(), 'Personal Care', 'ব্যক্তিগত যত্ন', 'Soap, shampoo, toothpaste, oil, and personal hygiene products', NOW(), NOW()),
  (gen_random_uuid(), 'Household & Cleaning', 'গৃহস্থালি ও পরিষ্কার', 'Detergent, disinfectant, dishwash, tissues, and cleaning supplies', NOW(), NOW()),
  (gen_random_uuid(), 'Confectionery', 'মিষ্টান্ন ও চকোলেট', 'Chocolate, candies, lozenges, chewing gum, and confectionery items', NOW(), NOW()),
  (gen_random_uuid(), 'General', 'সাধারণ', 'Miscellaneous items that do not fit into other categories', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;
EOF
  echo "✅ Standard categories inserted"
}

migrate_products_to_standard_categories() {
  echo "🔄 Mapping Products to Standard Categories..."
  
  # This is a suggestion - you'll need to manually review and categorize products
  # since we can't automatically determine the right category
  
  echo "
  📝 Manual Category Mapping Guide:
  
  Use these SQL patterns to update product categories:
  
  -- Update Beverages
  UPDATE products SET category = 'Beverages' 
  WHERE name ILIKE '%cola%' OR name ILIKE '%juice%' OR name ILIKE '%water%' OR name ILIKE '%tea%' OR name ILIKE '%coffee%';
  
  -- Update Packaged Snacks
  UPDATE products SET category = 'Packaged Snacks' 
  WHERE name ILIKE '%biscuit%' OR name ILIKE '%chip%' OR name ILIKE '%noodle%' OR name ILIKE '%cookie%';
  
  -- Update Dairy & Frozen
  UPDATE products SET category = 'Dairy & Frozen' 
  WHERE name ILIKE '%milk%' OR name ILIKE '%ice cream%' OR name ILIKE '%cheese%' OR name ILIKE '%butter%';
  
  -- Update Personal Care
  UPDATE products SET category = 'Personal Care' 
  WHERE name ILIKE '%soap%' OR name ILIKE '%shampoo%' OR name ILIKE '%toothpaste%';
  
  -- Update Household & Cleaning
  UPDATE products SET category = 'Household & Cleaning' 
  WHERE name ILIKE '%detergent%' OR name ILIKE '%cleaner%' OR name ILIKE '%tissue%';
  
  -- Update Confectionery
  UPDATE products SET category = 'Confectionery' 
  WHERE name ILIKE '%chocolate%' OR name ILIKE '%candy%' OR name ILIKE '%lozenge%';
  
  -- Update Groceries (default for remaining items)
  UPDATE products SET category = 'Groceries' 
  WHERE category NOT IN ('Beverages', 'Packaged Snacks', 'Dairy & Frozen', 'Personal Care', 'Household & Cleaning', 'Confectionery', 'General');
  "
}

verify_categories() {
  echo "✅ Verifying Category Assignment:"
  psql "$DB_CONNECTION_STRING" -c "SELECT category, COUNT(*) as product_count FROM products GROUP BY category ORDER BY product_count DESC;"
}

# ============================================================================
# MAIN MENU
# ============================================================================

case "${1:-menu}" in
  view)
    show_current_categories
    echo ""
    show_unique_product_categories
    ;;
  insert)
    insert_standard_categories
    ;;
  migrate)
    migrate_products_to_standard_categories
    ;;
  verify)
    verify_categories
    ;;
  all)
    show_current_categories
    echo ""
    show_unique_product_categories
    echo ""
    insert_standard_categories
    echo ""
    migrate_products_to_standard_categories
    echo ""
    verify_categories
    ;;
  *)
    echo "📚 Category Setup Helper"
    echo ""
    echo "Usage: $0 <option>"
    echo ""
    echo "Options:"
    echo "  view     - View current categories and products"
    echo "  insert   - Insert standard master categories"
    echo "  migrate  - Show migration guide"
    echo "  verify   - Verify category assignments"
    echo "  all      - Run all steps (view, insert, migrate, verify)"
    echo ""
    echo "Example:"
    echo "  $0 view"
    echo "  $0 insert"
    echo "  $0 migrate"
    ;;
esac
