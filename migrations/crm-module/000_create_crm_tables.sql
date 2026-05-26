-- =====================================================================
-- Corporate Sales CRM (GCR Edition) — Phase 1 Schema
-- Mirrors the idempotent style of migrations/coffee-shop-module/000_*.sql
-- =====================================================================
-- Corrections vs. original spec (all confirmed):
--  * roles_slug_check INCLUDES 'reservation' (added in auth 003) — omitting
--    it would throw on DBs that ran 003, or silently drop reservation support
--  * crm module display_order = 11 (9=coffee_shop, 10=inventory)
--  * new role display_order shifted to 6/7/8 (reservation already owns 5)
-- =====================================================================

-- 0a. Extend roles slug CHECK to include the 3 new roles (keep reservation!)
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE roles ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('admin','manager','front_desk','accountant','reservation','corporate_sales','operations_manager','md'));

INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('corporate_sales',    'Corporate Sales',    'CRM accounts, contacts, pipeline, activities (sees own by default)', 6),
  ('operations_manager', 'Operations Manager', 'Sees Won opportunities and confirmed bookings; operational handoff', 7),
  ('md',                 'Managing Director',  'Full read access to CRM + bookings + reports for oversight', 8)
ON CONFLICT (slug) DO NOTHING;

-- 0b. Register `crm` module + seed permissions
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('crm', 'Corporate Sales', 'B2B accounts, contacts, opportunities, activities, KPIs', 11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'corporate_sales'    THEN 'write'
    WHEN 'operations_manager' THEN 'read'
    WHEN 'md'                 THEN 'read'
    WHEN 'accountant'         THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'crm'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 0c. Extend user_profiles with sales_start_date (for relative KPI targets)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS sales_start_date DATE;

-- 1. crm_sectors
CREATE TABLE IF NOT EXISTS crm_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO crm_sectors (slug, display_name, display_order) VALUES
  ('banking',      'Banking',           1),
  ('pharma',       'Pharma',            2),
  ('telco',        'Telco',             3),
  ('mnc_fmcg',     'MNC / FMCG',        4),
  ('ngo_dev',      'NGO / Development', 5),
  ('govt_embassy', 'Govt / Embassy',    6),
  ('it_tech',      'IT / Tech',         7),
  ('other',        'Other',             99)
ON CONFLICT (slug) DO NOTHING;

-- 2. crm_tiers
CREATE TABLE IF NOT EXISTS crm_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug IN ('a','b','c')),
  display_name TEXT NOT NULL,
  default_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_discount_pct BETWEEN 0 AND 100),
  description TEXT,
  display_order INT NOT NULL DEFAULT 0
);

INSERT INTO crm_tiers (slug, display_name, default_discount_pct, description, display_order) VALUES
  ('a', 'Tier A — Strategic',  15, 'Highest value accounts (banks, MNCs). Pre-approved 15% corporate discount.', 1),
  ('b', 'Tier B — Growth',     10, 'Mid-value accounts with growth potential. Pre-approved 10% discount.', 2),
  ('c', 'Tier C — Standard',    5, 'Smaller accounts. Pre-approved 5% discount.', 3)
ON CONFLICT (slug) DO NOTHING;

-- 3. crm_accounts (parent/child hierarchy)
CREATE TABLE IF NOT EXISTS crm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT UNIQUE NOT NULL,
  parent_account_id UUID REFERENCES crm_accounts(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  sector_id UUID REFERENCES crm_sectors(id),
  tier_id UUID REFERENCES crm_tiers(id),
  hq_location TEXT,
  branch_presence TEXT,
  approx_employees INT,
  status TEXT NOT NULL DEFAULT 'target'
    CHECK (status IN ('target','contacted','existing','lapsed','won_client','lost')),
  owner_user_id UUID REFERENCES auth.users(id),
  last_engaged_at TIMESTAMPTZ,
  next_action TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_accounts_status ON crm_accounts(status);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_owner ON crm_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_parent ON crm_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_sector ON crm_accounts(sector_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_tier ON crm_accounts(tier_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_active ON crm_accounts(is_active);

-- 4. crm_contacts
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  designation TEXT,
  department TEXT CHECK (department IS NULL OR department IN (
    'hr','l_and_d','admin','procurement','csr','marketing','operations','finance','other'
  )),
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  office_location TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  linkedin_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_account ON crm_contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_active ON crm_contacts(is_active);

-- 5. Extend history_log entity_type CHECK (superset incl. inventory + crm)
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity'
  ));

-- 6. RLS (per-record visibility is enforced in the query layer, not RLS)
ALTER TABLE crm_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_sectors' AND policyname='crm_sectors_all') THEN
    CREATE POLICY crm_sectors_all ON crm_sectors FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_tiers' AND policyname='crm_tiers_all') THEN
    CREATE POLICY crm_tiers_all ON crm_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_accounts' AND policyname='crm_accounts_all') THEN
    CREATE POLICY crm_accounts_all ON crm_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_contacts' AND policyname='crm_contacts_all') THEN
    CREATE POLICY crm_contacts_all ON crm_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verify
SELECT 'crm_sectors' AS table_name, COUNT(*) AS row_count FROM crm_sectors
UNION ALL SELECT 'crm_tiers',    COUNT(*) FROM crm_tiers
UNION ALL SELECT 'crm_accounts', COUNT(*) FROM crm_accounts
UNION ALL SELECT 'crm_contacts', COUNT(*) FROM crm_contacts
UNION ALL SELECT 'new_roles', (SELECT COUNT(*) FROM roles WHERE slug IN ('corporate_sales','operations_manager','md'));
