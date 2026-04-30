-- =====================================================================
-- Auth & Roles Module — Phase 1 Schema
-- =====================================================================
-- Idempotent — safe to re-run.
-- Pre-requisite: run after the expense module migrations (extends history_log).
-- =====================================================================

-- 1. roles (predefined; cannot be deleted, cannot be renamed) ------------
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug IN ('admin','manager','front_desk','accountant')),
  display_name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('admin',      'Admin',       'Full system access including settings and roles', 1),
  ('manager',    'Manager',     'Operational oversight: bookings, checkout, expenses, HR view', 2),
  ('front_desk', 'Front Desk',  'Bookings and guest checkout', 3),
  ('accountant', 'Accountant',  'Expenses and financial reports', 4)
ON CONFLICT (slug) DO NOTHING;

-- 2. modules (the resources permissions apply to) -----------------------
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0
);

INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('bookings',  'Bookings',  'Reservations, calendar, guest records', 1),
  ('checkout',  'Checkout',  'Guest checkout, charges, payments', 2),
  ('expenses',  'Expenses',  'Operating expenses, vendors, P&L', 3),
  ('hr',        'HR',        'Employees, attendance, payroll', 4),
  ('reports',   'Reports',   'Analytics and dashboards', 5),
  ('settings',  'Settings',  'Users, roles, charge catalog, system config', 6)
ON CONFLICT (slug) DO NOTHING;

-- 3. role_permissions (level per role per module) -----------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('none','read','write')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  UNIQUE(role_id, module_id)
);

-- Seed default permissions
-- Admin: write on everything
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write' FROM roles r CROSS JOIN modules m
WHERE r.slug = 'admin'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Manager: write on bookings/checkout/expenses, read on hr/reports, none on settings
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE m.slug
    WHEN 'bookings' THEN 'write'
    WHEN 'checkout' THEN 'write'
    WHEN 'expenses' THEN 'write'
    WHEN 'hr' THEN 'read'
    WHEN 'reports' THEN 'read'
    WHEN 'settings' THEN 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'manager'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Front Desk: write on bookings/checkout, none on others
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE m.slug
    WHEN 'bookings' THEN 'write'
    WHEN 'checkout' THEN 'write'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'front_desk'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Accountant: write on expenses, read on bookings/checkout/hr/reports, none on settings
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE m.slug
    WHEN 'expenses' THEN 'write'
    WHEN 'settings' THEN 'none'
    ELSE 'read'
  END
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'accountant'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 4. user_profiles (1-to-1 with auth.users) -----------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  phone TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role   ON user_profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON user_profiles(is_active);

-- updated_at trigger (function defined in expense / hr migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_profiles_updated_at') THEN
    CREATE TRIGGER trg_user_profiles_updated_at
      BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_role_permissions_updated_at') THEN
    CREATE TRIGGER trg_role_permissions_updated_at
      BEFORE UPDATE ON role_permissions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 5. Extend history_log entity_type CHECK -------------------------------
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class    rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid  = rel.relnamespace
   WHERE rel.relname = 'history_log'
     AND ns.nspname  = 'public'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%entity_type%'
   LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.history_log DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.history_log
  ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item'
  ));

-- 6. RLS — single-tenant (any authenticated user) -----------------------
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roles' AND policyname='p_roles_auth')
    THEN CREATE POLICY p_roles_auth ON roles FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='modules' AND policyname='p_modules_auth')
    THEN CREATE POLICY p_modules_auth ON modules FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='p_role_permissions_auth')
    THEN CREATE POLICY p_role_permissions_auth ON role_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='p_user_profiles_auth')
    THEN CREATE POLICY p_user_profiles_auth ON user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- 7. Backfill existing auth.users to admin role ------------------------
DO $$
DECLARE
  admin_role_id UUID;
BEGIN
  SELECT id INTO admin_role_id FROM roles WHERE slug = 'admin';
  IF admin_role_id IS NOT NULL THEN
    INSERT INTO user_profiles (user_id, full_name, email, role_id, is_active)
    SELECT
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      u.email,
      admin_role_id,
      true
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id);
  END IF;
END $$;
