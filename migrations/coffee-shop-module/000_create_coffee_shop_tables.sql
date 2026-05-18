-- =====================================================================
-- Coffee Shop POS Module — Phase 1 schema
-- =====================================================================
-- Run after auth-roles + checkout migrations. Idempotent.
--
-- Adapted from spec to match actual schema:
-- * RoleSlug only has admin / manager / front_desk / accountant
--   (no 'corporate_sales' in this codebase — that line is dropped)
-- * entity_type CHECK is extended additively to current set, not the
--   spec's hypothetical CRM set
-- =====================================================================

-- 0a. Insert the 'coffee_shop' module
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('coffee_shop', 'Coffee Shop', 'Standalone coffee shop sales (walk-ins, non-guests)', 9)
ON CONFLICT (slug) DO NOTHING;

-- 0b. Seed default permissions
-- admin / manager / front_desk: write
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug IN ('admin', 'manager', 'front_desk')
   AND m.slug = 'coffee_shop'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- accountant: read
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'read'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'accountant' AND m.slug = 'coffee_shop'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 1. Shared catalog: add availability flags to charge_items
ALTER TABLE charge_items
  ADD COLUMN IF NOT EXISTS is_available_in_coffee_shop BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE charge_items
  ADD COLUMN IF NOT EXISTS is_available_as_room_extra BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_charge_items_coffee_shop
  ON charge_items(is_available_in_coffee_shop) WHERE is_available_in_coffee_shop = true;

-- 2. coffee_shop_sales (the transaction header)
CREATE TABLE IF NOT EXISTS coffee_shop_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number     TEXT UNIQUE NOT NULL,                  -- 'CS-YYYYMMDD-NNN'
  sale_date       DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Dhaka')::date,
  status          TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed','voided')),
  -- Totals (computed app-side, persisted for query speed)
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  comp_value      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (comp_value >= 0),
  discount_type   TEXT CHECK (discount_type IS NULL OR discount_type IN ('percent','fixed')),
  discount_value  NUMERIC(12,2) DEFAULT 0 CHECK (discount_value IS NULL OR discount_value >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_reason TEXT,
  net_amount      NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
  customer_label  TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at       TIMESTAMPTZ,
  voided_by       UUID REFERENCES auth.users(id),
  void_reason     TEXT,
  CHECK (status = 'voided'    OR voided_at IS NULL),
  CHECK (status = 'completed' OR voided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cs_sales_date       ON coffee_shop_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_cs_sales_status     ON coffee_shop_sales(status);
CREATE INDEX IF NOT EXISTS idx_cs_sales_created_by ON coffee_shop_sales(created_by);

-- 3. coffee_shop_sale_items (line items)
CREATE TABLE IF NOT EXISTS coffee_shop_sale_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id            UUID NOT NULL REFERENCES coffee_shop_sales(id) ON DELETE CASCADE,
  charge_item_id     UUID REFERENCES charge_items(id),
  category_id        UUID NOT NULL REFERENCES charge_categories(id),
  description        TEXT NOT NULL,
  quantity           NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price         NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  amount             NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  is_complimentary   BOOLEAN NOT NULL DEFAULT false,
  comp_authorized_by UUID REFERENCES auth.users(id),
  comp_reason        TEXT,
  notes              TEXT,
  display_order      INT NOT NULL DEFAULT 0,
  CHECK (
    (is_complimentary = false AND comp_authorized_by IS NULL AND comp_reason IS NULL)
    OR
    (is_complimentary = true AND comp_authorized_by IS NOT NULL AND comp_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cs_items_sale        ON coffee_shop_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_cs_items_charge_item ON coffee_shop_sale_items(charge_item_id);
CREATE INDEX IF NOT EXISTS idx_cs_items_category    ON coffee_shop_sale_items(category_id);

-- 4. coffee_shop_sale_payments (split-tender)
CREATE TABLE IF NOT EXISTS coffee_shop_sale_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       UUID NOT NULL REFERENCES coffee_shop_sales(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL CHECK (method IN
    ('cash','bkash','nagad','rocket','card','bank_transfer','other')),
  reference     TEXT,
  display_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cs_payments_sale ON coffee_shop_sale_payments(sale_id);

-- 5. Extend history_log entity_type CHECK to include coffee_shop_sale
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale'
  ));

-- 6. RLS — same single-tenant pattern
ALTER TABLE coffee_shop_sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_shop_sale_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE coffee_shop_sale_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coffee_shop_sales' AND policyname='p_cs_sales_auth')
    THEN CREATE POLICY p_cs_sales_auth         ON coffee_shop_sales         FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coffee_shop_sale_items' AND policyname='p_cs_items_auth')
    THEN CREATE POLICY p_cs_items_auth         ON coffee_shop_sale_items    FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coffee_shop_sale_payments' AND policyname='p_cs_payments_auth')
    THEN CREATE POLICY p_cs_payments_auth      ON coffee_shop_sale_payments FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- Verify
SELECT m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE m.slug = 'coffee_shop'
 ORDER BY r.slug;
