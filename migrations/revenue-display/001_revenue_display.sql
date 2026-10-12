-- ─────────────────────────────────────────────────────────────────────────────
-- Revenue display · 001 — the revenue figure staff see
--
-- Only the admin sees real revenue. Everyone else sees, on the dashboard, the
-- month's room-booking revenue × the percentage the admin set for that month
-- (lib/revenue/display.ts). A month with no row uses the latest earlier
-- month's percentage; no rows at all = 100%.
--
-- The table is readable by NO logged-in user — RLS on, no policies — only the
-- server (service role) reads it, after checking the caller is an admin.
-- Changes are logged to the Audit Log (revenue_display_changed).
--
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS revenue_display_rules (
  month       DATE         PRIMARY KEY,              -- first day of the month
  pct         NUMERIC(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  updated_by  UUID,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT revenue_display_rules_first_of_month CHECK (month = date_trunc('month', month)::date)
);

ALTER TABLE revenue_display_rules ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: authenticated users can neither read nor write.

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
      'room_prices_changed','revenue_display_changed'
    ));
END $$;
