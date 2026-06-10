-- ============================================================================
-- CRM module performance indexes.
--
-- The CRM module was slow because:
--   - crm_compute_kpi_actuals() runs 9 UNION ALL counts that scan
--     crm_opportunities, crm_activities, crm_accounts with date + owner filters
--     that have no composite index → full table scans on every dashboard load.
--   - Pipeline list filters by stage + sorts by updated_at → no covering index.
--   - Activity feed filters by activity_date + logged_by → no covering index.
--
-- All indexes are `IF NOT EXISTS` and safe to re-run.
-- ============================================================================

-- crm_opportunities — KPI counts by owner + won_at, plus pipeline list by stage
CREATE INDEX IF NOT EXISTS idx_crm_opps_owner_won
  ON crm_opportunities(owner_user_id, won_at)
  WHERE won_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_opps_owner_created
  ON crm_opportunities(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_opps_stage_updated
  ON crm_opportunities(stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_opps_account
  ON crm_opportunities(account_id);

-- crm_activities — KPI counts by logged_by + activity_date, plus feed lookups
CREATE INDEX IF NOT EXISTS idx_crm_activities_user_date
  ON crm_activities(logged_by, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activities_type_date
  ON crm_activities(activity_type, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activities_account_date
  ON crm_activities(account_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact
  ON crm_activities(contact_id)
  WHERE contact_id IS NOT NULL;

-- crm_accounts — recent accounts widget + created_at sort + owner filter
CREATE INDEX IF NOT EXISTS idx_crm_accounts_owner_created
  ON crm_accounts(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_accounts_created
  ON crm_accounts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_accounts_engaged
  ON crm_accounts(last_engaged_at DESC NULLS LAST);

-- crm_contacts — account_id lookups for decorateAccounts()
CREATE INDEX IF NOT EXISTS idx_crm_contacts_account
  ON crm_contacts(account_id);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_primary
  ON crm_contacts(account_id, is_primary)
  WHERE is_primary = true;

-- crm_kpi_targets — the UNIQUE constraint (user_id, metric, period_days)
-- already creates a covering index for the lookup pattern, no extra index
-- needed. (period_days is an integer 30/60/90, not a date.)

-- Refresh planner stats so the indexes get picked up immediately
ANALYZE crm_opportunities;
ANALYZE crm_activities;
ANALYZE crm_accounts;
ANALYZE crm_contacts;
ANALYZE crm_kpi_targets;

-- Sanity check: list the new indexes
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename LIKE 'crm_%'
 ORDER BY tablename, indexname;
