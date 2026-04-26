-- ============================================================================
-- Migration E — Storage bucket policies for receipt attachments
-- ============================================================================
-- BEFORE running this SQL: in the Supabase Dashboard go to Storage →
-- Create new bucket → name `expense-receipts` → Private (NOT public).
--
-- Then run this SQL to grant any authenticated user full access to the
-- bucket (matches the existing single-tenant RLS pattern).
--
-- Path convention used by the app: <YYYY>/<MM>/<expense_id>/<filename>
-- ============================================================================

-- Drop existing policies if re-running (idempotent)
DROP POLICY IF EXISTS "auth read receipts"   ON storage.objects;
DROP POLICY IF EXISTS "auth upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "auth update receipts" ON storage.objects;
DROP POLICY IF EXISTS "auth delete receipts" ON storage.objects;

CREATE POLICY "auth read receipts"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'expense-receipts');

CREATE POLICY "auth upload receipts"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "auth update receipts"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'expense-receipts')
    WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "auth delete receipts"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'expense-receipts');
