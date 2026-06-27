-- =====================================================================
-- Corporate Daily Snapshot — archive of the per-day corporate summary
-- =====================================================================
-- Idempotent — safe to re-run.
-- One row per Asia/Dhaka calendar day. Written by the scheduled job
-- (app/api/cron/corporate-snapshot) and read by the Reports → Corporate
-- summary page. The full computed summary lives in `payload` (JSONB);
-- the top-line columns are denormalized for fast archive listing/sorting.
-- =====================================================================

CREATE TABLE IF NOT EXISTS corporate_daily_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by  UUID,                       -- NULL = produced by the scheduled job

  -- Denormalized top-line metrics (for the archive list, no JSON parsing needed)
  corporate_bookings      INT          NOT NULL DEFAULT 0,
  corporate_revenue       NUMERIC(14,2) NOT NULL DEFAULT 0,
  collected               NUMERIC(14,2) NOT NULL DEFAULT 0,
  outstanding             NUMERIC(14,2) NOT NULL DEFAULT 0,
  companies_count         INT          NOT NULL DEFAULT 0,
  opportunities_won       INT          NOT NULL DEFAULT 0,
  opportunities_won_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  activities_logged       INT          NOT NULL DEFAULT 0,
  open_pipeline_weighted  NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Full computed summary (by-company breakdown, corp-vs-retail, activity-by-type, …)
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corp_daily_snapshots_date
  ON corporate_daily_snapshots(snapshot_date DESC);

-- updated_at trigger (set_updated_at() defined in earlier migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_corp_daily_snapshots_updated_at') THEN
    CREATE TRIGGER trg_corp_daily_snapshots_updated_at
      BEFORE UPDATE ON corporate_daily_snapshots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- RLS — single-tenant: any authenticated user may read/write (mirrors other tables).
-- The scheduled job uses the service-role key, which bypasses RLS.
ALTER TABLE corporate_daily_snapshots ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'corporate_daily_snapshots'
       AND policyname = 'p_corp_daily_snapshots_auth'
  ) THEN
    CREATE POLICY p_corp_daily_snapshots_auth ON corporate_daily_snapshots
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
