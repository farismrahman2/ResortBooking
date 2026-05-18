-- =====================================================================
-- Checkout Module — Phase 3 Schema
-- =====================================================================
-- Idempotent — safe to re-run.
-- Pre-requisite: run after the auth-roles-module migration (extends
-- history_log entity_type CHECK to allow 'checkout' and 'charge_item').
-- =====================================================================

-- 1. charge_categories ---------------------------------------------------
CREATE TABLE IF NOT EXISTS charge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO charge_categories (slug, display_name, display_order) VALUES
  ('food',     'Food',     1),
  ('beverage', 'Beverage', 2),
  ('damage',   'Damage',   3),
  ('service',  'Service',  4),
  ('misc',     'Misc',     5)
ON CONFLICT (slug) DO NOTHING;

-- 2. charge_items --------------------------------------------------------
CREATE TABLE IF NOT EXISTS charge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES charge_categories(id),
  name TEXT NOT NULL,
  default_price NUMERIC(12,2) NOT NULL CHECK (default_price >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charge_items_category ON charge_items(category_id);
CREATE INDEX IF NOT EXISTS idx_charge_items_active   ON charge_items(is_active);

-- 3. checkouts -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','finalized','voided')),
  advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  charges_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payments_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_due NUMERIC(12,2) GENERATED ALWAYS AS
    (charges_total - advance_amount - payments_total) STORED,
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_expense_id UUID REFERENCES expenses(id),
  notes TEXT,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_checkouts_status  ON checkouts(status);
CREATE INDEX IF NOT EXISTS idx_checkouts_booking ON checkouts(booking_id);

-- 4. checkout_charges ---------------------------------------------------
CREATE TABLE IF NOT EXISTS checkout_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id UUID NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES charge_categories(id),
  charge_item_id UUID REFERENCES charge_items(id),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  amount NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes TEXT,
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_charges_checkout ON checkout_charges(checkout_id);

-- 5. checkout_payments --------------------------------------------------
CREATE TABLE IF NOT EXISTS checkout_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id UUID NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN
    ('cash','bkash','nagad','rocket','card','bank_transfer','other')),
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by UUID,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_payments_checkout ON checkout_payments(checkout_id);

-- 6. updated_at trigger -------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_charge_items_updated_at') THEN
    CREATE TRIGGER trg_charge_items_updated_at
      BEFORE UPDATE ON charge_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_checkouts_updated_at') THEN
    CREATE TRIGGER trg_checkouts_updated_at
      BEFORE UPDATE ON checkouts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 7. RLS — single-tenant pattern ----------------------------------------
ALTER TABLE charge_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_charges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_payments  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='charge_categories' AND policyname='p_charge_categories_auth')
    THEN CREATE POLICY p_charge_categories_auth ON charge_categories FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='charge_items' AND policyname='p_charge_items_auth')
    THEN CREATE POLICY p_charge_items_auth ON charge_items FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checkouts' AND policyname='p_checkouts_auth')
    THEN CREATE POLICY p_checkouts_auth ON checkouts FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checkout_charges' AND policyname='p_checkout_charges_auth')
    THEN CREATE POLICY p_checkout_charges_auth ON checkout_charges FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='checkout_payments' AND policyname='p_checkout_payments_auth')
    THEN CREATE POLICY p_checkout_payments_auth ON checkout_payments FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- 8. Extend bookings status to allow 'checked_out' ---------------------
-- Whether bookings.status is implemented as a CHECK or a Postgres ENUM,
-- handle both. The existing values are draft/sent/confirmed/cancelled.
DO $$
DECLARE
  is_enum BOOLEAN;
BEGIN
  -- Detect whether booking_status is a real enum type
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'booking_status' AND typtype = 'e'
  ) INTO is_enum;

  IF is_enum THEN
    -- Enum case: append the new value if not already there
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'booking_status' AND e.enumlabel = 'checked_out'
    ) THEN
      EXECUTE 'ALTER TYPE booking_status ADD VALUE ''checked_out''';
    END IF;
  ELSE
    -- CHECK constraint case: drop and recreate with the additional value
    DECLARE
      cname TEXT;
    BEGIN
      SELECT con.conname INTO cname
        FROM pg_constraint con
        JOIN pg_class    rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid  = rel.relnamespace
       WHERE rel.relname = 'bookings'
         AND ns.nspname  = 'public'
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%status%'
       LIMIT 1;
      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', cname);
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
          CHECK (status IN ('draft','sent','confirmed','cancelled','checked_out'));
      END IF;
    END;
  END IF;
END $$;
