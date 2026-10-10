-- ─────────────────────────────────────────────────────────────────────────────
-- Room prices · 001 — the Room Prices grid
--
-- The grid (Settings → Room prices) edits package_room_prices, which already
-- has one row per (package, room type) — no table change. Every save logs a
-- `room_prices_changed` alert, so the Audit Log learns that event. All
-- earlier events stay allowed.
--
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

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
      'room_block_created','room_block_changed','room_block_released',
      'room_prices_changed'
    ));
END $$;
