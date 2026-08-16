-- ─────────────────────────────────────────────────────────────────────────────
-- Kitchen module · 009 — vendor payments post to the Expenses book
--
-- Until now, paying a kitchen supplier (the fish cheque, the vegetable dues)
-- recorded the payment in the kitchen ledger but wrote NOTHING to Expenses —
-- the cash book understated food cost by every taka paid to vendors.
--
-- From this migration on, recording a payment auto-creates a matching expense
-- (source_module = 'kitchen'), editing the payment keeps it in sync, and
-- cancelling the payment (bounced cheque) removes it. The expense cannot be
-- edited or deleted directly — the payment owns it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow 'kitchen' as an expense source. The list must keep EVERY value
--    other modules already write — 'fixed_assets' was widened in by the
--    fixed-assets module after inventory first created this constraint, and
--    omitting it made the re-add fail with 23514 on any database that had a
--    fixed-asset expense.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_source_module_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_source_module_check
  CHECK (source_module IN ('manual', 'payroll', 'checkout_refund', 'inventory', 'fixed_assets', 'kitchen'));

-- 2. The category these expenses land in (code also creates it if missing).
INSERT INTO expense_categories (name, slug, category_group, requires_description, requires_payee, display_order)
VALUES ('Kitchen Suppliers', 'kitchen_suppliers', 'bazar', false, false, 25)
ON CONFLICT (slug) DO NOTHING;

-- 3. Backfill: post an expense for every payment recorded BEFORE this landed
--    (skipping cancelled payments, zero-money adjustments, and any payment
--    that somehow already has one). Safe to re-run.
INSERT INTO expenses (
  expense_date, category_id, payee_id, description, amount,
  payment_method, reference_number, is_draft, source_module, source_id
)
SELECT
  p.payment_date,
  (SELECT id FROM expense_categories WHERE slug = 'kitchen_suppliers'),
  s.expense_payee_id,
  'Kitchen supplier payment ' || p.payment_no || ' — ' || v.display_name
    || CASE WHEN p.cheque_no IS NOT NULL AND p.cheque_no <> ''
            THEN ' (cheque ' || p.cheque_no || ')' ELSE '' END,
  p.amount,
  p.method,
  NULLIF(p.cheque_no, ''),
  false,
  'kitchen',
  p.id
FROM kitchen_vendor_payments p
JOIN kitchen_vendors v ON v.id = p.kitchen_vendor_id
LEFT JOIN LATERAL (
  SELECT expense_payee_id FROM inv_suppliers
  WHERE kitchen_vendor_id = p.kitchen_vendor_id AND is_active
  LIMIT 1
) s ON true
WHERE p.status <> 'cancelled'
  AND p.method <> 'adjustment'
  AND NOT EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.source_module = 'kitchen' AND e.source_id = p.id
  );
