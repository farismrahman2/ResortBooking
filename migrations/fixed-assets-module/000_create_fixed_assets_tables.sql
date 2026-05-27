-- =====================================================================
-- Fixed Assets Module — Phase 1 Schema
-- Mirrors the idempotent style of the inventory/CRM module migrations.
-- =====================================================================

-- 0a. Register module + seed permissions
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('fixed_assets', 'Fixed Assets', 'Long-life equipment, furniture, fixtures — individually tracked', 12)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'accountant'         THEN 'read'
    WHEN 'md'                 THEN 'read'
    WHEN 'operations_manager' THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'fixed_assets'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 0b. One expense category for asset acquisitions (group 'materials').
--     The asset register itself carries the per-category breakdown, so a
--     single expense category keeps the manual-expense dropdown uncluttered.
INSERT INTO expense_categories (name, slug, category_group, requires_payee, display_order) VALUES
  ('Fixed Asset Purchases', 'fixed_asset_purchases', 'materials', false, 60)
ON CONFLICT (slug) DO NOTHING;

-- 1. fa_categories
CREATE TABLE IF NOT EXISTS fa_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  default_useful_life_years INT NOT NULL CHECK (default_useful_life_years > 0),
  default_salvage_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_salvage_pct BETWEEN 0 AND 100),
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO fa_categories (slug, display_name, default_useful_life_years, default_salvage_pct, description, display_order) VALUES
  ('hvac',          'HVAC (AC, ventilation)',          10, 5,  'Air conditioners, ventilation systems', 1),
  ('refrigeration', 'Refrigeration',                   12, 5,  'Refrigerators, freezers, chillers, deep freezers', 2),
  ('kitchen_eq',    'Kitchen Equipment',               10, 5,  'Stoves, ovens, fryers, dishwashers, commercial mixers', 3),
  ('laundry_eq',    'Laundry Equipment',               10, 5,  'Washing machines, dryers, ironing equipment', 4),
  ('furniture',     'Furniture',                       15, 10, 'Beds, sofas, tables, chairs, cabinets, wardrobes', 5),
  ('soft_furn',     'Soft Furnishings',                 7, 0,  'Mattresses, curtains, carpets, rugs', 6),
  ('it_eq',         'IT Equipment',                     5, 0,  'Computers, printers, networking, servers, POS', 7),
  ('av_eq',         'Audio-Visual',                     7, 0,  'TVs, projectors, speakers, sound systems', 8),
  ('electrical',    'Electrical Fixtures',             15, 0,  'Lighting fixtures, chandeliers, fans, water heaters', 9),
  ('plumbing',      'Plumbing Fixtures',               15, 0,  'Toilets, sinks, faucets, geysers, showers', 10),
  ('outdoor_eq',    'Outdoor & Garden Equipment',      10, 5,  'Pool equipment, garden tools, mowers, sprinklers', 11),
  ('generators',    'Generators & Power Backup',       15, 10, 'Diesel generators, UPS, inverters, batteries', 12),
  ('water_pump',    'Water Pumps & Tanks',             15, 5,  'Pumps, water tanks, treatment systems', 13),
  ('vehicles',      'Vehicles',                         8, 15, 'Cars, vans, motorcycles owned by the resort', 14),
  ('security',      'Security Equipment',               7, 0,  'CCTV cameras, DVR, access control, alarms', 15),
  ('office_eq',     'Office Equipment',                 8, 5,  'Photocopiers, fax, telephone systems, safes', 16),
  ('other_fa',      'Other Fixed Assets',              10, 0,  'Anything not in the above categories', 99)
ON CONFLICT (slug) DO NOTHING;

-- 2. fa_locations
CREATE TABLE IF NOT EXISTS fa_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN (
    'guest_room','common_area','kitchen','restaurant','office','laundry',
    'storage','outdoor','plant_room','vehicle','staff_quarters','other'
  )),
  parent_location_id UUID REFERENCES fa_locations(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO fa_locations (slug, display_name, location_type, display_order) VALUES
  ('reception',      'Reception',          'common_area',    1),
  ('main_kitchen',   'Main Kitchen',       'kitchen',        2),
  ('restaurant',     'Restaurant',         'restaurant',     3),
  ('coffee_shop',    'Coffee Shop',        'restaurant',     4),
  ('main_office',    'Main Office',        'office',         5),
  ('laundry_room',   'Laundry Room',       'laundry',        6),
  ('plant_room',     'Plant Room',         'plant_room',     7),
  ('garden',         'Garden / Outdoor',   'outdoor',        8),
  ('staff_quarters', 'Staff Quarters',     'staff_quarters', 9),
  ('storage',        'Storage / Godown',   'storage',       10),
  ('unallocated',    'Unallocated',        'other',         99)
ON CONFLICT (slug) DO NOTHING;

-- 3. fa_assets
CREATE TABLE IF NOT EXISTS fa_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES fa_categories(id),
  description TEXT,
  brand TEXT,
  model_number TEXT,
  serial_number TEXT,
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC(12,2) NOT NULL CHECK (acquisition_cost > 0),
  vendor_id UUID REFERENCES expense_payees(id),
  invoice_number TEXT,
  warranty_until DATE,
  expense_id UUID REFERENCES expenses(id),
  useful_life_years INT NOT NULL CHECK (useful_life_years > 0),
  salvage_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  CHECK (salvage_value < acquisition_cost),
  depreciation_start_date DATE NOT NULL,
  location_id UUID REFERENCES fa_locations(id),
  location_notes TEXT,
  custodian_employee_id UUID REFERENCES employees(id),
  condition TEXT NOT NULL DEFAULT 'good'
    CHECK (condition IN ('excellent','good','fair','poor','needs_repair','out_of_service')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disposed','lost','stolen')),
  disposal_date DATE,
  disposal_method TEXT CHECK (disposal_method IS NULL OR disposal_method IN (
    'sold','scrapped','donated','traded_in','lost','written_off'
  )),
  disposal_proceeds NUMERIC(12,2) CHECK (disposal_proceeds IS NULL OR disposal_proceeds >= 0),
  disposal_notes TEXT,
  CHECK (
    (status = 'active' AND disposal_date IS NULL)
    OR
    (status != 'active' AND disposal_date IS NOT NULL)
  ),
  photos TEXT[],
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fa_assets_category ON fa_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fa_assets_location ON fa_assets(location_id);
CREATE INDEX IF NOT EXISTS idx_fa_assets_custodian ON fa_assets(custodian_employee_id);
CREATE INDEX IF NOT EXISTS idx_fa_assets_status ON fa_assets(status);
CREATE INDEX IF NOT EXISTS idx_fa_assets_condition ON fa_assets(condition);
CREATE INDEX IF NOT EXISTS idx_fa_assets_active ON fa_assets(is_active);
CREATE INDEX IF NOT EXISTS idx_fa_assets_tag ON fa_assets USING gin (to_tsvector('simple', asset_tag || ' ' || name));

-- 4. fa_maintenance_log
CREATE TABLE IF NOT EXISTS fa_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fa_assets(id) ON DELETE CASCADE,
  maintenance_date DATE NOT NULL,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN (
    'preventive','corrective','inspection','warranty','amc','installation','upgrade','other'
  )),
  description TEXT NOT NULL,
  vendor_id UUID REFERENCES expense_payees(id),
  technician_name TEXT,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  expense_id UUID REFERENCES expenses(id),
  next_service_date DATE,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('resolved','pending','requires_replacement','warranty_claim')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fa_maint_asset ON fa_maintenance_log(asset_id);
CREATE INDEX IF NOT EXISTS idx_fa_maint_date ON fa_maintenance_log(maintenance_date);
CREATE INDEX IF NOT EXISTS idx_fa_maint_next_service ON fa_maintenance_log(next_service_date);

-- 5. Extend history_log entity_type CHECK (superset of all modules)
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit'
  ));

-- 6. Extend expenses.source_module (superset incl. fixed_assets)
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_source_module_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_source_module_check
  CHECK (source_module IN ('manual', 'payroll', 'checkout_refund', 'inventory', 'fixed_assets'));

-- 7. RLS
ALTER TABLE fa_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_maintenance_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_categories' AND policyname='fa_categories_all') THEN
    CREATE POLICY fa_categories_all ON fa_categories FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_locations' AND policyname='fa_locations_all') THEN
    CREATE POLICY fa_locations_all ON fa_locations FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_assets' AND policyname='fa_assets_all') THEN
    CREATE POLICY fa_assets_all ON fa_assets FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_maintenance_log' AND policyname='fa_maintenance_log_all') THEN
    CREATE POLICY fa_maintenance_log_all ON fa_maintenance_log FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- Verify
SELECT 'fa_categories' AS table_name, COUNT(*) AS row_count FROM fa_categories
UNION ALL SELECT 'fa_locations', COUNT(*) FROM fa_locations
UNION ALL SELECT 'fa_assets', COUNT(*) FROM fa_assets
UNION ALL SELECT 'fa_maintenance_log', COUNT(*) FROM fa_maintenance_log;
