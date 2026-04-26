-- ============================================================================
-- Migration B — Expense module schema
-- ============================================================================
-- Run this AFTER migration 000 has been committed.
--
-- Creates: expense_categories, expense_payees, recurring_expense_templates,
--          expenses, expense_attachments, expense_budgets
--          + indexes, triggers, and single-tenant RLS policies.
-- ============================================================================

-- 1. Categories
CREATE TABLE expense_categories (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL,
    slug                 text NOT NULL UNIQUE,
    category_group       text NOT NULL CHECK (category_group IN (
        'bazar', 'beverages', 'utilities', 'maintenance',
        'salary', 'services', 'materials', 'miscellaneous'
    )),
    requires_description boolean NOT NULL DEFAULT false,
    requires_payee       boolean NOT NULL DEFAULT false,
    is_active            boolean NOT NULL DEFAULT true,
    display_order        integer NOT NULL DEFAULT 0,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_categories_active_order
    ON expense_categories (is_active, display_order);

-- 2. Payees
CREATE TABLE expense_payees (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    payee_type    text NOT NULL CHECK (payee_type IN (
        'supplier', 'contractor', 'staff', 'utility', 'other'
    )),
    phone         text NULL,
    notes         text NULL,
    is_active     boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_expense_payees_name_unique
    ON expense_payees (lower(name));

CREATE INDEX idx_expense_payees_active_type
    ON expense_payees (is_active, payee_type, display_order);

-- 3. Recurring templates (referenced by expenses; create first)
CREATE TABLE recurring_expense_templates (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   text NOT NULL,
    category_id            uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    default_payee_id       uuid NULL     REFERENCES expense_payees(id)     ON DELETE SET NULL,
    default_amount         numeric(14, 2) NULL CHECK (default_amount IS NULL OR default_amount > 0),
    default_description    text NULL,
    default_payment_method text NOT NULL DEFAULT 'cash' CHECK (default_payment_method IN (
        'cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'cheque', 'other'
    )),
    day_of_month           integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    is_active              boolean NOT NULL DEFAULT true,
    last_generated_for     date NULL,
    notes                  text NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_templates_active
    ON recurring_expense_templates (is_active, day_of_month);

-- 4. Expenses
CREATE TABLE expenses (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date          date NOT NULL,
    category_id           uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    payee_id              uuid NULL     REFERENCES expense_payees(id)     ON DELETE SET NULL,
    description           text NULL,
    amount                numeric(14, 2) NOT NULL CHECK (amount > 0),
    payment_method        text NOT NULL DEFAULT 'cash' CHECK (payment_method IN (
        'cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'cheque', 'other'
    )),
    reference_number      text NULL,
    notes                 text NULL,
    is_draft              boolean NOT NULL DEFAULT false,
    recurring_template_id uuid NULL REFERENCES recurring_expense_templates(id) ON DELETE SET NULL,
    created_by            uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date         ON expenses (expense_date DESC);
CREATE INDEX idx_expenses_category     ON expenses (category_id);
CREATE INDEX idx_expenses_payee        ON expenses (payee_id) WHERE payee_id IS NOT NULL;
CREATE INDEX idx_expenses_date_cat     ON expenses (expense_date, category_id);
CREATE INDEX idx_expenses_drafts       ON expenses (is_draft, expense_date) WHERE is_draft = true;

-- 5. Attachments (receipts)
CREATE TABLE expense_attachments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id   uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    file_name    text NOT NULL,
    mime_type    text NOT NULL CHECK (mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
    )),
    size_bytes   integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    uploaded_by  uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_attachments_expense ON expense_attachments (expense_id);

-- 6. Budgets
CREATE TABLE expense_budgets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  uuid NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    period_type  text NOT NULL CHECK (period_type IN ('monthly', 'yearly')),
    period_start date NOT NULL,
    amount       numeric(14, 2) NOT NULL CHECK (amount > 0),
    notes        text NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness: one budget per (category, period_type, period_start).
-- NULL category needs a partial unique index because UNIQUE treats NULLs as distinct.
CREATE UNIQUE INDEX idx_expense_budgets_unique_category
    ON expense_budgets (category_id, period_type, period_start)
    WHERE category_id IS NOT NULL;

CREATE UNIQUE INDEX idx_expense_budgets_unique_overall
    ON expense_budgets (period_type, period_start)
    WHERE category_id IS NULL;

-- 7. Reusable updated_at trigger (skip if already present)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_expense_budgets_updated_at
    BEFORE UPDATE ON expense_budgets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recurring_templates_updated_at
    BEFORE UPDATE ON recurring_expense_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. RLS — match existing single-tenant pattern (any authenticated user = full access)
ALTER TABLE expense_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_budgets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expense_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_categories_auth   ON expense_categories          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_payees_auth       ON expense_payees              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_expenses_auth     ON expenses                    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_attachments_auth  ON expense_attachments         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_budgets_auth      ON expense_budgets             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY p_recurring_auth    ON recurring_expense_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
