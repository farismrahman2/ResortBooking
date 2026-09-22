-- ─────────────────────────────────────────────────────────────────────────────
-- Checkout module · 005 — every change after submission lands in the Audit Log
--
-- Three new audit events:
--   advance_corrected  a logged advance instalment was changed (amount, tender,
--                      date, account or reference) — before and after are kept
--   advance_removed    a logged advance instalment was deleted
--   booking_edited     a confirmed booking (or confirmed quote) was changed
--                      after submission — details, rooms, dates, advance total,
--                      room swaps, sales rep
--
-- admin_alerts.event_type is guarded by a CHECK constraint, so the list has to
-- grow here. Until this runs, the app still records those changes in the
-- booking history; the Audit Log entry is simply skipped (non-fatal).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'admin_alerts'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_alerts DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_event_type_check
    CHECK (event_type IN (
      'discount_applied','guest_reduced','checkout_voided',
      'refund_recorded','booking_cancelled','booking_no_show','user_deactivated',
      'due_overdue',
      'advance_corrected','advance_removed','booking_edited'
    ));
END $$;
