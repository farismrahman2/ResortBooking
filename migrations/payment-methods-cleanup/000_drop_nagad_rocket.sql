-- =====================================================================
-- Payment methods cleanup — drop Nagad and Rocket
-- =====================================================================
-- Garden Centre Resort does not accept Nagad or Rocket as payment methods.
-- Coalesce any existing rows that used those values to 'other', then
-- narrow the CHECK constraints. Idempotent — safe to re-run.
-- =====================================================================

-- 1. Coalesce existing rows
UPDATE coffee_shop_sale_payments      SET method = 'other'         WHERE method IN ('nagad','rocket');
UPDATE checkout_payments              SET method = 'other'         WHERE method IN ('nagad','rocket');
UPDATE expenses                       SET payment_method = 'other' WHERE payment_method IN ('nagad','rocket');
UPDATE recurring_expense_templates    SET default_payment_method = 'other' WHERE default_payment_method IN ('nagad','rocket');
UPDATE payroll_run_lines              SET payment_method = 'other' WHERE payment_method IN ('nagad','rocket');

-- 2. Narrow the CHECK constraints (use introspection — names are auto-generated)
DO $$ DECLARE c text; BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'coffee_shop_sale_payments' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%method%nagad%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE coffee_shop_sale_payments DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE coffee_shop_sale_payments
  ADD CONSTRAINT coffee_shop_sale_payments_method_check
  CHECK (method IN ('cash','bkash','card','bank_transfer','other'));

DO $$ DECLARE c text; BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'checkout_payments' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%method%nagad%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE checkout_payments DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE checkout_payments
  ADD CONSTRAINT checkout_payments_method_check
  CHECK (method IN ('cash','bkash','card','bank_transfer','other'));

DO $$ DECLARE c text; BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'expenses' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%nagad%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE expenses DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('cash','bkash','bank_transfer','cheque','other'));

DO $$ DECLARE c text; BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'recurring_expense_templates' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%default_payment_method%nagad%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE recurring_expense_templates DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE recurring_expense_templates
  ADD CONSTRAINT recurring_expense_templates_default_payment_method_check
  CHECK (default_payment_method IN ('cash','bkash','bank_transfer','cheque','other'));

DO $$ DECLARE c text; BEGIN
  SELECT con.conname INTO c FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'payroll_run_lines' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%nagad%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE payroll_run_lines DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE payroll_run_lines
  ADD CONSTRAINT payroll_run_lines_payment_method_check
  CHECK (payment_method IN ('cash','bkash','bank_transfer','cheque','other'));

-- Verify: counts of any remaining nagad/rocket rows (should all be 0)
SELECT 'coffee_shop_sale_payments' AS tbl, COUNT(*) FILTER (WHERE method IN ('nagad','rocket')) AS leftover FROM coffee_shop_sale_payments
UNION ALL SELECT 'checkout_payments',              COUNT(*) FILTER (WHERE method IN ('nagad','rocket')) FROM checkout_payments
UNION ALL SELECT 'expenses',                       COUNT(*) FILTER (WHERE payment_method IN ('nagad','rocket')) FROM expenses
UNION ALL SELECT 'recurring_expense_templates',    COUNT(*) FILTER (WHERE default_payment_method IN ('nagad','rocket')) FROM recurring_expense_templates
UNION ALL SELECT 'payroll_run_lines',              COUNT(*) FILTER (WHERE payment_method IN ('nagad','rocket')) FROM payroll_run_lines;
