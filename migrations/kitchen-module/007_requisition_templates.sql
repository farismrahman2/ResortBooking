-- ============================================================================
-- Kitchen module · 007 — requisition templates
--
-- "Start from a previous day" already exists and covers most mornings. It is
-- not the same thing as a template, and the difference is why this is needed:
--
--   * A previous requisition is whatever happened to be ordered that day. It
--     drifts. Copy Tuesday, and you inherit Tuesday's one-off 40kg of beef for
--     a wedding, plus whatever somebody forgot to add.
--   * A template is the list somebody DECIDED on. It only changes when a
--     person edits it.
--
-- Several templates, not one: a quiet weekday and a 200-pax Friday are
-- different standing lists, and forcing both through one template means
-- deleting half the lines every other day.
--
-- Quantities are stored but treated as a starting point — they are the number
-- for a normal day, adjusted against the headcount banner once loaded.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE TABLE IF NOT EXISTS kitchen_requisition_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Two templates called "Daily" is a mistake every time, never an intention.
-- Case-insensitive so "Daily" and "daily" collide too.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_templates_name_uq
  ON kitchen_requisition_templates (lower(name));

CREATE TABLE IF NOT EXISTS kitchen_requisition_template_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID NOT NULL REFERENCES kitchen_requisition_templates(id) ON DELETE CASCADE,
  sort_order        INT  NOT NULL DEFAULT 0,
  item_id           UUID REFERENCES inv_items(id),
  /* Snapshot, same reasoning as the requisition line: renaming an item next
     month must not silently rewrite what the template says. */
  item_name         TEXT NOT NULL,
  kitchen_vendor_id UUID REFERENCES kitchen_vendors(id),
  /* The normal-day quantity. Zero is allowed — some lines are "always order
     this, decide the amount on the day". */
  qty               NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  piece_count       NUMERIC(12,3),
  unit_id           UUID REFERENCES inv_units(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kitchen_template_lines_template_idx
  ON kitchen_requisition_template_lines (template_id);

ALTER TABLE kitchen_requisition_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_requisition_template_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kitchen_requisition_templates','kitchen_requisition_template_lines'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all', t);
    END IF;
  END LOOP;
END $$;

SELECT 'templates' AS item, COUNT(*)::text AS val FROM kitchen_requisition_templates
UNION ALL SELECT 'template lines', COUNT(*)::text FROM kitchen_requisition_template_lines;
