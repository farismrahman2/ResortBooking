-- ============================================================================
-- Migration A — Make sure history_log exists and accepts 'expense'
-- ============================================================================
-- The expense module uses the existing `history_log` audit table. If your
-- Supabase project doesn't have that table yet, this migration creates it.
-- Then it ensures the `entity_type` CHECK constraint allows 'expense'
-- alongside the existing 'quote' and 'booking' values.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- 1. Create `history_log` if it doesn't exist
CREATE TABLE IF NOT EXISTS public.history_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL,
    entity_id   uuid NOT NULL,
    event       text NOT NULL,
    actor       text NOT NULL DEFAULT 'system',
    payload     jsonb NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_log_entity
    ON public.history_log (entity_type, entity_id, created_at DESC);

-- Single-tenant RLS — match the existing pattern
ALTER TABLE public.history_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'history_log'
           AND policyname = 'p_history_log_auth'
    ) THEN
        EXECUTE 'CREATE POLICY p_history_log_auth ON public.history_log FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- 2. Replace any existing entity_type CHECK constraint to include 'expense'.
--    `entity_type` is a TEXT column with a CHECK, not a Postgres ENUM.
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
    CHECK (entity_type IN ('quote', 'booking', 'expense'));
