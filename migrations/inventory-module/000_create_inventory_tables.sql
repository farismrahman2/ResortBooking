-- =====================================================================
-- Inventory Module — Phase 1 Schema
-- Mirrors the idempotent style of migrations/coffee-shop-module/000_*.sql
-- =====================================================================
-- Corrections vs. original spec:
--  * display_order = 10 (9 is already taken by coffee_shop)
--  * roles: this codebase has admin/manager/front_desk/accountant/reservation
--    (no 'corporate_sales'). front_desk + reservation get 'none'.
-- =====================================================================

-- 0. Register module + seed permissions
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('inventory', 'Inventory', 'Stock management: housekeeping, kitchen stores', 10)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'      THEN 'write'
    WHEN 'manager'    THEN 'write'
    WHEN 'accountant' THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'inventory'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 1. inv_stores
CREATE TABLE IF NOT EXISTS inv_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inv_stores (slug, display_name, description, display_order) VALUES
  ('housekeeping', 'Housekeeping Store', 'Linen, towels, amenities, cleaning supplies, room consumables', 1),
  ('kitchen',      'Kitchen Store',      'Food ingredients, dry goods, cold storage, kitchen consumables', 2)
ON CONFLICT (slug) DO NOTHING;

-- 2. inv_categories
CREATE TABLE IF NOT EXISTS inv_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES inv_stores(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(store_id, slug)
);

INSERT INTO inv_categories (store_id, slug, display_name, display_order)
SELECT s.id, c.slug, c.display_name, c.display_order
FROM inv_stores s, (VALUES
  ('housekeeping', 'linen',          'Linen',                   1),
  ('housekeeping', 'towels',         'Towels',                  2),
  ('housekeeping', 'amenities',      'Guest Amenities',         3),
  ('housekeeping', 'cleaning',       'Cleaning Supplies',       4),
  ('housekeeping', 'room_supplies',  'Room Supplies',           5),
  ('housekeeping', 'uniforms',       'Uniforms',                6),
  ('housekeeping', 'other_hk',       'Other',                   99),
  ('kitchen',      'rice_grains',    'Rice & Grains',           1),
  ('kitchen',      'meat_fish',      'Meat & Fish',             2),
  ('kitchen',      'vegetables',     'Vegetables',              3),
  ('kitchen',      'dairy_eggs',     'Dairy & Eggs',            4),
  ('kitchen',      'spices',         'Spices & Condiments',     5),
  ('kitchen',      'oil_ghee',       'Oil & Ghee',              6),
  ('kitchen',      'beverages_k',    'Beverages (Kitchen)',     7),
  ('kitchen',      'packaged',       'Packaged & Dry Goods',    8),
  ('kitchen',      'cleaning_k',     'Kitchen Cleaning',        9),
  ('kitchen',      'disposables',    'Disposables',             10),
  ('kitchen',      'other_k',        'Other',                   99)
) AS c(store_slug, slug, display_name, display_order)
WHERE s.slug = c.store_slug
ON CONFLICT (store_id, slug) DO NOTHING;

-- 3. inv_units
CREATE TABLE IF NOT EXISTS inv_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('weight', 'volume', 'count', 'length')),
  display_order INT NOT NULL DEFAULT 0
);

INSERT INTO inv_units (slug, display_name, abbreviation, unit_type, display_order) VALUES
  ('piece',      'Piece',      'pc',  'count',  1),
  ('pair',       'Pair',       'pr',  'count',  2),
  ('dozen',      'Dozen',      'doz', 'count',  3),
  ('pack',       'Pack',       'pk',  'count',  4),
  ('bottle',     'Bottle',     'btl', 'count',  5),
  ('box',        'Box',        'box', 'count',  6),
  ('roll',       'Roll',       'rl',  'count',  7),
  ('gram',       'Gram',       'g',   'weight', 10),
  ('kilogram',   'Kilogram',   'kg',  'weight', 11),
  ('milliliter', 'Milliliter', 'ml',  'volume', 20),
  ('liter',      'Liter',      'L',   'volume', 21)
ON CONFLICT (slug) DO NOTHING;

-- 4. inv_suppliers (linkable to expense_payees)
CREATE TABLE IF NOT EXISTS inv_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  expense_payee_id UUID REFERENCES expense_payees(id),
  contact_phone TEXT,
  contact_email TEXT,
  contact_address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_suppliers_active ON inv_suppliers(is_active);

-- 5. inv_items (SKU master with persisted current_stock)
CREATE TABLE IF NOT EXISTS inv_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code TEXT UNIQUE NOT NULL,
  store_id UUID NOT NULL REFERENCES inv_stores(id),
  category_id UUID NOT NULL REFERENCES inv_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  unit_id UUID NOT NULL REFERENCES inv_units(id),
  item_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (item_type IN ('consumable', 'operating_equipment')),
  par_level NUMERIC(12, 3) CHECK (par_level IS NULL OR par_level >= 0),
  reorder_point NUMERIC(12, 3) CHECK (reorder_point IS NULL OR reorder_point >= 0),
  CHECK (reorder_point IS NULL OR par_level IS NULL OR reorder_point <= par_level),
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  last_purchase_price NUMERIC(12, 2),
  avg_purchase_price NUMERIC(12, 2),
  default_supplier_id UUID REFERENCES inv_suppliers(id),
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_items_store ON inv_items(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_category ON inv_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_active ON inv_items(is_active);
CREATE INDEX IF NOT EXISTS idx_inv_items_below_reorder
  ON inv_items(id)
  WHERE reorder_point IS NOT NULL AND current_stock <= reorder_point AND is_active = true;

-- 6. Extend history_log entity_type CHECK (superset of the current coffee-shop set)
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count'
  ));

-- 7. Extend expenses with source tracking so inventory receipts can be tagged
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_module TEXT NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_source_module_check'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_source_module_check
      CHECK (source_module IN ('manual', 'payroll', 'checkout_refund', 'inventory'));
  END IF;
END $$;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE INDEX IF NOT EXISTS idx_expenses_source ON expenses(source_module, source_id);

-- 8. RLS: enable + permissive policy per table (single-tenant pattern)
ALTER TABLE inv_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_stores' AND policyname = 'inv_stores_all') THEN
    CREATE POLICY inv_stores_all ON inv_stores FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_categories' AND policyname = 'inv_categories_all') THEN
    CREATE POLICY inv_categories_all ON inv_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_units' AND policyname = 'inv_units_all') THEN
    CREATE POLICY inv_units_all ON inv_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_suppliers' AND policyname = 'inv_suppliers_all') THEN
    CREATE POLICY inv_suppliers_all ON inv_suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_items' AND policyname = 'inv_items_all') THEN
    CREATE POLICY inv_items_all ON inv_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verify
SELECT 'inv_stores' AS table_name, COUNT(*) AS row_count FROM inv_stores
UNION ALL SELECT 'inv_categories', COUNT(*) FROM inv_categories
UNION ALL SELECT 'inv_units',      COUNT(*) FROM inv_units
UNION ALL SELECT 'inv_suppliers',  COUNT(*) FROM inv_suppliers
UNION ALL SELECT 'inv_items',      COUNT(*) FROM inv_items;
