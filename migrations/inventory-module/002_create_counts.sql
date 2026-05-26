-- =====================================================================
-- Inventory Module — Phase 3: Physical count workflow
-- Run after 001_create_movements.sql. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS inv_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number TEXT UNIQUE NOT NULL,
  store_id UUID NOT NULL REFERENCES inv_stores(id),
  category_id UUID REFERENCES inv_categories(id),
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'finalized', 'cancelled')),
  notes TEXT,
  adjustment_movement_id UUID REFERENCES inv_movements(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_counts_store  ON inv_counts(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_status ON inv_counts(status);

CREATE TABLE IF NOT EXISTS inv_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES inv_counts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inv_items(id),
  system_qty NUMERIC(12, 3) NOT NULL,
  counted_qty NUMERIC(12, 3),
  variance NUMERIC(12, 3) GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - system_qty) STORED,
  notes TEXT,
  counted_at TIMESTAMPTZ,
  counted_by UUID REFERENCES auth.users(id),
  UNIQUE(count_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_count_lines_count ON inv_count_lines(count_id);

ALTER TABLE inv_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_count_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_counts' AND policyname = 'inv_counts_all') THEN
    CREATE POLICY inv_counts_all ON inv_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inv_count_lines' AND policyname = 'inv_count_lines_all') THEN
    CREATE POLICY inv_count_lines_all ON inv_count_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'inv_counts' AS table_name, COUNT(*) FROM inv_counts
UNION ALL SELECT 'inv_count_lines', COUNT(*) FROM inv_count_lines;
