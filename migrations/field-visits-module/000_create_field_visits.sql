-- =====================================================================
-- Field Visit Capture — Form GCR-CS-01 Rev 4.0
-- =====================================================================
-- Digitises the one-page paper lead-discovery form that field sales reps
-- fill in at the prospect's office. Every column carries its paper field
-- code (VIS.01, ORG.03, REQ.07, OUT.02 …) as a COMMENT — those codes are
-- the contract between the paper form and this schema, so a paper form
-- can still be keyed in by hand from the back-office view.
--
-- RELATIONSHIP TO crm_activities (important):
--   crm_activities already has 'field_visit' as an activity_type, and the
--   KPI RPC crm_compute_kpi_actuals counts 'field_visits_done' from it.
--   We do NOT fork that. crm_activities.account_id is NOT NULL, so it
--   structurally cannot hold a COLD visit to an org that isn't in the CRM
--   yet — which is this form's primary use case. So:
--     * crm_field_visits owns the ~40 discovery fields, account_id NULLABLE
--     * on processVisitToCrm() (once an account exists) we insert the
--       matching crm_activities row, keeping the existing KPI intact.
--   That deferral is why this migration does not touch crm_activities.
--
-- Soft delete only — `status`/`is_active`, never DELETE.
-- Idempotent: safe to run repeatedly.
-- =====================================================================

-- 1. Register `field_visits` module + seed per-role permissions -----------
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('field_visits', 'Field Visits', 'Field sales lead-discovery visits (Form GCR-CS-01)', 16)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'corporate_sales'    THEN 'write'
    WHEN 'operations_manager' THEN 'write'
    WHEN 'md'                 THEN 'write'
    WHEN 'reservation'        THEN 'read'
    WHEN 'front_desk'         THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'field_visits'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 2. Sectors — reuse crm_sectors, add the two the paper form needs -------
-- The paper form's 8 placeholder labels were unconfirmed; the CRM list is
-- authoritative. Two genuinely had no equivalent and matter in Bangladesh.
INSERT INTO crm_sectors (slug, display_name, display_order) VALUES
  ('rmg_textiles', 'RMG / Textiles', 8),
  ('education',    'Education',      9)
ON CONFLICT (slug) DO NOTHING;

-- 3. Lookup tables for the unconfirmed bands -----------------------------
-- Deliberately editable rows, NOT Postgres enums, so bands can change
-- without a migration (§2.2 of the build brief).
CREATE TABLE IF NOT EXISTS crm_fv_employee_bands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  sort_order    INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_fv_employee_bands IS 'ORG.04 employee-count bands — editable, not an enum';

INSERT INTO crm_fv_employee_bands (code, label, sort_order) VALUES
  ('lt_100',    'Under 100',      1),
  ('100_500',   '100 – 500',      2),
  ('500_2000',  '500 – 2,000',    3),
  ('gt_2000',   '2,000+',         4)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_fv_budget_bands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  sort_order    INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_fv_budget_bands IS 'REQ.06 budget-per-head bands (BDT) — editable, not an enum';

INSERT INTO crm_fv_budget_bands (code, label, sort_order) VALUES
  ('lt_800',       'Under 800',        1),
  ('800_1200',     '800 – 1,200',      2),
  ('1201_1800',    '1,201 – 1,800',    3),
  ('1801_2500',    '1,801 – 2,500',    4),
  ('gt_2500',      '2,500+',           5),
  ('not_disclosed','Not disclosed',    99)
ON CONFLICT (code) DO NOTHING;

-- 4. crm_field_visits (parent) -------------------------------------------
CREATE TABLE IF NOT EXISTS crm_field_visits (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_ref              TEXT UNIQUE NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','submitted','processed','void')),

  -- Section A — Visit
  visit_date             DATE,
  sales_executive_id     UUID REFERENCES employees(id),
  territory_zone         TEXT,
  visit_type             TEXT CHECK (visit_type IS NULL OR visit_type IN
                           ('cold_visit','appointment','follow_up','referral')),

  -- Section B — Organisation
  organisation_name      TEXT,
  office_address         TEXT,
  sector_id              UUID REFERENCES crm_sectors(id),
  employee_band          TEXT REFERENCES crm_fv_employee_bands(code),

  -- Section C — Contacts (see child table) + decision context
  decision_signoff       TEXT[] NOT NULL DEFAULT '{}',
  best_time_to_call      TEXT,
  preferred_channel      TEXT[] NOT NULL DEFAULT '{}',

  -- Section D — Requirements
  event_types            TEXT[] NOT NULL DEFAULT '{}',
  events_per_year        TEXT,
  typical_headcount      TEXT,
  event_format           TEXT[] NOT NULL DEFAULT '{}',
  preferred_day          TEXT[] NOT NULL DEFAULT '{}',
  budget_per_head_band   TEXT REFERENCES crm_fv_budget_bands(code),
  rooms_needed           INTEGER CHECK (rooms_needed IS NULL OR rooms_needed >= 0),
  annual_event_spend     NUMERIC(14,2) CHECK (annual_event_spend IS NULL OR annual_event_spend >= 0),
  peak_months            TEXT[] NOT NULL DEFAULT '{}',
  transport              TEXT[] NOT NULL DEFAULT '{}',

  -- Section F — Outcome
  interest_level         TEXT CHECK (interest_level IS NULL OR interest_level IN ('hot','warm','cold')),
  materials_given        TEXT[] NOT NULL DEFAULT '{}',
  next_event_month       TEXT,
  next_event_type        TEXT,
  next_event_pax         INTEGER CHECK (next_event_pax IS NULL OR next_event_pax >= 0),
  next_step              TEXT[] NOT NULL DEFAULT '{}',
  due_by                 DATE,
  follow_up_owner_id     UUID REFERENCES employees(id),

  -- CRM handoff
  account_id             UUID REFERENCES crm_accounts(id) ON DELETE SET NULL,
  pipeline_stage         TEXT,
  discount_tier          TEXT CHECK (discount_tier IS NULL OR discount_tier IN ('a','b','c')),
  crm_activity_id        UUID REFERENCES crm_activities(id) ON DELETE SET NULL,
  processed_by           UUID REFERENCES employees(id),
  processed_at           TIMESTAMPTZ,

  -- Submit metadata
  gps_lat                NUMERIC(10,6),
  gps_lng                NUMERIC(10,6),
  submitted_at           TIMESTAMPTZ,
  void_reason            TEXT,

  created_by             UUID REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Paper field codes — the contract with Form GCR-CS-01 Rev 4.0
COMMENT ON COLUMN crm_field_visits.visit_type           IS 'VIS.01 visit type';
COMMENT ON COLUMN crm_field_visits.organisation_name    IS 'ORG.01 organisation name';
COMMENT ON COLUMN crm_field_visits.office_address       IS 'ORG.02 office address';
COMMENT ON COLUMN crm_field_visits.sector_id            IS 'ORG.03 sector (FK crm_sectors)';
COMMENT ON COLUMN crm_field_visits.employee_band        IS 'ORG.04 employee-count band';
COMMENT ON COLUMN crm_field_visits.decision_signoff     IS 'CON.04 who signs off';
COMMENT ON COLUMN crm_field_visits.best_time_to_call    IS 'CON.05 best time to call';
COMMENT ON COLUMN crm_field_visits.preferred_channel    IS 'CON.06 preferred contact channel';
COMMENT ON COLUMN crm_field_visits.event_types          IS 'REQ.01 event types (12 options)';
COMMENT ON COLUMN crm_field_visits.events_per_year      IS 'REQ.02 events per year';
COMMENT ON COLUMN crm_field_visits.typical_headcount    IS 'REQ.03 typical headcount';
COMMENT ON COLUMN crm_field_visits.event_format         IS 'REQ.04 event format';
COMMENT ON COLUMN crm_field_visits.preferred_day        IS 'REQ.05 preferred day';
COMMENT ON COLUMN crm_field_visits.budget_per_head_band IS 'REQ.06 budget per head band';
COMMENT ON COLUMN crm_field_visits.rooms_needed         IS 'REQ.07 rooms needed';
COMMENT ON COLUMN crm_field_visits.annual_event_spend   IS 'REQ.08 annual event spend (BDT)';
COMMENT ON COLUMN crm_field_visits.peak_months          IS 'REQ.09 peak months';
COMMENT ON COLUMN crm_field_visits.transport            IS 'REQ.10 transport';
COMMENT ON COLUMN crm_field_visits.interest_level       IS 'OUT.01 interest level';
COMMENT ON COLUMN crm_field_visits.materials_given      IS 'OUT.02 materials given';
COMMENT ON COLUMN crm_field_visits.next_event_month     IS 'OUT.03 next event month';
COMMENT ON COLUMN crm_field_visits.next_event_type      IS 'OUT.04 next event type';
COMMENT ON COLUMN crm_field_visits.next_event_pax       IS 'OUT.05 next event pax';
COMMENT ON COLUMN crm_field_visits.next_step            IS 'OUT.06 next step';
COMMENT ON COLUMN crm_field_visits.due_by               IS 'OUT.07 due by';
COMMENT ON COLUMN crm_field_visits.follow_up_owner_id   IS 'OUT.08 follow-up owner';

-- 5. crm_field_visit_contacts (child) — CON.01–03 ------------------------
CREATE TABLE IF NOT EXISTS crm_field_visit_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          UUID NOT NULL REFERENCES crm_field_visits(id) ON DELETE CASCADE,
  sort_order        INT  NOT NULL DEFAULT 0,
  name              TEXT,
  designation       TEXT,
  department        TEXT,
  mobile            TEXT,
  email             TEXT,
  is_decision_maker BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE crm_field_visit_contacts IS 'CON.01-03 people met on the visit; >=1 named contact required at submit';

-- 6. crm_field_visit_venues (child) — CMP -------------------------------
CREATE TABLE IF NOT EXISTS crm_field_visit_venues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        UUID NOT NULL REFERENCES crm_field_visits(id) ON DELETE CASCADE,
  sort_order      INT  NOT NULL DEFAULT 0,
  venue_name      TEXT,
  event_month_year TEXT,
  pax             INT CHECK (pax IS NULL OR pax >= 0),
  rate_per_head   NUMERIC(12,2) CHECK (rate_per_head IS NULL OR rate_per_head >= 0),
  feedback        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE crm_field_visit_venues IS 'CMP competitor/venue history — optional, zero rows is valid';

-- 7. Indexes -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fv_visit_date   ON crm_field_visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_fv_status       ON crm_field_visits(status);
CREATE INDEX IF NOT EXISTS idx_fv_exec         ON crm_field_visits(sales_executive_id);
CREATE INDEX IF NOT EXISTS idx_fv_account      ON crm_field_visits(account_id);
CREATE INDEX IF NOT EXISTS idx_fv_interest     ON crm_field_visits(interest_level);
CREATE INDEX IF NOT EXISTS idx_fv_due_by       ON crm_field_visits(due_by);
-- lower() index supports the duplicate-account / org-name lookup
CREATE INDEX IF NOT EXISTS idx_fv_org_name_lc  ON crm_field_visits(lower(organisation_name));
CREATE INDEX IF NOT EXISTS idx_fv_contacts_visit ON crm_field_visit_contacts(visit_id);
CREATE INDEX IF NOT EXISTS idx_fv_venues_visit   ON crm_field_visit_venues(visit_id);
-- duplicate detection types against crm_accounts.company_name
CREATE INDEX IF NOT EXISTS idx_crm_accounts_name_lc ON crm_accounts(lower(company_name));

-- 8. updated_at trigger --------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fv_updated_at') THEN
    CREATE TRIGGER trg_fv_updated_at BEFORE UPDATE ON crm_field_visits
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 9. RLS — permissive authenticated, app layer does authorisation --------
ALTER TABLE crm_field_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_field_visit_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_field_visit_venues    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_fv_employee_bands     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_fv_budget_bands       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_field_visits' AND policyname='crm_field_visits_all') THEN
    CREATE POLICY crm_field_visits_all ON crm_field_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_field_visit_contacts' AND policyname='crm_fv_contacts_all') THEN
    CREATE POLICY crm_fv_contacts_all ON crm_field_visit_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_field_visit_venues' AND policyname='crm_fv_venues_all') THEN
    CREATE POLICY crm_fv_venues_all ON crm_field_visit_venues FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_fv_employee_bands' AND policyname='crm_fv_emp_bands_all') THEN
    CREATE POLICY crm_fv_emp_bands_all ON crm_fv_employee_bands FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_fv_budget_bands' AND policyname='crm_fv_budget_bands_all') THEN
    CREATE POLICY crm_fv_budget_bands_all ON crm_fv_budget_bands FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 10. Extend history_log entity_type CHECK (full superset + new value) ---
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan','user','role',
    'checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit',
    'qa_review','menu_day',
    'crm_field_visit'
  ));

-- 11. Verify -------------------------------------------------------------
SELECT 'crm_field_visits'         AS table_name, COUNT(*) AS row_count FROM crm_field_visits
UNION ALL SELECT 'crm_field_visit_contacts', COUNT(*) FROM crm_field_visit_contacts
UNION ALL SELECT 'crm_field_visit_venues',   COUNT(*) FROM crm_field_visit_venues
UNION ALL SELECT 'employee_bands',           COUNT(*) FROM crm_fv_employee_bands
UNION ALL SELECT 'budget_bands',             COUNT(*) FROM crm_fv_budget_bands
UNION ALL SELECT 'sectors_total',            COUNT(*) FROM crm_sectors
UNION ALL SELECT 'field_visits_module',      COUNT(*) FROM modules WHERE slug = 'field_visits';
