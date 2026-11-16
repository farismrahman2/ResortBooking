-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 000 — a separate business inside the same software
--
-- Garden Centre landscaping ("Care with Green"): client projects such as ASU,
-- run on requisitions → supplier bills → payments, plus daily labour and food
-- paid from accountants' cash floats.
--
-- Kept apart from the resort:
--   • its own module 'landscaping' and role 'landscaping' (nothing else);
--   • its own tables (ls_*), locked with sec_lock/app_can so resort staff
--     can't read them and landscaping staff can't read the resort's;
--   • its own photo bucket 'landscaping-bills'.
-- Resort reports, P&L, AI audit and exports never read ls_* tables.
-- Duties per person (prepare / check / approve / pay) live in ls_members.
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Module + role ---------------------------------------------------------------
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('landscaping', 'Landscaping', 'Landscaping business — projects, requisitions, bills, payments, cash', 20)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE public.roles ADD CONSTRAINT roles_slug_check CHECK (slug IN (
  'admin','manager','front_desk','accountant','reservation','corporate_sales',
  'operations_manager','md','review_collector','inventory','landscaping'));

INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('landscaping', 'Landscaping', 'Landscaping business only — nothing from the resort', 11)
ON CONFLICT (slug) DO NOTHING;

-- Every role gets a row for the new module: admin + landscaping write, the rest none;
-- the landscaping role gets none on every resort module.
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE WHEN m.slug = 'landscaping' AND r.slug IN ('admin', 'landscaping') THEN 'write' ELSE 'none' END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'landscaping' OR r.slug = 'landscaping'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- People and duties -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ls_members (
  user_id      UUID PRIMARY KEY,
  can_prepare  BOOLEAN NOT NULL DEFAULT TRUE,
  can_check    BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve  BOOLEAN NOT NULL DEFAULT FALSE,
  can_pay      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients and projects ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ls_clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  company     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  created_by  UUID DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ls_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  client_id       UUID REFERENCES ls_clients(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  site            TEXT,
  contract_value  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  start_date      DATE,
  end_date        DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('quoted','active','on_hold','completed','cancelled')),
  notes           TEXT,
  created_by      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ls_variations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES ls_projects(id) ON DELETE CASCADE,
  var_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT NOT NULL,
  amount       NUMERIC(14,2) NOT NULL,          -- + extra work, − reduced work
  created_by   UUID DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ls_client_receipts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES ls_projects(id) ON DELETE RESTRICT,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash','bkash','bank','cheque')),
  reference    TEXT,
  note         TEXT,
  created_by   UUID DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suppliers ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ls_suppliers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  phone            TEXT,
  address          TEXT,
  opening_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,   -- dues brought forward (the "সাবেক" line)
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Requisitions ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ls_requisitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_no             INTEGER NOT NULL UNIQUE,
  project_id         UUID REFERENCES ls_projects(id) ON DELETE RESTRICT,
  req_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  department         TEXT,
  description        TEXT NOT NULL,
  area_note          TEXT,                         -- e.g. "Parking Area – 5,670 SFT · Ramp – 825 SFT"
  remarks            TEXT,
  requested_by_name  TEXT,
  total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','checked','approved','rejected','cancelled')),
  prepared_by        UUID DEFAULT auth.uid(),
  submitted_at       TIMESTAMPTZ,
  checked_by         UUID,
  checked_at         TIMESTAMPTZ,
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  rejected_by        UUID,
  rejected_at        TIMESTAMPTZ,
  reject_note        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ls_requisitions_project ON ls_requisitions (project_id);
CREATE INDEX IF NOT EXISTS ls_requisitions_status  ON ls_requisitions (status);

CREATE TABLE IF NOT EXISTS ls_requisition_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id  UUID NOT NULL REFERENCES ls_requisitions(id) ON DELETE CASCADE,
  line_no         INTEGER NOT NULL,
  description     TEXT NOT NULL,
  qty             NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  unit            TEXT,
  unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  amount          NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS ls_requisition_items_req ON ls_requisition_items (requisition_id);

-- Supplier bills and payments ---------------------------------------------------
CREATE TABLE IF NOT EXISTS ls_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id  UUID NOT NULL REFERENCES ls_requisitions(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES ls_suppliers(id) ON DELETE RESTRICT,
  bill_no         TEXT,
  bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note            TEXT,
  photo_path      TEXT,
  created_by      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ls_bills_req      ON ls_bills (requisition_id);
CREATE INDEX IF NOT EXISTS ls_bills_supplier ON ls_bills (supplier_id);

CREATE TABLE IF NOT EXISTS ls_bill_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       UUID NOT NULL REFERENCES ls_bills(id) ON DELETE RESTRICT,
  pay_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL CHECK (method IN ('cash','bkash','bank','cheque')),
  float_holder  UUID,                 -- cash paid out of this accountant's float
  reference     TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ls_bill_payments_bill ON ls_bill_payments (bill_id);

-- Direct spending (labour, food, transport, other) ----------------------------------
CREATE TABLE IF NOT EXISTS ls_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES ls_projects(id) ON DELETE RESTRICT,   -- NULL = business overhead
  exp_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  category      TEXT NOT NULL CHECK (category IN ('labour','food','transport','tools','other')),
  description   TEXT,
  workers       INTEGER,
  rate          NUMERIC(14,2),
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payee         TEXT,
  method        TEXT NOT NULL CHECK (method IN ('cash','bkash','bank','cheque')),
  float_holder  UUID,
  photo_path    TEXT,
  created_by    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ls_expenses_project ON ls_expenses (project_id);

-- Cash floats: handed to / returned by an accountant ----------------------------------
CREATE TABLE IF NOT EXISTS ls_cash_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder      UUID NOT NULL,
  mov_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  kind        TEXT NOT NULL CHECK (kind IN ('given','returned')),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note        TEXT,
  created_by  UUID DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ls_cash_movements_holder ON ls_cash_movements (holder);

-- Lock every ls_ table to the Landscaping module ---------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ls_members','ls_clients','ls_projects','ls_variations','ls_client_receipts','ls_suppliers',
                           'ls_requisitions','ls_requisition_items','ls_bills','ls_bill_payments','ls_expenses','ls_cash_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'ls_access') THEN
      EXECUTE format('CREATE POLICY ls_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.app_can(''landscaping'', ''read''))) WITH CHECK ((SELECT public.app_can(''landscaping'', ''write'')))', t);
    END IF;
    PERFORM public.sec_lock(t, '(SELECT public.app_can(''landscaping'', ''read''))', '(SELECT public.app_can(''landscaping'', ''write''))');
  END LOOP;
END $$;
-- Duties are the admin's to set.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ls_members' AND policyname = 'ls_members_admin') THEN
    CREATE POLICY ls_members_admin ON public.ls_members AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT public.app_can('settings', 'write'))) WITH CHECK ((SELECT public.app_can('settings', 'write')));
    CREATE POLICY ls_members_admin_ins ON public.ls_members AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT public.app_can('settings', 'write')));
    CREATE POLICY ls_members_admin_del ON public.ls_members AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT public.app_can('settings', 'write')));
  END IF;
END $$;

-- Bill / receipt photos ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('landscaping-bills', 'landscaping-bills', false)
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'landscaping_bills_read') THEN
    CREATE POLICY landscaping_bills_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'landscaping-bills' AND (SELECT public.app_can('landscaping', 'read')));
    CREATE POLICY landscaping_bills_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'landscaping-bills' AND (SELECT public.app_can('landscaping', 'write')));
  END IF;
END $$;

-- Audit Log events for landscaping money.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT con.conname INTO cname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'admin_alerts' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event_type%' LIMIT 1;
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE admin_alerts DROP CONSTRAINT %I', cname); END IF;
  ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_event_type_check
    CHECK (event_type IN (
      'discount_applied','guest_reduced','checkout_voided','refund_recorded','booking_cancelled',
      'booking_no_show','user_deactivated','due_overdue',
      'advance_corrected','advance_removed','booking_edited',
      'room_block_created','room_block_changed','room_block_released',
      'room_prices_changed','revenue_display_changed',
      'sessions_revoked','password_reset',
      'change_requested','change_request_decided',
      'landscaping_over_budget','landscaping_money_changed'
    ));
END $$;
