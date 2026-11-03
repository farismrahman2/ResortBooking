-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 007 — the Audit Log is the admin's
--
-- admin_alerts summaries name guests, discounts, refunds and amounts. Reading
-- and acknowledging now need Settings access; any staff action may still ADD
-- an entry (flagAlert runs as the signed-in user). One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_alerts' AND policyname = 'sec_read') THEN
    CREATE POLICY sec_read   ON public.admin_alerts AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT public.app_can('settings', 'read')));
    CREATE POLICY sec_update ON public.admin_alerts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.app_can('settings', 'read'))) WITH CHECK ((SELECT public.app_can('settings', 'read')));
    CREATE POLICY sec_delete ON public.admin_alerts AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.app_can('settings', 'write')));
  END IF;
END $$;
