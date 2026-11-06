-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 008 — change requests from Corporate Sales
--
-- Corporate Sales edit guest details, headcount, rooms and dates on bookings
-- they made themselves. Anything touching money — a discount, a price, an
-- advance, cancelling — is a request here, decided by the admin
-- (Settings → Change requests).
--
-- Rules: anyone may file a request on a booking they made, and read their own
-- requests; only Settings writers (the admin) read all and decide them.
-- Nobody deletes. One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_change_requests (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID         NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by   UUID         NOT NULL DEFAULT auth.uid(),
  kind           TEXT         NOT NULL CHECK (kind IN ('discount', 'cancel', 'advance', 'other')),
  details        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  note           TEXT,
  status         TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by     UUID,
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_change_requests_pending ON booking_change_requests (created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS booking_change_requests_booking ON booking_change_requests (booking_id);

ALTER TABLE booking_change_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_change_requests' AND policyname = 'bcr_read') THEN
    CREATE POLICY bcr_read ON booking_change_requests FOR SELECT TO authenticated
      USING (requested_by = auth.uid() OR (SELECT public.app_can('settings', 'write')));
    CREATE POLICY bcr_insert ON booking_change_requests FOR INSERT TO authenticated
      WITH CHECK (requested_by = auth.uid() AND status = 'pending'
        AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.created_by = auth.uid()));
    CREATE POLICY bcr_decide ON booking_change_requests FOR UPDATE TO authenticated
      USING ((SELECT public.app_can('settings', 'write'))) WITH CHECK ((SELECT public.app_can('settings', 'write')));
  END IF;
END $$;

-- Audit Log events.
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
      'change_requested','change_request_decided'
    ));
END $$;
