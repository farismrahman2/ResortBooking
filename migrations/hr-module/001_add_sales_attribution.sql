-- =====================================================================
-- HR — 001: Sales rep attribution + team grouping
-- =====================================================================
-- Adds:
--   * employees.is_sales / sales_team — flags + free-form team grouping
--   * quotes.sales_employee_id  — FK to employees(id), set at quote creation
--   * bookings.sales_employee_id — FK to employees(id), copied on conversion
--
-- Idempotent. Existing rows keep NULL attribution.
-- =====================================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_sales   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sales_team TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_is_sales
  ON employees(is_sales) WHERE is_sales = true;

ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS sales_employee_id UUID REFERENCES employees(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sales_employee_id UUID REFERENCES employees(id);

CREATE INDEX IF NOT EXISTS idx_quotes_sales_employee
  ON quotes(sales_employee_id) WHERE sales_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_sales_employee
  ON bookings(sales_employee_id) WHERE sales_employee_id IS NOT NULL;
