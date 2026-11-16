-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 001 — sub-projects (e.g. ASU → Parking, ASU → Restaurant)
--
-- A project may belong to a parent project. A sub-project has its own budget
-- (contract_value), requisitions, bills, labour/food and its own account; the
-- parent's figures include its sub-projects. One level only. Landscaping
-- tables only — nothing in the resort changes. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ls_projects ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES ls_projects(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS ls_projects_parent ON ls_projects (parent_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ls_projects_not_own_parent') THEN
    ALTER TABLE ls_projects ADD CONSTRAINT ls_projects_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;
