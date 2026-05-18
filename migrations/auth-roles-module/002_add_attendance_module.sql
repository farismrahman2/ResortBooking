-- =====================================================================
-- Auth & Roles — 002: Carve out the 'attendance' sub-permission
-- =====================================================================
-- Run after 001_add_availability_module.sql.
-- Idempotent.
--
-- Why: front_desk now owns daily attendance marking. Granting them the
-- whole 'hr' module would expose employees / leaves / loans / payroll /
-- service charge / sales — none of which they should see. Carve
-- attendance into its own permission slug (mirrors the availability
-- carve-out from bookings in migration 001) so it can be granted
-- independently.
-- =====================================================================

-- 1. Insert the new module
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('attendance', 'Attendance', 'Daily staff attendance', 8)
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed default attendance permissions per role
-- Admin / Manager / Front Desk: write (front desk is in charge of marking)
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r
  CROSS JOIN modules m
 WHERE r.slug IN ('admin', 'manager', 'front_desk')
   AND m.slug = 'attendance'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Accountant: read (consumes payroll output, doesn't mark)
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'read'
  FROM roles r
  CROSS JOIN modules m
 WHERE r.slug = 'accountant'
   AND m.slug = 'attendance'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Verify
SELECT m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE r.slug = 'front_desk'
 ORDER BY m.display_order;
