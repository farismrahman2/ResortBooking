-- ─────────────────────────────────────────────────────────────────────────────
-- Performance · 001 — Phase 1 database tidy-up
--
--   1. quote_status_counts(): the dashboard's four quote counts in one query
--      (the four separate counts were the most expensive query on the DB).
--   2. Indexes for the query shapes the app actually runs.
--   3. Duplicate indexes dropped (booking_number ×3, quote_number ×4,
--      checkouts.booking_id ×2) — every write was maintaining the copies.
--   4. Duplicate RLS policies dropped: 52 tables each carry two identical
--      permissive "authenticated, ALL, true" policies. Only the redundant
--      `authenticated_all` copy goes, and only where an identical sibling
--      remains — who can read or write what does not change.
--
-- STATUS: sections 1 and 2 are LIVE (applied 2026-10-08). Sections 3, 4
-- and the VACUUM still need running by hand in the Supabase SQL editor —
-- the connector requires an approval for DROP statements.
--
-- Safe to re-run. The tables are small (~1.3k rows), so plain CREATE INDEX
-- holds its lock for milliseconds. Run VACUUM (at the bottom) separately —
-- it cannot run inside a transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. One-query quote counts ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quote_status_counts()
 RETURNS TABLE(status text, n bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT q.status::text, count(*) FROM quotes q GROUP BY q.status;
$function$;
GRANT EXECUTE ON FUNCTION public.quote_status_counts() TO authenticated;

-- 2. Indexes ────────────────────────────────────────────────────────────────
-- quotes list (newest first) and analytics windows on created_at
CREATE INDEX IF NOT EXISTS idx_quotes_created_at   ON public.quotes   (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings (created_at DESC);
-- confirmed, not-yet-converted quotes hold rooms: availability + checkout-day lookups
CREATE INDEX IF NOT EXISTS idx_quotes_confirmed_visit ON public.quotes (visit_date, check_out_date)
  WHERE status = 'confirmed' AND converted_to_booking_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_checkout_open ON public.quotes (check_out_date)
  WHERE status = 'confirmed' AND converted_to_booking_id IS NULL;
-- stay-overlap filters (visit_date <= x AND check_out_date > y)
CREATE INDEX IF NOT EXISTS idx_bookings_visit_checkout ON public.bookings (visit_date, check_out_date);
-- foreign keys used in joins
CREATE INDEX IF NOT EXISTS idx_bookings_quote_id ON public.bookings (quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_charges_item ON public.checkout_charges (charge_item_id);

-- 3. Duplicate indexes (the constraint-backed unique index of each stays) ──
DROP INDEX IF EXISTS public.uq_bookings_booking_number;
DROP INDEX IF EXISTS public.idx_bookings_booking_number;
DROP INDEX IF EXISTS public.uq_quotes_quote_number;
DROP INDEX IF EXISTS public.idx_quotes_number;
DROP INDEX IF EXISTS public.idx_quotes_quote_number;
DROP INDEX IF EXISTS public.idx_checkouts_booking;

-- 4. Duplicate RLS policies ─────────────────────────────────────────────────
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT a.tablename
      FROM pg_policies a
      JOIN pg_policies b
        ON b.schemaname = a.schemaname AND b.tablename = a.tablename
       AND b.policyname <> a.policyname
       AND b.permissive = a.permissive AND b.cmd = a.cmd
       AND b.roles = a.roles
       AND coalesce(b.qual, '') = coalesce(a.qual, '')
       AND coalesce(b.with_check, '') = coalesce(a.with_check, '')
     WHERE a.schemaname = 'public' AND a.policyname = 'authenticated_all'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON public.%I', t.tablename);
  END LOOP;
END $$;

-- Run on its own, outside a transaction:
-- VACUUM (ANALYZE) public.quotes, public.checkouts, public.bookings;
