-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 002 — how the advance was received
--
-- Advances used to have no method at all; reports assumed bKash. From now the
-- quote (and the booking it becomes) records whether the advance arrived via
-- bKash or bank transfer, so "money received by method" splits them truly.
-- Existing rows default to bKash — historically accurate for this resort.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS advance_method TEXT NOT NULL DEFAULT 'bkash';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_method TEXT NOT NULL DEFAULT 'bkash';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_advance_method_check') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_advance_method_check
      CHECK (advance_method IN ('bkash', 'bank_transfer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_advance_method_check') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_advance_method_check
      CHECK (advance_method IN ('bkash', 'bank_transfer'));
  END IF;
END $$;
