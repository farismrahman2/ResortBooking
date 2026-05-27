-- =====================================================================
-- Inventory Module — Phase 2: Movements + expense linkage
-- Run after 000_create_inventory_tables.sql. Idempotent.
-- =====================================================================

-- 1. Seed the two expense categories inventory receipts post into.
--    Kitchen groceries → 'bazar' (BD wet-market spend pattern);
--    Housekeeping → 'materials'. Seeded here (not race-created at runtime).
INSERT INTO expense_categories (name, slug, category_group, requires_payee, display_order) VALUES
  ('Inventory Purchase - Kitchen',      'inventory_kitchen',      'bazar',     true, 50),
  ('Inventory Purchase - Housekeeping', 'inventory_housekeeping', 'materials', true, 51)
ON CONFLICT (slug) DO NOTHING;

-- 2. inv_movements (header)
CREATE TABLE IF NOT EXISTS inv_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_number TEXT UNIQUE NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'issue', 'transfer', 'adjustment')),
  movement_date DATE NOT NULL,
  store_id UUID NOT NULL REFERENCES inv_stores(id),
  transfer_to_store_id UUID REFERENCES inv_stores(id),
  CHECK (
    (movement_type = 'transfer' AND transfer_to_store_id IS NOT NULL AND transfer_to_store_id != store_id)
    OR
    (movement_type != 'transfer' AND transfer_to_store_id IS NULL)
  ),
  supplier_id UUID REFERENCES inv_suppliers(id),
  invoice_number TEXT,
  invoice_date DATE,
  expense_id UUID REFERENCES expenses(id),
  adjustment_reason TEXT CHECK (adjustment_reason IS NULL OR adjustment_reason IN (
    'breakage', 'expired', 'theft', 'loss', 'recount', 'damage', 'other'
  )),
  issued_to_department TEXT,
  total_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT,
  CHECK ((status = 'voided' AND voided_at IS NOT NULL) OR (status = 'completed' AND voided_at IS NULL)),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_date ON inv_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inv_movements_type ON inv_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_movements_store ON inv_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_status ON inv_movements(status);

-- 3. inv_movement_lines
CREATE TABLE IF NOT EXISTS inv_movement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES inv_movements(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inv_items(id),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_value NUMERIC(14, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  adjustment_direction TEXT CHECK (adjustment_direction IS NULL OR adjustment_direction IN ('increase', 'decrease')),
  notes TEXT,
  display_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inv_movement_lines_movement ON inv_movement_lines(movement_id);
CREATE INDEX IF NOT EXISTS idx_inv_movement_lines_item ON inv_movement_lines(item_id);

-- 4. RLS
ALTER TABLE inv_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_movement_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_movements' AND policyname = 'inv_movements_all') THEN
    CREATE POLICY inv_movements_all ON inv_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_movement_lines' AND policyname = 'inv_movement_lines_all') THEN
    CREATE POLICY inv_movement_lines_all ON inv_movement_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verify
SELECT 'inv_movements' AS table_name, COUNT(*) AS row_count FROM inv_movements
UNION ALL SELECT 'inv_movement_lines', COUNT(*) FROM inv_movement_lines
UNION ALL SELECT 'inventory_expense_categories',
  (SELECT COUNT(*) FROM expense_categories WHERE slug IN ('inventory_kitchen','inventory_housekeeping'));
