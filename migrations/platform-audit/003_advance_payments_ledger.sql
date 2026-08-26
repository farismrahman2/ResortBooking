-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 003 — advances arrive in instalments
--
-- An advance is not one payment. A guest sends ৳20,000 by bKash on the 3rd,
-- then ৳15,000 by bank transfer on the 9th. One `advance_paid` number with one
-- method could not express that: the second instalment either overwrote the
-- first method or vanished into an untraceable lump.
--
-- Each instalment now gets its own row — amount, method, WHEN it arrived
-- (date and time), and the transaction reference. `bookings.advance_paid`
-- stays as the denormalised total (the pricing engine and every "remaining"
-- calculation read it) and is recomputed from these rows on every change.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_advance_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN
                ('bkash', 'bank_transfer', 'cash', 'nagad', 'rocket', 'card', 'other')),
  /** When the money actually arrived — date AND time, not when it was typed. */
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference   TEXT,
  notes       TEXT,
  recorded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advance_payments_booking ON booking_advance_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_paid_at ON booking_advance_payments(paid_at);

ALTER TABLE booking_advance_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'booking_advance_payments' AND policyname = 'p_advance_payments_auth'
  ) THEN
    CREATE POLICY p_advance_payments_auth ON booking_advance_payments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Backfill: every booking that already holds an advance becomes one instalment,
-- carrying the method recorded on it (bKash unless stated) and dated to when
-- the booking was made. Safe to re-run — bookings with rows are skipped.
INSERT INTO booking_advance_payments (booking_id, amount, method, paid_at, notes)
SELECT b.id, b.advance_paid,
       COALESCE(NULLIF(b.advance_method, ''), 'bkash'),
       b.created_at,
       'Recorded before instalment tracking existed'
FROM bookings b
WHERE b.advance_paid > 0
  AND NOT EXISTS (
    SELECT 1 FROM booking_advance_payments p WHERE p.booking_id = b.id
  );
