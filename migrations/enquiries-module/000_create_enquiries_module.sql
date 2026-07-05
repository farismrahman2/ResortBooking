-- =====================================================================
-- Enquiries Module — Schema
-- Mirrors the idempotent style of migrations/qa-module/000_*.sql
-- =====================================================================
-- What this adds:
--  * enquiries table — one row per lead submitted on the public marketing
--    website (garden-centre-resort). Leads are pushed here over HTTP by the
--    public site's /api/enquiry route immediately after it persists its own
--    copy, so the public site keeps working standalone and staff also see
--    every lead inside the Resort Agent back-office.
--  * 'enquiries' module (display_order 15) + per-role permissions
--
-- Notification model: `seen_at` is NULL until a staff member opens the lead.
-- The sidebar badge counts unseen rows — that is the "new enquiries" alert.
-- The public enquiry id (a cuid) is stored in `source_id` UNIQUE, so a
-- re-push (retry / edit) upserts instead of duplicating the lead.
-- =====================================================================

-- 1. Register `enquiries` module + seed permissions -----------------------
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('enquiries', 'Enquiries', 'Leads submitted on the public website — weddings, corporate, stays', 15)
ON CONFLICT (slug) DO NOTHING;

-- Per-role permissions. Sales / reservations / front-desk work the leads;
-- accountant & review_collector have no business here.
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'operations_manager' THEN 'write'
    WHEN 'reservation'        THEN 'write'
    WHEN 'corporate_sales'    THEN 'write'
    WHEN 'front_desk'         THEN 'write'
    WHEN 'md'                 THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'enquiries'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 2. enquiries table ------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The public site's own enquiry id (cuid). UNIQUE so re-pushes upsert.
  -- Nullable so a lead created directly in the back-office is still valid.
  source_id TEXT UNIQUE,

  -- Free-text lead type the visitor picked: "Wedding", "Corporate",
  -- "Daylong", "Stay", etc. Stored as-is, mirroring the public schema.
  type TEXT NOT NULL,

  -- Free-text date the visitor typed ("Jan 15", "next Friday", "asap", ...).
  -- Deliberately not a real DATE column — mirrors the public site.
  date_text TEXT,

  pax          INT  NOT NULL DEFAULT 1,
  organisation TEXT,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  email        TEXT,
  note         TEXT,

  -- Where the lead came from: page path + referrer / utm captured client-side.
  source JSONB,

  -- 'new' | 'contacted' | 'won' | 'lost' — staff advance it as they work it.
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),

  -- Free-text internal notes appended by staff over time (newline-separated).
  staff_notes TEXT,

  -- Notification flag. NULL = unseen (counts toward the sidebar badge).
  -- Set to NOW() the first time a staff member opens the lead.
  seen_at TIMESTAMPTZ,

  -- When the lead was submitted on the public site (its createdAt).
  submitted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_status  ON enquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_unseen  ON enquiries(seen_at) WHERE seen_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enquiries_updated_at') THEN
    CREATE TRIGGER trg_enquiries_updated_at
      BEFORE UPDATE ON enquiries
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 3. RLS — single-tenant (any authenticated user) -------------------------
-- Server-to-server ingest uses the service-role key, which bypasses RLS.
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enquiries' AND policyname='p_enquiries_auth')
    THEN CREATE POLICY p_enquiries_auth ON enquiries FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- Verify
SELECT r.slug AS role, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE m.slug = 'enquiries'
 ORDER BY r.display_order;
