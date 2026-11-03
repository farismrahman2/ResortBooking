-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 006 — bookings and quotes
--
-- Run after the app change that reads booking dates/headcounts for
-- availability, the overbooking guard, QA, kitchen/menu headcounts, CRM and
-- booking/quote numbering through the server (they must see every row).
--
-- bookings: Bookings, Checkout or Reports may read; Corporate Sales
--   (app_create_only) only the ones they made. Writing needs Bookings write
--   (Corporate Sales: insert/delete own only — never change one) or Checkout
--   write (finalise, reopen, no-show set the status).
-- quotes: Bookings or Reports; Corporate Sales their own (they may edit their
--   own quote until it is converted).
-- Room/day child rows follow their parent: visible when the parent is.
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Who may see / write a booking or quote row (by its creator).
CREATE OR REPLACE FUNCTION public.app_sees_booking(p_created_by UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_can('checkout', 'read') OR public.app_can('reports', 'read')
      OR (public.app_can('bookings', 'read') AND (NOT public.app_create_only() OR p_created_by = auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.app_sees_quote(p_created_by UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_can('reports', 'read')
      OR (public.app_can('bookings', 'read') AND (NOT public.app_create_only() OR p_created_by = auth.uid()))
$$;
CREATE OR REPLACE FUNCTION public.app_writes_own(p_created_by UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_can('bookings', 'write') AND (NOT public.app_create_only() OR p_created_by = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.app_sees_booking(UUID), public.app_sees_quote(UUID), public.app_writes_own(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sees_booking(UUID), public.app_sees_quote(UUID), public.app_writes_own(UUID) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'sec_read') THEN
    CREATE POLICY sec_read   ON public.bookings AS RESTRICTIVE FOR SELECT TO authenticated USING (public.app_sees_booking(created_by));
    CREATE POLICY sec_insert ON public.bookings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.app_writes_own(created_by));
    CREATE POLICY sec_update ON public.bookings AS RESTRICTIVE FOR UPDATE TO authenticated
      USING  ((public.app_can('bookings', 'write') AND NOT public.app_create_only()) OR public.app_can('checkout', 'write'))
      WITH CHECK ((public.app_can('bookings', 'write') AND NOT public.app_create_only()) OR public.app_can('checkout', 'write'));
    CREATE POLICY sec_delete ON public.bookings AS RESTRICTIVE FOR DELETE TO authenticated USING (public.app_writes_own(created_by));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'quotes' AND policyname = 'sec_read') THEN
    CREATE POLICY sec_read   ON public.quotes AS RESTRICTIVE FOR SELECT TO authenticated USING (public.app_sees_quote(created_by));
    CREATE POLICY sec_insert ON public.quotes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.app_writes_own(created_by));
    CREATE POLICY sec_update ON public.quotes AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.app_writes_own(created_by)) WITH CHECK (public.app_writes_own(created_by));
    CREATE POLICY sec_delete ON public.quotes AS RESTRICTIVE FOR DELETE TO authenticated USING (public.app_writes_own(created_by));
  END IF;
END $$;

-- Child rows: visible/writable exactly when the parent row is visible.
SELECT public.sec_lock('booking_rooms', 'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id)', 'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id)');
SELECT public.sec_lock('booking_days',  'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id)', 'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id)');
SELECT public.sec_lock('booking_day_rooms', 'EXISTS (SELECT 1 FROM public.booking_days d WHERE d.id = booking_day_id)', 'EXISTS (SELECT 1 FROM public.booking_days d WHERE d.id = booking_day_id)');
SELECT public.sec_lock('quote_rooms', 'EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id)', 'EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id)');
SELECT public.sec_lock('quote_days',  'EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id)', 'EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id)');
SELECT public.sec_lock('quote_day_rooms', 'EXISTS (SELECT 1 FROM public.quote_days d WHERE d.id = quote_day_id)', 'EXISTS (SELECT 1 FROM public.quote_days d WHERE d.id = quote_day_id)');
