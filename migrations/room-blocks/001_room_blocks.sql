-- ─────────────────────────────────────────────────────────────────────────────
-- Room blocks · 001 — taking rooms off sale
--
-- A block holds rooms for a date range: the whole property, whole room types,
-- specific rooms, or any mix; dates inclusive, end optional ("until further
-- notice"), optionally only on chosen weekdays. The availability engine
-- treats every active date as a full day held (lib/engine/blocks.ts), so
-- pickers, checks, the calendar and the villa all respect it.
--
-- Room types are stored as text, not the enum, so a block can name a type
-- whose migration is still pending (the Canopy rooms).
--
-- Also: the Audit Log learns three block events, and the Canopy building
-- (111–115) starts blocked until further notice — release it from
-- Settings → Room blocks when it opens.
--
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_blocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  all_rooms     BOOLEAN     NOT NULL DEFAULT false,
  room_types    TEXT[]      NOT NULL DEFAULT '{}',
  room_numbers  TEXT[]      NOT NULL DEFAULT '{}',
  start_date    DATE        NOT NULL,
  end_date      DATE,                                -- inclusive; NULL = until further notice
  weekdays      SMALLINT[],                          -- 0 = Sunday … 6 = Saturday; NULL = every day
  reason_kind   TEXT        NOT NULL DEFAULT 'other',
  reason        TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at   TIMESTAMPTZ,
  CONSTRAINT room_blocks_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT room_blocks_scope CHECK (all_rooms OR cardinality(room_types) > 0 OR cardinality(room_numbers) > 0)
);

CREATE INDEX IF NOT EXISTS idx_room_blocks_dates ON room_blocks (start_date, end_date);

ALTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_blocks' AND policyname = 'p_room_blocks_auth') THEN
    CREATE POLICY p_room_blocks_auth ON room_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Audit Log events: everything so far, plus the block events.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT con.conname INTO cname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'admin_alerts' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event_type%' LIMIT 1;
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE admin_alerts DROP CONSTRAINT %I', cname); END IF;
  ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_event_type_check
    CHECK (event_type IN (
      'discount_applied','guest_reduced','checkout_voided','refund_recorded','booking_cancelled',
      'booking_no_show','user_deactivated','due_overdue',
      'advance_corrected','advance_removed','booking_edited',
      'room_block_created','room_block_changed','room_block_released'
    ));
END $$;

-- The Canopy is not open yet.
INSERT INTO room_blocks (room_types, start_date, end_date, reason_kind, reason)
SELECT ARRAY['premium_deluxe_canopy', 'deluxe_canopy'], DATE '2026-10-01', NULL, 'not_open', 'Canopy building'
WHERE NOT EXISTS (SELECT 1 FROM room_blocks WHERE reason_kind = 'not_open' AND reason = 'Canopy building');
