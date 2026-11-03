-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 002 — only the admin can change roles, permissions and profiles
--
-- Before: roles, role_permissions, modules and user_profiles allowed ALL to any
-- logged-in user, so a staff member could give themselves the admin role from
-- the browser. Reading stays open (names and role labels are shown across the
-- app); writing now needs Settings: write.
--
-- app_can(module, level) is the role check every database rule uses from now
-- on: true when the caller's active profile's role has that module at that
-- level ('write' implies 'read'). SECURITY DEFINER so it reads the permission
-- tables regardless of their own rules.
--
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so nothing
-- is dropped. One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_can(p_module TEXT, p_level TEXT DEFAULT 'read')
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_profiles up
      JOIN role_permissions rp ON rp.role_id = up.role_id
      JOIN modules m           ON m.id = rp.module_id
     WHERE up.user_id = auth.uid()
       AND up.is_active
       AND m.slug = p_module
       AND (rp.level = 'write' OR (p_level = 'read' AND rp.level = 'read'))
  )
$$;
REVOKE ALL ON FUNCTION public.app_can(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can(TEXT, TEXT) TO authenticated, service_role;

-- Writes on the permission tables: Settings write only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles', 'role_permissions', 'modules', 'user_profiles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS sec_write_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sec_write_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS sec_write_delete ON public.%I', t);
    EXECUTE format($p$CREATE POLICY sec_write_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
                     WITH CHECK ((SELECT public.app_can('settings', 'write')))$p$, t);
    EXECUTE format($p$CREATE POLICY sec_write_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
                     USING ((SELECT public.app_can('settings', 'write'))) WITH CHECK ((SELECT public.app_can('settings', 'write')))$p$, t);
    EXECUTE format($p$CREATE POLICY sec_write_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
                     USING ((SELECT public.app_can('settings', 'write')))$p$, t);
  END LOOP;
END $$;
