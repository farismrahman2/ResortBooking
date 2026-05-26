-- =====================================================================
-- Corporate Sales CRM — Phase 2: Opportunities + Activities
-- Run after 000_create_crm_tables.sql. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opp_code TEXT UNIQUE NOT NULL,
  account_id UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  primary_contact_id UUID REFERENCES crm_contacts(id),
  owner_user_id UUID REFERENCES auth.users(id),
  opportunity_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'training','conference','retreat','day_use','agm','team_outing','other'
  )),
  stage TEXT NOT NULL DEFAULT 'prospect' CHECK (stage IN (
    'prospect','contacted','meeting_scheduled','meeting_done',
    'site_inspection','proposal_sent','negotiation','won','lost','on_hold'
  )),
  probability_pct INT NOT NULL DEFAULT 10 CHECK (probability_pct BETWEEN 0 AND 100),
  pax INT CHECK (pax IS NULL OR pax > 0),
  est_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (est_value >= 0),
  weighted_value NUMERIC(14,4) GENERATED ALWAYS AS (est_value * probability_pct / 100.0) STORED,
  expected_event_date DATE,
  proposed_rate_card TEXT,
  next_action TEXT,
  won_at TIMESTAMPTZ,
  actual_value NUMERIC(12,2),
  linked_booking_id UUID,                               -- FK added in Phase 3
  lost_at TIMESTAMPTZ,
  lost_reason TEXT CHECK (lost_reason IS NULL OR lost_reason IN (
    'price','competition','went_with_inhouse','postponed','no_budget','no_decision','lost_contact','other'
  )),
  lost_notes TEXT,
  hold_resume_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opps_account ON crm_opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_opps_owner ON crm_opportunities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_event_date ON crm_opportunities(expected_event_date);

CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call','email','whatsapp','meeting','site_visit','proposal_sent','field_visit','linkedin','other'
  )),
  activity_date DATE NOT NULL,
  duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  subject TEXT NOT NULL,
  notes TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('positive','neutral','negative')),
  next_step TEXT,
  next_step_date DATE,
  logged_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_account ON crm_activities(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_opp ON crm_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date ON crm_activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_crm_activities_logged_by ON crm_activities(logged_by);
CREATE INDEX IF NOT EXISTS idx_crm_activities_next_step_date ON crm_activities(next_step_date);

ALTER TABLE crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_opportunities' AND policyname='crm_opportunities_all') THEN
    CREATE POLICY crm_opportunities_all ON crm_opportunities FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_activities' AND policyname='crm_activities_all') THEN
    CREATE POLICY crm_activities_all ON crm_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'crm_opportunities' AS table_name, COUNT(*) FROM crm_opportunities
UNION ALL SELECT 'crm_activities', COUNT(*) FROM crm_activities;
