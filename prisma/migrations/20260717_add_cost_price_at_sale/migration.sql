-- Snapshot product cost at sale time so historical profit reports don't drift with WAC updates
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "cost_price_at_sale" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- Backfill existing rows from current product buying price (best-effort for historical data)
UPDATE "sale_items" AS si
SET "cost_price_at_sale" = p."buying_price"
FROM "products" AS p
WHERE p.id = si.product_id
  AND (si."cost_price_at_sale" IS NULL OR si."cost_price_at_sale" = 0);
