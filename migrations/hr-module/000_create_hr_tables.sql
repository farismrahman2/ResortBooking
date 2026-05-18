-- =====================================================================
-- HR Module — Phase 1 Schema
-- =====================================================================
-- Run after the expense module migrations (the HR module references
-- expense_payees, expenses, and history_log).
--
-- Idempotent — safe to re-run.
-- =====================================================================

-- 1. employees -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code TEXT UNIQUE NOT NULL,                 -- e.g. 'GCR-001'
  full_name TEXT NOT NULL,
  photo_url TEXT,
  designation TEXT NOT NULL,                          -- free text (e.g. 'Front Desk Officer')
  department TEXT NOT NULL CHECK (department IN (
    'management','frontdesk','housekeeping','kitchen','f_and_b',
    'security','maintenance','gardener','accounts','other'
  )),
  nid_number TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male','female','other')),
  blood_group TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  present_address TEXT,
  permanent_address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  joining_date DATE NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','terminated','resigned')),
  termination_date DATE,
  termination_reason TEXT,
  is_live_in BOOLEAN NOT NULL DEFAULT false,
  meal_allowance_in_kind BOOLEAN NOT NULL DEFAULT false,
  expense_payee_id UUID REFERENCES expense_payees(id), -- auto-linked on creation
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_status     ON employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);

-- 2. salary_structures (effective-dated; new row per increment) -----------
CREATE TABLE IF NOT EXISTS salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,                                  -- NULL = current
  basic NUMERIC(12,2) NOT NULL CHECK (basic >= 0),
  house_rent NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (house_rent >= 0),
  medical NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (medical >= 0),
  transport NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (transport >= 0),
  mobile NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (mobile >= 0),
  other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  gross NUMERIC(12,2) GENERATED ALWAYS AS
    (basic + house_rent + medical + transport + mobile + other_allowance) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_structures_current
  ON salary_structures(employee_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_salary_structures_effective
  ON salary_structures(employee_id, effective_from);

-- 3. leave_types (seeded with defaults) -----------------------------------
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  default_annual_balance NUMERIC(5,2) NOT NULL CHECK (default_annual_balance >= 0),
  is_paid BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO leave_types (name, slug, default_annual_balance, is_paid, display_order) VALUES
  ('Annual Leave', 'annual', 14, true, 1),
  ('Sick Leave',   'sick',    7, true, 2),
  ('Casual Leave', 'casual',  3, true, 3),
  ('Unpaid Leave', 'unpaid',  0, false, 4)
ON CONFLICT (slug) DO NOTHING;

-- 4. leave_balances (per employee per leave_type per year) ----------------
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INT NOT NULL,
  opening_balance NUMERIC(5,2) NOT NULL DEFAULT 0,
  accrued NUMERIC(5,2) NOT NULL DEFAULT 0,
  used NUMERIC(5,2) NOT NULL DEFAULT 0,
  available NUMERIC(5,2) GENERATED ALWAYS AS
    (opening_balance + accrued - used) STORED,
  UNIQUE(employee_id, leave_type_id, year)
);

-- 5. attendance (one row per employee per date) ---------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'present','absent','paid_leave','unpaid_leave',
    'weekly_off','holiday','half_day'
  )),
  leave_type_id UUID REFERENCES leave_types(id),
  notes TEXT,
  marked_by UUID,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date           ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_month ON attendance(employee_id, date);

-- 6. salary_adjustments ---------------------------------------------------
CREATE TABLE IF NOT EXISTS salary_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  applies_to_month DATE NOT NULL,                      -- always YYYY-MM-01
  type TEXT NOT NULL CHECK (type IN (
    'fine','bonus','eid_bonus','advance',
    'loan_repayment','other_addition','other_deduction'
  )),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  loan_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payroll_run_line_id UUID
);

CREATE INDEX IF NOT EXISTS idx_salary_adj_month
  ON salary_adjustments(applies_to_month);
CREATE INDEX IF NOT EXISTS idx_salary_adj_employee_month
  ON salary_adjustments(employee_id, applies_to_month);

-- 7. loans ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  principal NUMERIC(12,2) NOT NULL CHECK (principal > 0),
  monthly_installment NUMERIC(12,2) NOT NULL CHECK (monthly_installment > 0),
  amount_repaid NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding NUMERIC(12,2) GENERATED ALWAYS AS (principal - amount_repaid) STORED,
  taken_on DATE NOT NULL,
  repayment_starts DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','closed','written_off')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_salary_adj_loan'
  ) THEN
    ALTER TABLE salary_adjustments
      ADD CONSTRAINT fk_salary_adj_loan
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 8. service_charge_payouts ----------------------------------------------
CREATE TABLE IF NOT EXISTS service_charge_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  applies_to_month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, applies_to_month)
);

CREATE INDEX IF NOT EXISTS idx_service_charge_month
  ON service_charge_payouts(applies_to_month);

-- 9. payroll_runs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','finalized')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID,
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT
);

-- 10. payroll_run_lines --------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  -- Snapshot of salary structure at the time of generation
  basic NUMERIC(12,2) NOT NULL,
  house_rent NUMERIC(12,2) NOT NULL DEFAULT 0,
  medical NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport NUMERIC(12,2) NOT NULL DEFAULT 0,
  mobile NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross NUMERIC(12,2) NOT NULL,
  -- Attendance summary
  days_in_month INT NOT NULL,
  days_present INT NOT NULL DEFAULT 0,
  days_absent INT NOT NULL DEFAULT 0,
  days_paid_leave INT NOT NULL DEFAULT 0,
  days_unpaid_leave INT NOT NULL DEFAULT 0,
  days_weekly_off INT NOT NULL DEFAULT 0,
  days_holiday INT NOT NULL DEFAULT 0,
  unpaid_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Adjustments (sums by type)
  bonuses NUMERIC(12,2) NOT NULL DEFAULT 0,
  eid_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_additions NUMERIC(12,2) NOT NULL DEFAULT 0,
  fines NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  loan_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL,
  -- Linkage
  expense_id UUID REFERENCES expenses(id),
  payment_method TEXT
    CHECK (payment_method IN ('cash','bkash','nagad','rocket','bank_transfer','cheque','other')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run      ON payroll_run_lines(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee ON payroll_run_lines(employee_id);

-- 11. Reusable updated_at trigger (no-op if already present) -------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employees_updated_at') THEN
    CREATE TRIGGER trg_employees_updated_at
      BEFORE UPDATE ON employees
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 12. RLS — match existing single-tenant pattern -------------------------
ALTER TABLE employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance             ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_adjustments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_charge_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_lines      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees' AND policyname='p_employees_auth')
    THEN CREATE POLICY p_employees_auth ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='salary_structures' AND policyname='p_salary_structures_auth')
    THEN CREATE POLICY p_salary_structures_auth ON salary_structures FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_types' AND policyname='p_leave_types_auth')
    THEN CREATE POLICY p_leave_types_auth ON leave_types FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leave_balances' AND policyname='p_leave_balances_auth')
    THEN CREATE POLICY p_leave_balances_auth ON leave_balances FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attendance' AND policyname='p_attendance_auth')
    THEN CREATE POLICY p_attendance_auth ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='salary_adjustments' AND policyname='p_salary_adjustments_auth')
    THEN CREATE POLICY p_salary_adjustments_auth ON salary_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='loans' AND policyname='p_loans_auth')
    THEN CREATE POLICY p_loans_auth ON loans FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_charge_payouts' AND policyname='p_service_charge_auth')
    THEN CREATE POLICY p_service_charge_auth ON service_charge_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_runs' AND policyname='p_payroll_runs_auth')
    THEN CREATE POLICY p_payroll_runs_auth ON payroll_runs FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payroll_run_lines' AND policyname='p_payroll_run_lines_auth')
    THEN CREATE POLICY p_payroll_run_lines_auth ON payroll_run_lines FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- 13. Extend history_log entity_type CHECK -------------------------------
-- Mirrors migrations/expense-module/000_extend_entity_type_enum.sql pattern.
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
    'quote','booking','expense','employee','payroll_run','loan'
  ));
