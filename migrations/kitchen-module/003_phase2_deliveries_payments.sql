-- ============================================================================
-- Kitchen module · 003 — dispatch log, amendments, deliveries, payments
--
-- Phase 1 stopped at "the order was sent". Everything after that — what
-- actually arrived, what it cost, and what we paid — happened outside the
-- system. This closes that loop.
--
-- Four ideas, in dependency order:
--
--  1. DISPATCH LOG. The copy button forgot it was pressed, so nothing knew
--     whether an order had actually gone out. That single fact decides
--     whether a change is an edit or an amendment, answers "did anyone send
--     the vegetable order?", and — via message_snapshot — is the evidence of
--     what the supplier was told when a delivery doesn't match.
--
--  2. AMENDMENTS. Once an order has gone out it must not be silently edited:
--     six WhatsApp groups hold the original and a printed sheet is on a
--     clipboard. A change becomes a CHILD requisition carrying only the delta,
--     approved on its own, dispatched only to the vendors it touches. Lines
--     may therefore be negative ("cancel 2 of the 5 kg beef"), which the
--     original qty > 0 check forbade.
--
--  3. DELIVERIES. What arrived, at what rate. Ordered and delivered quantity
--     are separate columns so a shortfall is visible rather than inferred.
--
--  4. PAYMENTS + ALLOCATIONS. One Dutch-Bangla cheque settles many
--     deliveries, so payment→delivery is many-to-many. That join is the only
--     reason `outstanding = Σ deliveries − Σ allocations` can be computed at
--     all; without it you can total what you bought and what you paid, but
--     never say which bills are still open.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- 1. Dispatch log -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitchen_requisition_dispatches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id    UUID NOT NULL REFERENCES kitchen_requisitions(id) ON DELETE CASCADE,
  kitchen_vendor_id UUID NOT NULL REFERENCES kitchen_vendors(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by_user_id   UUID,
  /* Exactly what was copied. When 8kg arrives against a 5kg order, this is
     the only record of which number the supplier was actually given. */
  message_snapshot  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per vendor per requisition; re-copying updates sent_at rather than
-- piling up rows, so "sent" stays a fact and not a count.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_dispatch_req_vendor_uq
  ON kitchen_requisition_dispatches (requisition_id, kitchen_vendor_id);
CREATE INDEX IF NOT EXISTS kitchen_dispatch_req_idx
  ON kitchen_requisition_dispatches (requisition_id);


-- 2. Amendment support ------------------------------------------------------

-- Negative lines express a reduction. Zero is still meaningless.
ALTER TABLE kitchen_requisition_lines DROP CONSTRAINT IF EXISTS kitchen_requisition_lines_qty_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_requisition_lines_qty_nonzero'
  ) THEN
    ALTER TABLE kitchen_requisition_lines
      ADD CONSTRAINT kitchen_requisition_lines_qty_nonzero CHECK (qty <> 0);
  END IF;
END $$;

-- Amendments are numbered off the parent: RQ-0003-A, RQ-0003-B. The letter is
-- derived from this counter so two amendments raised minutes apart can't
-- collide on a name.
ALTER TABLE kitchen_requisitions
  ADD COLUMN IF NOT EXISTS amendment_seq INT;

CREATE INDEX IF NOT EXISTS kitchen_requisitions_parent_idx
  ON kitchen_requisitions (parent_requisition_id)
  WHERE parent_requisition_id IS NOT NULL;


-- 3. Deliveries -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitchen_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_no         TEXT NOT NULL UNIQUE,
  /* Nullable on purpose: suppliers deliver against no requisition more often
     than anyone admits, and a delivery we can't record is a bill we can't
     reconcile. */
  requisition_id      UUID REFERENCES kitchen_requisitions(id) ON DELETE SET NULL,
  kitchen_vendor_id   UUID NOT NULL REFERENCES kitchen_vendors(id),
  supplier_id         UUID REFERENCES inv_suppliers(id),
  delivery_date       DATE NOT NULL,
  /* The number on the supplier's own paper memo. */
  supplier_memo_no    TEXT,
  received_by_employee_id UUID REFERENCES employees(id),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','confirmed','cancelled')),
  /* Denormalised sum of the lines. Recomputed on every line write — the
     vendor ledger reads it per row and must not re-aggregate to show a list. */
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  memo_photo_path     TEXT,
  notes               TEXT,
  cancel_reason       TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kitchen_deliveries_date_idx   ON kitchen_deliveries (delivery_date DESC);
CREATE INDEX IF NOT EXISTS kitchen_deliveries_vendor_idx ON kitchen_deliveries (kitchen_vendor_id);
CREATE INDEX IF NOT EXISTS kitchen_deliveries_req_idx    ON kitchen_deliveries (requisition_id);

CREATE TABLE IF NOT EXISTS kitchen_delivery_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id         UUID NOT NULL REFERENCES kitchen_deliveries(id) ON DELETE CASCADE,
  sort_order          INT  NOT NULL DEFAULT 0,
  requisition_line_id UUID REFERENCES kitchen_requisition_lines(id) ON DELETE SET NULL,
  item_id             UUID REFERENCES inv_items(id),
  item_name           TEXT NOT NULL,
  /* Snapshot of what was asked for, so a later amendment to the requisition
     can't rewrite the shortfall this delivery recorded. */
  qty_ordered         NUMERIC(12,3),
  qty_delivered       NUMERIC(12,3) NOT NULL CHECK (qty_delivered >= 0),
  /* Goods sent back — bad fish, short weight. Billed quantity is
     qty_delivered; rejected_qty is recorded so the argument has a record. */
  rejected_qty        NUMERIC(12,3) CHECK (rejected_qty IS NULL OR rejected_qty >= 0),
  reject_reason       TEXT,
  piece_count         NUMERIC(12,3),
  unit_id             UUID REFERENCES inv_units(id),
  unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  /* Brought without being asked for. Never blocked — refusing a delivery at
     6am isn't practical — but counted, so stock-pushing shows as a pattern. */
  is_unrequested      BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kitchen_delivery_lines_delivery_idx ON kitchen_delivery_lines (delivery_id);
CREATE INDEX IF NOT EXISTS kitchen_delivery_lines_item_idx     ON kitchen_delivery_lines (item_id);


-- 4. Payments and allocations ----------------------------------------------

CREATE TABLE IF NOT EXISTS kitchen_vendor_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no        TEXT NOT NULL UNIQUE,
  kitchen_vendor_id UUID NOT NULL REFERENCES kitchen_vendors(id),
  supplier_id       UUID REFERENCES inv_suppliers(id),
  payment_date      DATE NOT NULL,
  method            TEXT NOT NULL DEFAULT 'cheque'
                      CHECK (method IN ('cheque','cash','bank_transfer','bkash','nagad','adjustment')),
  /* Cheque detail — the Dutch-Bangla slips are the normal instrument here. */
  cheque_no         TEXT,
  cheque_date       DATE,
  bank_name         TEXT,
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  photo_path        TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'recorded'
                      CHECK (status IN ('recorded','cancelled')),
  cancel_reason     TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kitchen_payments_vendor_idx ON kitchen_vendor_payments (kitchen_vendor_id);
CREATE INDEX IF NOT EXISTS kitchen_payments_date_idx   ON kitchen_vendor_payments (payment_date DESC);

CREATE TABLE IF NOT EXISTS kitchen_payment_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       UUID NOT NULL REFERENCES kitchen_vendor_payments(id) ON DELETE CASCADE,
  delivery_id      UUID NOT NULL REFERENCES kitchen_deliveries(id) ON DELETE CASCADE,
  amount_allocated NUMERIC(14,2) NOT NULL CHECK (amount_allocated > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A payment settles a given delivery once; a second thought about the amount
-- is an update, not another row.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_alloc_payment_delivery_uq
  ON kitchen_payment_allocations (payment_id, delivery_id);
CREATE INDEX IF NOT EXISTS kitchen_alloc_delivery_idx ON kitchen_payment_allocations (delivery_id);


-- 5. RLS --------------------------------------------------------------------

ALTER TABLE kitchen_requisition_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_deliveries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_delivery_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_vendor_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_payment_allocations    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kitchen_requisition_dispatches','kitchen_deliveries','kitchen_delivery_lines',
    'kitchen_vendor_payments','kitchen_payment_allocations'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_all') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all', t);
    END IF;
  END LOOP;
END $$;


-- 6. history_log entity_type (full superset + new values) -------------------

ALTER TABLE history_log DROP CONSTRAINT IF EXISTS history_log_entity_type_check;
ALTER TABLE history_log ADD CONSTRAINT history_log_entity_type_check
  CHECK (entity_type IN (
    'quote','booking','expense','employee','payroll_run','loan','user','role',
    'checkout','charge_item','coffee_shop_sale',
    'inv_item','inv_supplier','inv_movement','inv_count',
    'crm_account','crm_contact','crm_opportunity','crm_activity',
    'fa_asset','fa_maintenance','fa_audit',
    'qa_review','menu_day','crm_field_visit',
    'kitchen_requisition','kitchen_delivery','kitchen_payment'
  ));


-- 7. Verify -----------------------------------------------------------------

SELECT 'dispatches'  AS item, COUNT(*)::text AS val FROM kitchen_requisition_dispatches
UNION ALL SELECT 'deliveries',  COUNT(*)::text FROM kitchen_deliveries
UNION ALL SELECT 'payments',    COUNT(*)::text FROM kitchen_vendor_payments
UNION ALL SELECT 'allocations', COUNT(*)::text FROM kitchen_payment_allocations;
