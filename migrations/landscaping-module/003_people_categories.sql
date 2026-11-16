-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 003 — people and work categories (pick lists + analysis)
--
-- ls_people: everyone involved (requested by, prepared/checked/approved on
--   paper, sardars) — not logins, just names to pick.
-- ls_work_categories: what the money was for (Civil works, Trees & plants…),
--   on every requisition and every labour/food/other entry, so spending can
--   be broken down by category per project.
-- Landscaping tables only. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ls_people (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  designation  TEXT,
  phone        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ls_work_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ls_work_categories (name, sort_order) VALUES
  ('Civil works', 10), ('Hardscape & paving', 20), ('Landscaping (softscape)', 30), ('Trees & plants', 40),
  ('Soil & fertiliser', 50), ('Turf & sports surfaces', 60), ('Irrigation & water', 70), ('Electrical & lighting', 80),
  ('Fencing & nets', 90), ('Tools & equipment', 100), ('Site running (labour, food, transport)', 110), ('Other', 120)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS category_id          UUID REFERENCES ls_work_categories(id) ON DELETE SET NULL;
ALTER TABLE ls_requisitions ADD COLUMN IF NOT EXISTS requested_by_person  UUID REFERENCES ls_people(id) ON DELETE SET NULL;
ALTER TABLE ls_expenses     ADD COLUMN IF NOT EXISTS work_category_id     UUID REFERENCES ls_work_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ls_requisitions_category ON ls_requisitions (category_id);
CREATE INDEX IF NOT EXISTS ls_expenses_work_category ON ls_expenses (work_category_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ls_people', 'ls_work_categories'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'ls_access') THEN
      EXECUTE format('CREATE POLICY ls_access ON public.%I FOR ALL TO authenticated USING ((SELECT public.app_can(''landscaping'', ''read''))) WITH CHECK ((SELECT public.app_can(''landscaping'', ''write'')))', t);
    END IF;
    PERFORM public.sec_lock(t, '(SELECT public.app_can(''landscaping'', ''read''))', '(SELECT public.app_can(''landscaping'', ''write''))');
  END LOOP;
END $$;
