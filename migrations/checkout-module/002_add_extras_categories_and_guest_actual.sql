-- =====================================================================
-- Checkout — 002: extras charge categories + actual guest count fields
-- =====================================================================
-- Idempotent.
-- =====================================================================

-- 1. Seed two new charge categories used for upsales / extras
INSERT INTO charge_categories (slug, display_name, display_order) VALUES
  ('room_upsale', 'Room Upsale',  6),
  ('extra_guest', 'Extra Guest',  7)
ON CONFLICT (slug) DO NOTHING;

-- 2. Actual-guest-count audit fields on checkouts
--    Pure audit — these don't change billing math automatically.
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS actual_adults   INT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS actual_children INT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS guest_reduction_reason TEXT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS guest_reduction_recorded_by UUID;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS guest_reduction_recorded_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_actual_guest_nonneg') THEN
    ALTER TABLE checkouts ADD CONSTRAINT checkouts_actual_guest_nonneg
      CHECK ((actual_adults IS NULL OR actual_adults >= 0)
         AND (actual_children IS NULL OR actual_children >= 0));
  END IF;
END $$;
