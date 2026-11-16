-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 002 — bringing past paper records into the system
--
-- Requisitions signed on paper before the system: entered by the admin as
-- already approved (from_paper), with the names written on the slip and a
-- photo of it. Their bills and payments are entered with them; past cash
-- payments carry no float_holder, so nobody's current cash in hand changes.
-- 'before_system' = one lump of labour/food/other spent before the system.
-- Landscaping tables only. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS from_paper        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS paper_prepared_by TEXT;
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS paper_checked_by  TEXT;
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS paper_approved_by TEXT;
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS slip_photo_path   TEXT;

ALTER TABLE ls_expenses DROP CONSTRAINT IF EXISTS ls_expenses_category_check;
ALTER TABLE ls_expenses ADD CONSTRAINT ls_expenses_category_check
  CHECK (category IN ('labour','food','transport','tools','other','before_system'));

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
      'room_prices_changed','revenue_display_changed',
      'sessions_revoked','password_reset',
      'change_requested','change_request_decided',
      'landscaping_over_budget','landscaping_money_changed','landscaping_past_entry'
    ));
END $$;
