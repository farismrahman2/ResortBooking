-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 003 — who made each quote and booking
--
-- Corporate Sales may see only the quotes and bookings they made themselves.
-- created_by defaults to the signed-in user (auth.uid()) on insert; a booking
-- converted from a quote copies the quote's creator (lib/actions/bookings.ts).
-- Existing rows stay NULL (made before this was tracked). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.quotes   ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS quotes_created_by_idx   ON public.quotes (created_by);
CREATE INDEX IF NOT EXISTS bookings_created_by_idx ON public.bookings (created_by);
