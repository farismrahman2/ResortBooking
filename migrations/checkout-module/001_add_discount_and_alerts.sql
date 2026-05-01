-- =====================================================================
-- Checkout — 001: discount fields on checkouts + admin_alerts table
-- =====================================================================
-- Idempotent.
-- =====================================================================

-- 1. Discount fields on the checkout row
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS discount_pct    NUMERIC(5,2)  NOT NULL DEFAULT 0;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS discount_applied_by UUID;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS discount_applied_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkouts_discount_nonneg'
  ) THEN
    ALTER TABLE checkouts ADD CONSTRAINT checkouts_discount_nonneg
      CHECK (discount_amount >= 0 AND discount_pct >= 0 AND discount_pct <= 100);
  END IF;
END $$;

-- 2. admin_alerts — surfaces flagged events for admin review
CREATE TABLE IF NOT EXISTS admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'discount_applied','guest_reduced','checkout_voided',
    'refund_recorded','booking_cancelled','user_deactivated'
  )),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_unack ON admin_alerts(acknowledged_at) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type  ON admin_alerts(event_type, created_at DESC);

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_alerts' AND policyname='p_admin_alerts_auth')
    THEN CREATE POLICY p_admin_alerts_auth ON admin_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;
