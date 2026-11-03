-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 005 — expenses, checkout, payments, coffee shop sales
--
-- Run after the app change that posts automatic expense rows (refunds,
-- payroll, fixed assets, inventory receipts, kitchen payments) through the
-- server, and runs get_booking_stats with server access.
--
-- app_create_only(): the caller is Corporate Sales — may only create bookings
-- and see the ones they made (lib/auth/create-only.ts).
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_create_only()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up JOIN roles r ON r.id = up.role_id
     WHERE up.user_id = auth.uid() AND r.slug = 'corporate_sales'
  )
$$;
REVOKE ALL ON FUNCTION public.app_create_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_create_only() TO authenticated, service_role;

-- Expenses and their receipts: Expenses (and Reports to read).
SELECT public.sec_lock(t,
  '((SELECT public.app_can(''expenses'', ''read'')) OR (SELECT public.app_can(''reports'', ''read'')))',
  '(SELECT public.app_can(''expenses'', ''write''))')
  FROM unnest(ARRAY['expenses', 'expense_attachments']) t;

-- Checkouts, extra charges, checkout payments: Checkout (and Reports to read).
SELECT public.sec_lock(t,
  '((SELECT public.app_can(''checkout'', ''read'')) OR (SELECT public.app_can(''reports'', ''read'')))',
  '(SELECT public.app_can(''checkout'', ''write''))')
  FROM unnest(ARRAY['checkouts', 'checkout_charges', 'checkout_payments']) t;

-- Coffee shop sales: Coffee shop; Inventory reads them for stock; Reports.
SELECT public.sec_lock(t,
  '((SELECT public.app_can(''coffee_shop'', ''read'')) OR (SELECT public.app_can(''inventory'', ''read'')) OR (SELECT public.app_can(''reports'', ''read'')))',
  '(SELECT public.app_can(''coffee_shop'', ''write''))')
  FROM unnest(ARRAY['coffee_shop_sales', 'coffee_shop_sale_items', 'coffee_shop_sale_payments']) t;

-- Advance payments: Bookings, Checkout or Reports — Corporate Sales only on
-- bookings they made (converting their quote records its advance).
SELECT public.sec_lock('booking_advance_payments',
  '((SELECT public.app_can(''checkout'', ''read'')) OR (SELECT public.app_can(''reports'', ''read''))
    OR ((SELECT public.app_can(''bookings'', ''read'')) AND (NOT (SELECT public.app_create_only())
        OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.created_by = auth.uid()))))',
  '((SELECT public.app_can(''bookings'', ''write'')) AND (NOT (SELECT public.app_create_only())
        OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.created_by = auth.uid())))');

-- Payment accounts (bKash / bank numbers): who takes or reports money; Settings edits.
SELECT public.sec_lock('payment_accounts',
  '((SELECT public.app_can(''bookings'', ''read'')) OR (SELECT public.app_can(''checkout'', ''read'')) OR (SELECT public.app_can(''settings'', ''read'')) OR (SELECT public.app_can(''reports'', ''read'')))',
  '(SELECT public.app_can(''settings'', ''write''))');
