-- ============================================================================
-- Kitchen module · 002 — a settable default price per item
--
-- inv_items already carries last_purchase_price and avg_purchase_price, but
-- both are DERIVED from receipts: nobody can type into them, and they stay
-- null until an item has been bought at least once through Inventory. The
-- kitchen needs a rate it can state up front — the vegetable supplier's
-- standing price for pumpkin — so the bill message and the delivery screen
-- can pre-fill instead of asking for the same number every week.
--
-- Nullable on purpose. Most items have no fixed rate (fish moves daily); only
-- the ones with a standing price get a value.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

ALTER TABLE inv_items
  ADD COLUMN IF NOT EXISTS default_unit_price NUMERIC(12,2);

COMMENT ON COLUMN inv_items.default_unit_price IS
  'Standing rate per unit, typed by a human. Unlike last_purchase_price this is '
  'not derived from receipts — it seeds the price on a new order and can be '
  'overridden per delivery.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_items_default_unit_price_nonneg'
  ) THEN
    ALTER TABLE inv_items
      ADD CONSTRAINT inv_items_default_unit_price_nonneg
      CHECK (default_unit_price IS NULL OR default_unit_price >= 0);
  END IF;
END $$;
