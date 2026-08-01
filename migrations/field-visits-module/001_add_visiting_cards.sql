-- =====================================================================
-- Field Visits — visiting card capture
-- =====================================================================
-- A rep collects a business card at the visit; this stores the photo of it.
--
-- Cards attach to the VISIT, not to a contact row. That's deliberate:
-- saveDraftVisit replaces the whole contacts child set on every autosave, so
-- contact ids churn constantly and a contact_id FK here would break on the
-- next keystroke. `contact_label` is a free-text snapshot of whose card it is.
--
-- Mirrors the expense-receipts pattern (private bucket + metadata table +
-- signed URLs on read).
-- =====================================================================

CREATE TABLE IF NOT EXISTS crm_field_visit_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      UUID NOT NULL REFERENCES crm_field_visits(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  /** Whose card this is — free text, snapshotted from the contact at upload. */
  contact_label TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE crm_field_visit_cards IS 'OUT.02 — photos of visiting cards collected on the visit';

CREATE INDEX IF NOT EXISTS idx_fv_cards_visit ON crm_field_visit_cards(visit_id);

ALTER TABLE crm_field_visit_cards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_field_visit_cards' AND policyname='crm_fv_cards_all') THEN
    CREATE POLICY crm_fv_cards_all ON crm_field_visit_cards
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Private storage bucket for the card images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('field-visit-cards', 'field-visit-cards', false)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated staff member can read/write cards; the app layer enforces
-- the field_visits module permission before ever reaching storage.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='fv_cards_read') THEN
    CREATE POLICY fv_cards_read ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'field-visit-cards');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='fv_cards_insert') THEN
    CREATE POLICY fv_cards_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'field-visit-cards');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='fv_cards_delete') THEN
    CREATE POLICY fv_cards_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'field-visit-cards');
  END IF;
END $$;

SELECT 'crm_field_visit_cards' AS table_name, COUNT(*) AS row_count FROM crm_field_visit_cards
UNION ALL SELECT 'bucket', COUNT(*) FROM storage.buckets WHERE id = 'field-visit-cards';
