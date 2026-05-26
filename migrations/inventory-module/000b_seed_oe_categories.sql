-- =====================================================================
-- Inventory Module — Operating Equipment (OE) category seeding
-- =====================================================================
-- Drop-in supplement to the Inventory Phase 1 migration.
-- Adds reusable-equipment categories to kitchen and housekeeping stores.
--
-- Run AFTER migrations/inventory-module/000_create_inventory_tables.sql
-- Idempotent — safe to re-run.
-- =====================================================================

-- Kitchen OE categories
INSERT INTO inv_categories (store_id, slug, display_name, display_order)
SELECT s.id, c.slug, c.display_name, c.display_order
FROM inv_stores s, (VALUES
  ('crockery',    'Crockery (plates, bowls, cups)',            20),
  ('cutlery',     'Cutlery (spoons, forks, knives)',           21),
  ('glassware',   'Glassware (water, juice, wine)',            22),
  ('cookware',    'Cookware (kadai, pans, pots, woks)',        23),
  ('utensils',    'Utensils (spatulas, ladles, tongs)',        24),
  ('serveware',   'Serveware (platters, trays, jugs)',         25),
  ('linen_k',     'Kitchen Linen (aprons, towels, cloths)',    26),
  ('tools_k',     'Kitchen Tools (peelers, graters, scales)',  27)
) AS c(slug, display_name, display_order)
WHERE s.slug = 'kitchen'
ON CONFLICT (store_id, slug) DO NOTHING;

-- Housekeeping OE categories
INSERT INTO inv_categories (store_id, slug, display_name, display_order)
SELECT s.id, c.slug, c.display_name, c.display_order
FROM inv_stores s, (VALUES
  ('inroom_crockery', 'In-Room Crockery (tea cups, kettles, jugs)', 20),
  ('cleaning_tools',  'Cleaning Tools (brooms, mops, buckets)',     21),
  ('hk_equipment',    'Housekeeping Equipment (trolleys, carts)',   22),
  ('curtains_decor',  'Curtains & Soft Decor',                      23)
) AS c(slug, display_name, display_order)
WHERE s.slug = 'housekeeping'
ON CONFLICT (store_id, slug) DO NOTHING;

-- Verify
SELECT s.display_name AS store, c.display_name AS category, c.display_order
FROM inv_categories c
JOIN inv_stores s ON s.id = c.store_id
WHERE c.slug IN (
  'crockery','cutlery','glassware','cookware','utensils','serveware','linen_k','tools_k',
  'inroom_crockery','cleaning_tools','hk_equipment','curtains_decor'
)
ORDER BY s.display_order, c.display_order;
