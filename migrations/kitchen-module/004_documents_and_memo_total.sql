-- ============================================================================
-- Kitchen module · 004 — photos, and the supplier's own total
--
-- Two things, both drawn from how the paperwork is actually handled.
--
-- 1. DOCUMENTS. The paper doesn't stop existing because the data is typed in.
--    The signed requisition, the supplier's receipt book page, the cheque
--    counterfoil — those are the evidence when a total is disputed weeks
--    later, and photographing them is already the habit.
--
--    One polymorphic table rather than a photo column per entity: a payment
--    might carry a cheque photo and a deposit slip, a delivery might carry
--    three receipts because the fish supplier writes one per trip. A single
--    `photo_path` column cannot hold that, and discovering so afterwards means
--    a migration per entity.
--
-- 2. SUPPLIER MEMO TOTAL. We compute the bill from quantity × rate, so our
--    arithmetic is right by construction. The supplier's handwritten memo is
--    NOT — a receipt totalling 10,260 whose lines come to 10,640 is a real
--    380/- gap, and it is found by comparing the two numbers, which means
--    storing what their paper says alongside what ours does.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

-- 1. What the supplier's own memo claims ------------------------------------

ALTER TABLE kitchen_deliveries
  ADD COLUMN IF NOT EXISTS supplier_memo_total NUMERIC(14,2);

COMMENT ON COLUMN kitchen_deliveries.supplier_memo_total IS
  'The total written on the supplier''s paper memo. Compared against the sum '
  'of our lines to surface arithmetic errors on their side; never used as the '
  'amount owed.';


-- 2. Documents --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kitchen_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  /* Polymorphic rather than three FKs: the alternative is three near-identical
     tables and three near-identical uploaders. */
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('requisition','delivery','payment')),
  entity_id    UUID NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'photo'
                 CHECK (kind IN ('photo','receipt','cheque','requisition_form','other')),
  storage_path TEXT NOT NULL UNIQUE,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  caption      TEXT,
  uploaded_by  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No FK, because entity_id points at three different tables. The delete paths
-- in lib/actions clean these up explicitly; an orphan row is inert either way.
CREATE INDEX IF NOT EXISTS kitchen_documents_entity_idx
  ON kitchen_documents (entity_type, entity_id);

ALTER TABLE kitchen_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kitchen_documents' AND policyname='kitchen_documents_all') THEN
    CREATE POLICY kitchen_documents_all ON kitchen_documents
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 3. Private bucket ---------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('kitchen-docs', 'kitchen-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated staff member can read/write; the app layer enforces the
-- kitchen module permission long before a request reaches storage.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='kitchen_docs_read') THEN
    CREATE POLICY kitchen_docs_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'kitchen-docs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='kitchen_docs_insert') THEN
    CREATE POLICY kitchen_docs_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'kitchen-docs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='kitchen_docs_delete') THEN
    CREATE POLICY kitchen_docs_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'kitchen-docs');
  END IF;
END $$;


-- 4. Verify -----------------------------------------------------------------

SELECT 'kitchen_documents' AS item, COUNT(*)::text AS val FROM kitchen_documents
UNION ALL SELECT 'bucket', COUNT(*)::text FROM storage.buckets WHERE id = 'kitchen-docs';
