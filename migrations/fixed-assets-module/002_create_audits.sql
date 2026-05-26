-- =====================================================================
-- Fixed Assets Module — Phase 3: annual physical audit
-- Run after 001_create_depreciation_views.sql. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS fa_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_number TEXT UNIQUE NOT NULL,
  audit_year INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','finalized','cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  conducted_by UUID REFERENCES auth.users(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS fa_audit_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES fa_audits(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES fa_assets(id),
  expected_location_id UUID REFERENCES fa_locations(id),
  found BOOLEAN,
  found_at_location_id UUID REFERENCES fa_locations(id),
  found_condition TEXT CHECK (found_condition IS NULL OR found_condition IN (
    'excellent','good','fair','poor','needs_repair','out_of_service'
  )),
  variance_notes TEXT,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  UNIQUE(audit_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_fa_audit_lines_audit ON fa_audit_lines(audit_id);

ALTER TABLE fa_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_audit_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_audits' AND policyname='fa_audits_all') THEN
    CREATE POLICY fa_audits_all ON fa_audits FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fa_audit_lines' AND policyname='fa_audit_lines_all') THEN
    CREATE POLICY fa_audit_lines_all ON fa_audit_lines FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

SELECT 'fa_audits' AS table_name, COUNT(*) FROM fa_audits
UNION ALL SELECT 'fa_audit_lines', COUNT(*) FROM fa_audit_lines;
