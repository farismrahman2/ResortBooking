-- =====================================================================
-- Corporate Sales CRM — Phase 4: KPI tracker (30/60/90-day)
-- Run after 002_link_opportunity_to_booking.sql. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS crm_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN (
    'accounts_mapped','contacts_identified','meetings_booked','site_inspections_held',
    'proposals_sent','deals_closed_won','closed_revenue_bdt','active_pipeline_bdt',
    'field_visits_done','linkedin_followers','repeat_corporate_clients','preferred_vendor_agreements'
  )),
  period_days INT NOT NULL CHECK (period_days IN (30, 60, 90)),
  target_value NUMERIC(14,2) NOT NULL CHECK (target_value >= 0),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, metric, period_days)
);

ALTER TABLE crm_kpi_targets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_kpi_targets' AND policyname='crm_kpi_targets_all') THEN
    CREATE POLICY crm_kpi_targets_all ON crm_kpi_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Helper: compute a rep's actuals in a date window.
CREATE OR REPLACE FUNCTION crm_compute_kpi_actuals(
  p_user_id UUID,
  p_from DATE,
  p_to DATE
) RETURNS TABLE (metric TEXT, actual_value NUMERIC) AS $$
  SELECT 'accounts_mapped', COUNT(*)::NUMERIC
    FROM crm_accounts
   WHERE owner_user_id = p_user_id AND created_at::date BETWEEN p_from AND p_to
  UNION ALL SELECT 'contacts_identified', COUNT(c.*)::NUMERIC
    FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id
   WHERE a.owner_user_id = p_user_id AND c.created_at::date BETWEEN p_from AND p_to
  UNION ALL SELECT 'meetings_booked', COUNT(*)::NUMERIC
    FROM crm_activities
   WHERE logged_by = p_user_id AND activity_type IN ('meeting','site_visit') AND activity_date BETWEEN p_from AND p_to
  UNION ALL SELECT 'site_inspections_held', COUNT(*)::NUMERIC
    FROM crm_activities
   WHERE logged_by = p_user_id AND activity_type = 'site_visit' AND activity_date BETWEEN p_from AND p_to
  UNION ALL SELECT 'proposals_sent', COUNT(*)::NUMERIC
    FROM crm_activities
   WHERE logged_by = p_user_id AND activity_type = 'proposal_sent' AND activity_date BETWEEN p_from AND p_to
  UNION ALL SELECT 'deals_closed_won', COUNT(*)::NUMERIC
    FROM crm_opportunities
   WHERE owner_user_id = p_user_id AND stage = 'won' AND won_at::date BETWEEN p_from AND p_to
  UNION ALL SELECT 'closed_revenue_bdt', COALESCE(SUM(actual_value),0)::NUMERIC
    FROM crm_opportunities
   WHERE owner_user_id = p_user_id AND stage = 'won' AND won_at::date BETWEEN p_from AND p_to
  UNION ALL SELECT 'active_pipeline_bdt', COALESCE(SUM(est_value),0)::NUMERIC
    FROM crm_opportunities
   WHERE owner_user_id = p_user_id AND stage NOT IN ('won','lost') AND is_active = true
  UNION ALL SELECT 'field_visits_done', COUNT(*)::NUMERIC
    FROM crm_activities
   WHERE logged_by = p_user_id AND activity_type = 'field_visit' AND activity_date BETWEEN p_from AND p_to;
$$ LANGUAGE sql STABLE;

SELECT 'crm_kpi_targets' AS table_name, COUNT(*) AS row_count FROM crm_kpi_targets;
