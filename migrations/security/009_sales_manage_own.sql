-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 009 — Corporate Sales manage their OWN bookings fully
--
-- Before: create-only users could never update a booking row. Now they may
-- update a booking they created — money included — and still nothing else.
-- Child rows (rooms, days, advance payments) already follow the parent /
-- ownership. Every change is logged to the admin by the app.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER POLICY sec_update ON public.bookings
  USING  ((public.app_can('bookings', 'write') AND (NOT public.app_create_only() OR created_by = auth.uid())) OR public.app_can('checkout', 'write'))
  WITH CHECK ((public.app_can('bookings', 'write') AND (NOT public.app_create_only() OR created_by = auth.uid())) OR public.app_can('checkout', 'write'));
