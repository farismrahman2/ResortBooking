-- ─────────────────────────────────────────────────────────────────────────────
-- VAT · 001 — a VAT percentage on every quote and booking
--
-- Works like the service charge: default 0, set per quote/booking, applies to
-- every package and booking type. The calculator adds a "VAT (x%)" line only
-- when it is above 0, on the bill including the service charge. Decimals are
-- allowed (7.5%). Existing rows get 0, so no bill changes.
--
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS vat_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vat_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_vat_pct_range') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_vat_pct_range CHECK (vat_pct >= 0 AND vat_pct <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_vat_pct_range') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_vat_pct_range CHECK (vat_pct >= 0 AND vat_pct <= 100);
  END IF;
END $$;
