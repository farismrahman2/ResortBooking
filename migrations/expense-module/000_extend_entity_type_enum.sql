-- ============================================================================
-- Migration A — Extend the entity_type enum
-- ============================================================================
-- IMPORTANT: Run this FIRST and ALONE. Postgres requires `ALTER TYPE … ADD VALUE`
-- to be committed before the new enum value is usable in subsequent statements.
--
-- Paste this into the Supabase SQL editor, press RUN, then move on to 001.
-- ============================================================================

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'expense';
