-- =====================================================================
-- Meal Menu Generator (খাবারের মেনু) — Phase 1 Schema
-- Mirrors the idempotent style of migrations/coffee-shop-module/000_*.sql
-- =====================================================================
-- What this adds:
--  * menu_meal_types  — configurable meal slots (seeded with the 6 from
--    the WhatsApp samples, Bangla display names + default serving times)
--  * menu_dish_catalog — reusable dish names, usage-ranked for the picker
--  * menu_days / menu_meals / menu_meal_items / menu_special_notes —
--    one printable menu document per day
--  * menu_templates   — named meal snapshots for one-tap reuse
--  * 'menus' module + role permissions
-- NOTE: dish seed list below contains only the dishes traceable to the
-- provided samples/spec. Extend via 001_seed_dish_catalog.sql when the
-- full ~50-dish extract is supplied — inserts are ON CONFLICT DO NOTHING
-- so re-running is safe.
-- =====================================================================

-- 0a. Register `menus` module + seed permissions
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('menus', 'Meal Menus', 'Daily kitchen meal plans (খাবারের মেনু) with printable Bangla output', 14)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'operations_manager' THEN 'write'
    WHEN 'front_desk'         THEN 'read'
    WHEN 'reservation'        THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'menus'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 1. menu_meal_types ------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_meal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,               -- Bangla, as printed
  default_serving_time TEXT,                -- e.g. 'সকাল ৮:৩০ – ৯:০০' (nullable)
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO menu_meal_types (slug, display_name, default_serving_time, display_order) VALUES
  ('welcome_drinks',      'ওয়েলকাম ড্রিংকস',      NULL,                 1),
  ('breakfast',           'সকালের নাস্তা',        'সকাল ৮:৩০ – ৯:০০',   2),
  ('light_morning_snack', 'হালকা সকালের নাস্তা',  NULL,                 3),
  ('lunch',               'দুপুরের খাবার',        'দুপুর ১:০০ – ২:০০',  4),
  ('afternoon_snack',     'বিকালের নাস্তা',       NULL,                 5),
  ('dinner',              'রাতের খাবার',          NULL,                 6)
ON CONFLICT (slug) DO NOTHING;

-- 2. menu_dish_catalog ----------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_dish_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,                -- stored verbatim (Bangla/Banglish/English)
  category TEXT,                            -- free-text grouping, nullable
  usage_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_dish_usage ON menu_dish_catalog(usage_count DESC);

-- Seed: dishes traceable to the WhatsApp samples/spec (see NOTE above)
INSERT INTO menu_dish_catalog (name) VALUES
  ('খিচুড়ি'),
  ('পরোটা (২ পিস)'),
  ('চিকেন রোস্ট (১ পিস)'),
  ('আলু বোখরা চাটনি'),
  ('সালাদ'),
  ('মিক্সড সালাদ'),
  ('মিক্সড সবজি'),
  ('স্যান্ডউইচ'),
  ('ক্রিম ক্যারামেল'),
  ('গরুর মাংসের কারি')
ON CONFLICT (name) DO NOTHING;

-- 3. menu_days ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_date DATE NOT NULL,
  occasion_note TEXT,                       -- e.g. 'ডেকাথেলনঃ ৫২ জন'
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_days_date    ON menu_days(menu_date DESC);
CREATE INDEX IF NOT EXISTS idx_menu_days_booking ON menu_days(booking_id) WHERE booking_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_days_updated_at') THEN
    CREATE TRIGGER trg_menu_days_updated_at
      BEFORE UPDATE ON menu_days
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 4. menu_meals -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_day_id UUID NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
  meal_type_id UUID NOT NULL REFERENCES menu_meal_types(id),
  serving_time TEXT,                        -- copied from type default, editable per day
  headcount_total    INT CHECK (headcount_total    >= 0),
  headcount_adults   INT CHECK (headcount_adults   >= 0),
  headcount_children INT CHECK (headcount_children >= 0),
  headcount_drivers  INT CHECK (headcount_drivers  >= 0),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_meals_day ON menu_meals(menu_day_id);

-- 5. menu_meal_items --------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES menu_meals(id) ON DELETE CASCADE,
  text TEXT NOT NULL,                       -- printed verbatim, incl. portion notes
  dish_catalog_id UUID REFERENCES menu_dish_catalog(id) ON DELETE SET NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_meal_items_meal ON menu_meal_items(meal_id);

-- 6. menu_special_notes ------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_special_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_day_id UUID NOT NULL REFERENCES menu_days(id) ON DELETE CASCADE,
  meal_id UUID REFERENCES menu_meals(id) ON DELETE CASCADE,  -- NULL = day-level
  text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'green' CHECK (color IN ('green','blue','red')),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_notes_day ON menu_special_notes(menu_day_id);

-- 7. menu_templates ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meal_type_id UUID NOT NULL REFERENCES menu_meal_types(id),
  serving_time TEXT,
  items JSONB NOT NULL DEFAULT '[]',        -- [{ "text": "..." }] snapshot
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_templates_type ON menu_templates(meal_type_id);

-- 8. Extend history_log entity_type CHECK ------------------------------------
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit',
    'qa_review',
    'menu_day'
  ));

-- 9. RLS — single-tenant (any authenticated user) -----------------------------
ALTER TABLE menu_meal_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_dish_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_days          ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_meals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_meal_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_special_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_templates     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_meal_types','menu_dish_catalog','menu_days','menu_meals','menu_meal_items','menu_special_notes','menu_templates'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_auth') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', 'p_' || t || '_auth', t);
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT (SELECT COUNT(*) FROM menu_meal_types)   AS meal_types,
       (SELECT COUNT(*) FROM menu_dish_catalog) AS catalog_dishes,
       (SELECT level FROM role_permissions rp
          JOIN roles r ON r.id = rp.role_id JOIN modules m ON m.id = rp.module_id
         WHERE r.slug = 'manager' AND m.slug = 'menus') AS manager_level;
