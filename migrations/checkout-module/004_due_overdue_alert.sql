-- ─────────────────────────────────────────────────────────────────────────────
-- Checkout module · 004 — "this bill has gone unpaid" as a flagged event
--
-- Every other audit-log entry is written when somebody DOES something. A due
-- going stale is the opposite: nothing happens, time simply passes. So it is
-- raised by a scan rather than by an action, which means the insert has to be
-- idempotent — the scan runs daily and must not re-flag the same booking every
-- morning until someone pays.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow the new event type.
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
      'due_overdue'
    ));
END $$;

-- 2. One overdue alert per booking, ever.
--    The scan relies on this: it inserts unconditionally and lets the database
--    reject the duplicate, which is race-safe in a way that a read-then-write
--    check is not (two overlapping scans would both see "no alert yet").
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_alerts_due_overdue
  ON admin_alerts(entity_id)
  WHERE event_type = 'due_overdue';
