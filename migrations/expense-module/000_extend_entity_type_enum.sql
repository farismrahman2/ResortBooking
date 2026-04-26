-- ============================================================================
-- Migration A — Allow `'expense'` as an entity_type on history_log
-- ============================================================================
-- `history_log.entity_type` is a TEXT column guarded by a CHECK constraint
-- (it is NOT a Postgres ENUM — that's a different column, `event`). To make
-- 'expense' a valid value we drop whatever CHECK constraint currently lives
-- on the column (if any) and recreate it with the new value included.
--
-- Safe to run multiple times.
-- ============================================================================

DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Find the CHECK constraint that references entity_type, if one exists.
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
