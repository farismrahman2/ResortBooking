-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 004 — payment slips on every payment
--
-- Each payment can carry a photo/PDF of the payment slip (receipt / challan)
-- and remarks. "Uploaded by / at" are the existing created_by / created_at.
-- Corrections record who changed it last. Landscaping tables only.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ls_bill_payments ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE ls_bill_payments ADD COLUMN IF NOT EXISTS note       TEXT;
ALTER TABLE ls_bill_payments ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE ls_bill_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ls_bill_payments_pay_date ON ls_bill_payments (pay_date);
