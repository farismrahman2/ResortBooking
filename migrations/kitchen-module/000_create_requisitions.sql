-- =====================================================================
-- Kitchen Requisitions — Phase 1
-- =====================================================================
-- Digitises the paper "PAX KITCHEN Requisition" form and the approval +
-- per-vendor dispatch that follows it. Deliveries, supplier rates and cheque
-- payments are phases 2 and 3 — see docs/KITCHEN-REQUISITION-PLAN.md.
--
-- WHY A SEPARATE VENDOR DIMENSION:
--   inv_categories has meat_fish as ONE category, but fish, chicken and beef
--   are three separate suppliers. "Grocery" conversely spans four categories
--   (rice_grains, spices, oil_ghee, packaged). The paper form's printed
--   columns don't map to vendors either. So which supplier provides an item
--   is its own dimension, independent of the stock category it belongs to.
--
-- Idempotent — safe to run repeatedly.
-- =====================================================================

-- 1. Register the module + per-role permissions ---------------------------
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('kitchen', 'Kitchen', 'Kitchen requisitions and supplier orders', 17)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE r.slug
    WHEN 'admin'              THEN 'write'
    WHEN 'manager'            THEN 'write'
    WHEN 'operations_manager' THEN 'write'
    WHEN 'md'                 THEN 'read'
    WHEN 'accountant'         THEN 'read'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE m.slug = 'kitchen'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 2. The six vendor slots -------------------------------------------------
-- Editable rows rather than an enum: a seventh supplier type (bakery, ice)
-- should not need a migration.
CREATE TABLE IF NOT EXISTS kitchen_vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  sort_order    INT  NOT NULL DEFAULT 0,
  /* Per-vendor WhatsApp templates. The beef group and the chicken group use
     visibly different layouts and the suppliers read them nightly, so we keep
     each vendor's own format rather than imposing one house style. NULL = use
     the built-in default. */
  order_template   TEXT,
  bill_template    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO kitchen_vendors (slug, display_name, sort_order) VALUES
  ('vegetable',    'Vegetable',      1),
  ('grocery',      'Grocery',        2),
  ('fish',         'Fish',           3),
  ('chicken',      'Chicken',        4),
  ('beef',         'Beef',           5),
  ('water_drinks', 'Water & Drinks', 6)
ON CONFLICT (slug) DO NOTHING;

-- 3. Tag items and suppliers with their vendor ----------------------------
ALTER TABLE inv_items
  ADD COLUMN IF NOT EXISTS kitchen_vendor_id UUID REFERENCES kitchen_vendors(id);
COMMENT ON COLUMN inv_items.kitchen_vendor_id IS
  'Which kitchen supplier provides this item. Independent of category_id — meat_fish covers three vendors.';

ALTER TABLE inv_suppliers
  ADD COLUMN IF NOT EXISTS kitchen_vendor_id  UUID REFERENCES kitchen_vendors(id),
  ADD COLUMN IF NOT EXISTS is_kitchen_supplier BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inv_items_kvendor ON inv_items(kitchen_vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_suppliers_kvendor ON inv_suppliers(kitchen_vendor_id);

-- Best-effort pre-tag where the existing category is unambiguous. meat_fish
-- is deliberately left alone — it spans fish, chicken AND beef, so splitting
-- it is a human decision, not something to guess at.
UPDATE inv_items i SET kitchen_vendor_id = v.id
  FROM inv_categories c, kitchen_vendors v
 WHERE i.category_id = c.id
   AND i.kitchen_vendor_id IS NULL
   AND (
     (c.slug = 'vegetables'   AND v.slug = 'vegetable')
     OR (c.slug = 'beverages_k' AND v.slug = 'water_drinks')
     OR (c.slug IN ('rice_grains','spices','oil_ghee','packaged') AND v.slug = 'grocery')
   );

-- 4. The requisition ------------------------------------------------------
CREATE TABLE IF NOT EXISTS kitchen_requisitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_no    TEXT UNIQUE NOT NULL,          -- RQ-0008
  /* The date the food is FOR — this is what the supplier messages quote as
     "Event date", and it is not the same as when the requisition was raised. */
  event_date        DATE NOT NULL,
  requisition_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending_approval','approved','cancelled')),
  /* An emergency order is raised after the day's requisition was already
     approved, and gets its own number, approval and (later) its own bill. */
  is_emergency      BOOLEAN NOT NULL DEFAULT false,
  parent_requisition_id UUID REFERENCES kitchen_requisitions(id) ON DELETE SET NULL,

  -- Approval. The NAMED person is an employee (mirrors quotes.sales_employee_id);
  -- approved_by_user_id records who actually clicked, which may differ.
  approved_by_employee_id UUID REFERENCES employees(id),
  approved_by_user_id     UUID REFERENCES auth.users(id),
  approved_at             TIMESTAMPTZ,
  approval_notes          TEXT,

  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_requisition_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id    UUID NOT NULL REFERENCES kitchen_requisitions(id) ON DELETE CASCADE,
  sort_order        INT  NOT NULL DEFAULT 0,
  item_id           UUID REFERENCES inv_items(id),
  /* Snapshots. Renaming an item or re-tagging its vendor next month must not
     silently rewrite what last month's APPROVED requisition said. */
  item_name         TEXT NOT NULL,
  kitchen_vendor_id UUID REFERENCES kitchen_vendors(id),
  qty               NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  /* Second quantity for lines counted one way and billed another:
     "Chicken sonali (40 pcs( 31x335)" is 40 birds, 31 kg, billed per kg.
     qty is always what the money is calculated from; piece_count is the
     extra human detail when it differs. Eggs bill per piece, so they use
     qty and leave this null. */
  piece_count       NUMERIC(12,3),
  unit_id           UUID REFERENCES inv_units(id),
  notes             TEXT,
  /* Added after the initial draft was written — the "extra items" on the
     paper form that get squeezed into the margin. */
  is_extra          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kreq_event_date ON kitchen_requisitions(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_kreq_status     ON kitchen_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_kreq_lines_req  ON kitchen_requisition_lines(requisition_id);
CREATE INDEX IF NOT EXISTS idx_kreq_lines_vendor ON kitchen_requisition_lines(kitchen_vendor_id);

-- 5. updated_at trigger ---------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_kreq_updated_at') THEN
    CREATE TRIGGER trg_kreq_updated_at BEFORE UPDATE ON kitchen_requisitions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 6. RLS ------------------------------------------------------------------
ALTER TABLE kitchen_vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_requisitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_requisition_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kitchen_vendors' AND policyname='kitchen_vendors_all') THEN
    CREATE POLICY kitchen_vendors_all ON kitchen_vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kitchen_requisitions' AND policyname='kitchen_requisitions_all') THEN
    CREATE POLICY kitchen_requisitions_all ON kitchen_requisitions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kitchen_requisition_lines' AND policyname='kitchen_req_lines_all') THEN
    CREATE POLICY kitchen_req_lines_all ON kitchen_requisition_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7. history_log entity_type (full superset + new value) -------------------
ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan','user','role',
    'checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit',
    'qa_review','menu_day','crm_field_visit',
    'kitchen_requisition'
  ));

-- 8. Verify ---------------------------------------------------------------
SELECT 'kitchen_vendors' AS item, COUNT(*)::text AS val FROM kitchen_vendors
UNION ALL SELECT 'requisitions', COUNT(*)::text FROM kitchen_requisitions
UNION ALL SELECT 'items_tagged', COUNT(*)::text FROM inv_items WHERE kitchen_vendor_id IS NOT NULL
UNION ALL SELECT 'items_untagged', COUNT(*)::text FROM inv_items WHERE kitchen_vendor_id IS NULL
UNION ALL SELECT 'module', COUNT(*)::text FROM modules WHERE slug='kitchen';
