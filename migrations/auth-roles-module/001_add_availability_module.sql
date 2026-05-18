-- =====================================================================
-- Auth & Roles — 001: Add 'availability' module + retighten Front Desk scope
-- =====================================================================
-- Run after 000_create_roles_and_permissions.sql.
-- Idempotent.
--
-- Why: front_desk should only need Checkout + Availability. Previously they
-- had bookings:write which surfaced Quotes / Bookings / Packages in the
-- sidebar. Carve availability into its own permission slug, demote front_desk
-- on bookings, and seed availability:read for everyone except where it
-- explicitly should be 'none'.
-- =====================================================================

-- 1. Insert the new module
INSERT INTO modules (slug, display_name, description, display_order) VALUES
  ('availability', 'Availability', 'Room availability calendar', 7)
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed default availability permissions for each role
-- Admin: write
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r
  CROSS JOIN modules m
 WHERE r.slug = 'admin' AND m.slug = 'availability'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Manager / Accountant / Front Desk: read
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'read'
  FROM roles r
  CROSS JOIN modules m
 WHERE r.slug IN ('manager', 'accountant', 'front_desk')
   AND m.slug = 'availability'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- 3. Retighten Front Desk: bookings should now be 'none' (they no longer
--    need /bookings, /quotes, /packages — they use /checkout/[bookingId]).
--    Use UPDATE not INSERT since the row already exists from the 000 seed.
UPDATE role_permissions rp
   SET level = 'none', updated_at = NOW()
  FROM roles r, modules m
 WHERE rp.role_id = r.id
   AND rp.module_id = m.id
   AND r.slug = 'front_desk'
   AND m.slug = 'bookings'
   AND rp.level <> 'none';

-- Verify
SELECT m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE r.slug = 'front_desk'
 ORDER BY m.display_order;
