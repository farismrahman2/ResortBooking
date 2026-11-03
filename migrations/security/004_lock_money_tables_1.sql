-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 004 — the database itself refuses money data to roles without access
--
-- Until now every table allowed any logged-in user to read it directly (the
-- website hid pages, but a browser's developer tools could read everything).
-- sec_lock() adds RESTRICTIVE rules (ANDed with the existing ones, nothing is
-- dropped): reading needs `read_expr`, adding/changing/deleting `write_expr`.
-- The service role (server-side reports, crons, AI audit) is not affected.
--
-- Part 1: tables only one section of the app uses.
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sec_lock(p_table TEXT, p_read TEXT, p_write TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = 'sec_read') THEN
    EXECUTE format('CREATE POLICY sec_read ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)', p_table, p_read);
    EXECUTE format('CREATE POLICY sec_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', p_table, p_write);
    EXECUTE format('CREATE POLICY sec_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', p_table, p_write, p_write);
    EXECUTE format('CREATE POLICY sec_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', p_table, p_write);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.sec_lock(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- HR money: HR only.
SELECT public.sec_lock(t, '(SELECT public.app_can(''hr'', ''read''))', '(SELECT public.app_can(''hr'', ''write''))')
  FROM unnest(ARRAY['payroll_runs', 'payroll_run_lines', 'salary_structures', 'salary_adjustments', 'loans', 'service_charge_payouts']) t;

-- Expense budgets and recurring templates: Expenses only.
SELECT public.sec_lock(t, '(SELECT public.app_can(''expenses'', ''read''))', '(SELECT public.app_can(''expenses'', ''write''))')
  FROM unnest(ARRAY['expense_budgets', 'recurring_expense_templates']) t;

-- Kitchen deliveries and supplier payments: Kitchen only.
SELECT public.sec_lock(t, '(SELECT public.app_can(''kitchen'', ''read''))', '(SELECT public.app_can(''kitchen'', ''write''))')
  FROM unnest(ARRAY['kitchen_deliveries', 'kitchen_delivery_lines', 'kitchen_vendor_payments', 'kitchen_payment_allocations']) t;

-- Corporate sales pipeline: CRM only.
SELECT public.sec_lock('crm_opportunities', '(SELECT public.app_can(''crm'', ''read''))', '(SELECT public.app_can(''crm'', ''write''))');

-- Daily corporate snapshot: Reports. Revenue display rules: server only.
SELECT public.sec_lock('corporate_daily_snapshots', '(SELECT public.app_can(''reports'', ''read''))', '(SELECT public.app_can(''reports'', ''write''))');
SELECT public.sec_lock('revenue_display_rules', 'false', 'false');
