-- =====================================================================
-- Auth & Roles — 006: 'inventory' role
-- =====================================================================
-- Store, kitchen and coffee shop staff: inventory, kitchen and coffee shop
-- (write) and nothing else — no bookings, checkout, accounts, HR or reports.
-- Idempotent.
-- =====================================================================

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_slug_check;
ALTER TABLE public.roles ADD CONSTRAINT roles_slug_check CHECK (slug IN (
  'admin','manager','front_desk','accountant','reservation','corporate_sales',
  'operations_manager','md','review_collector','inventory'));

INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('inventory', 'Inventory', 'Store, kitchen and coffee shop — no bookings, accounts or revenue', 10)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE WHEN m.slug IN ('inventory', 'kitchen', 'coffee_shop') THEN 'write' ELSE 'none' END
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'inventory'
ON CONFLICT (role_id, module_id) DO NOTHING;
