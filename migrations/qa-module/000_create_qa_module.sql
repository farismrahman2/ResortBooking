-- =====================================================================
-- Guest Feedback / QA Module — Phase 1 Schema
-- Mirrors the idempotent style of migrations/crm-module/000_*.sql
-- =====================================================================
-- What this adds:
--  * qa_reviews table — one post-stay feedback record per booking, keyed
--    to the guest by customer_phone (digits only) so repeat guests
--    accumulate a feedback history across stays
--  * 'qa' module (display_order 13 — 12 = fixed_assets)
--  * 'review_collector' role — write on qa, none on everything else.
--    Dedicated role for the team member doing post-checkout QA calls.
--  * qa permissions for existing roles (admin/manager/ops write,
--    front_desk/reservation/md read — booking-side roles need read so
--    the returning-guest feedback panel shows on quotes/bookings)
-- =====================================================================

-- 0a. Extend roles slug CHECK to include the new role (keep all existing!)
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE roles ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('admin','manager','front_desk','accountant','reservation','corporate_sales','operations_manager','md','review_collector'));

INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('review_collector', 'Review Collector', 'Post-checkout guest feedback calls (QA) — no other modules', 9)
ON CONFLICT (slug) DO NOTHING;

-- 0b. Register `qa` module + seed permissions
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('qa', 'Guest Feedback', 'Post-stay QA calls: room service, food, general issues', 13)
ON CONFLICT (slug) DO NOTHING;

-- qa permissions per role
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'operations_manager' THEN 'write'
    WHEN 'review_collector'   THEN 'write'
    WHEN 'md'                 THEN 'read'
    WHEN 'front_desk'         THEN 'read'
    WHEN 'reservation'        THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'qa'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- review_collector: 'none' on every other module (explicit rows so the
-- settings permission matrix renders a complete row for the role)
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'none'
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'review_collector' AND m.slug <> 'qa'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 1. qa_reviews — one feedback record per booking ------------------------
CREATE TABLE IF NOT EXISTS qa_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  -- Guest identity, denormalized from the booking at review time.
  -- customer_phone is normalized to digits only on write so the same guest
  -- matches across stays regardless of hyphenation.
  customer_phone TEXT NOT NULL,
  customer_name  TEXT NOT NULL,

  -- 'completed'   = feedback collected
  -- 'unreachable' = called but could not reach the guest
  -- 'declined'    = guest did not want to give feedback
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','unreachable','declined')),

  -- The three QA criteria
  room_service_rating  INT CHECK (room_service_rating BETWEEN 1 AND 5),
  room_service_comment TEXT,
  food_rating          INT CHECK (food_rating BETWEEN 1 AND 5),
  food_comment         TEXT,
  other_issue          BOOLEAN NOT NULL DEFAULT false,
  other_comment        TEXT,

  overall_rating INT CHECK (overall_rating BETWEEN 1 AND 5),
  would_return   TEXT CHECK (would_return IN ('yes','no','maybe')),

  -- A completed review must carry all three criterion ratings
  CONSTRAINT qa_reviews_completed_ratings CHECK (
    status <> 'completed'
    OR (room_service_rating IS NOT NULL AND food_rating IS NOT NULL AND overall_rating IS NOT NULL)
  ),

  reviewed_by      UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  reviewed_by_name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_reviews_phone   ON qa_reviews(customer_phone);
CREATE INDEX IF NOT EXISTS idx_qa_reviews_created ON qa_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_reviews_status  ON qa_reviews(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qa_reviews_updated_at') THEN
    CREATE TRIGGER trg_qa_reviews_updated_at
      BEFORE UPDATE ON qa_reviews
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 2. Extend history_log entity_type CHECK --------------------------------
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan',
    'user','role','checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit',
    'qa_review'
  ));

-- 3. RLS — single-tenant (any authenticated user) -------------------------
ALTER TABLE qa_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='qa_reviews' AND policyname='p_qa_reviews_auth')
    THEN CREATE POLICY p_qa_reviews_auth ON qa_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true); END IF;
END $$;

-- Verify
SELECT r.slug AS role, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE m.slug = 'qa'
 ORDER BY r.display_order;
