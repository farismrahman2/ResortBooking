-- ============================================================================
-- ENABLE RLS ON EVERY TABLE IN public — block anon, allow authenticated.
-- ============================================================================
-- Why: the Supabase anon key is bundled into the Next.js client bundle (it
-- has to be — it's how the browser talks to Supabase for auth). Without RLS,
-- anyone with that key can hit https://<project>.supabase.co/rest/v1/<table>
-- directly and read/edit/delete data, bypassing the app entirely.
--
-- Our app uses:
--   - createClient() with the anon key + user cookies for normal queries
--     (these run as the `authenticated` Postgres role when a user is signed in)
--   - createServiceClient() with the service-role key for elevated writes
--     (this role BYPASSES RLS by Supabase design — nothing changes for it)
--
-- So the policy is: anyone authenticated can do everything. App-level
-- permission gates (requirePermission, getCurrentUserContext) remain the
-- real authorization layer — RLS is just the "must be logged in" wall to
-- stop the anon-key bypass.
--
-- Idempotent: drops policy if it already exists before recreating, and
-- safely skips RLS-enable if already on. Re-run after adding any new table.
-- ============================================================================

DO $$
DECLARE
  t record;
  policy_exists boolean;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       -- Skip Postgres extension tables (PostGIS etc.) — they live in public
       -- but Supabase already handles them. Adjust if you have other system
       -- tables to skip.
       AND tablename NOT IN ('spatial_ref_sys')
     ORDER BY tablename
  LOOP
    -- 1) Enable RLS (no-op if already enabled)
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);

    -- 2) Drop our policy if it exists (so the recreate below is idempotent)
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = t.schemaname
         AND tablename  = t.tablename
         AND policyname = 'authenticated_all'
    ) INTO policy_exists;

    IF policy_exists THEN
      EXECUTE format('DROP POLICY %I ON %I.%I', 'authenticated_all', t.schemaname, t.tablename);
    END IF;

    -- 3) Recreate the permissive policy for authenticated only.
    -- USING (true) WITH CHECK (true) → authenticated users can SELECT, INSERT,
    -- UPDATE, DELETE any row. Anon role has no matching policy → denied.
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'authenticated_all', t.schemaname, t.tablename
    );

    RAISE NOTICE 'RLS enabled + authenticated_all policy applied: %.%', t.schemaname, t.tablename;
  END LOOP;
END
$$;

-- Sanity check: list any public tables that still don't have RLS enabled.
-- After running, this should return zero rows.
SELECT schemaname, tablename
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename NOT IN ('spatial_ref_sys')
   AND NOT EXISTS (
     SELECT 1 FROM pg_class c
      WHERE c.relname = pg_tables.tablename
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = pg_tables.schemaname)
        AND c.relrowsecurity = true
   );
