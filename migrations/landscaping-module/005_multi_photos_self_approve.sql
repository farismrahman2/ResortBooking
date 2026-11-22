-- ─────────────────────────────────────────────────────────────────────────────
-- Landscaping · 005 — several photos per slip, self-approval
--
-- extra_photo_paths: more photos/PDFs beside the first (photo_path /
--   slip_photo_path), e.g. a two-page slip or several receipts.
-- self_approved: the approver prepared it and approved it in one step; the
--   name written as approver is in paper_approved_by.
-- Landscaping tables only. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ls_requisitions  ADD COLUMN IF NOT EXISTS extra_photo_paths TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ls_requisitions  ADD COLUMN IF NOT EXISTS self_approved     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ls_bills         ADD COLUMN IF NOT EXISTS extra_photo_paths TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE ls_bill_payments ADD COLUMN IF NOT EXISTS extra_photo_paths TEXT[] NOT NULL DEFAULT '{}';
