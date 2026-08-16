-- ─────────────────────────────────────────────────────────────────────────────
-- Kitchen module · 010 — delivery charge on a delivery
--
-- Vendors sometimes charge for bringing the goods (van fare, rickshaw).
-- Recorded at receiving time on the delivery itself; total_amount includes
-- it, so the bill message, ledger and outstanding all carry it automatically.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE kitchen_deliveries
  ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0;
