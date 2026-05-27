-- =====================================================================
-- Corporate Sales CRM — Phase 3: Won → Booking handoff linkage
-- Run after 001_create_opportunities_activities.sql. Idempotent.
-- =====================================================================

-- Real FK for the linked booking now that we've confirmed the bookings table.
ALTER TABLE crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_linked_booking_id_fkey;
ALTER TABLE crm_opportunities
  ADD CONSTRAINT crm_opportunities_linked_booking_id_fkey
  FOREIGN KEY (linked_booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_opps_linked_booking ON crm_opportunities(linked_booking_id);

-- CRM source tracking on bookings (mirror of inventory's source_module on expenses)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source_module TEXT NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_source_module_check') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_source_module_check
      CHECK (source_module IN ('manual', 'crm_handoff', 'ota', 'walk_in', 'phone', 'other'));
  END IF;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(source_module, source_id);

SELECT 'bookings_source_module' AS check_name,
       COUNT(*) FILTER (WHERE source_module = 'crm_handoff') AS crm_handoff_bookings
  FROM bookings;
