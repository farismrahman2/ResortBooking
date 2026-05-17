-- =====================================================================
-- Auth & Roles — 003: Add 'reservation' role
-- =====================================================================
-- Run after 002_add_attendance_module.sql (and the coffee_shop module
-- migration so all 9 modules exist).
-- Idempotent.
--
-- Why: a reservations desk should only see quotes, bookings, and the
-- availability calendar — nothing else. The existing roles don't fit:
--   - 'manager' has too much (expenses / HR / reports)
--   - 'front_desk' is scoped to checkout, not the quote→booking funnel
-- Carve a new role with write on bookings + availability and 'none'
-- on everything else.
-- =====================================================================

-- 1. Drop the existing slug CHECK constraint so we can add the new value.
--    The 000 migration created an inline CHECK; its name is auto-generated
--    (typically 'roles_slug_check') so we look it up by introspection to
--    stay robust against rename.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
    INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class    rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid  = rel.relnamespace
   WHERE rel.relname = 'roles'
     AND ns.nspname  = 'public'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%slug%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.roles DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_slug_check
  CHECK (slug IN ('admin','manager','front_desk','accountant','reservation'));

-- 2. Insert the new role
INSERT INTO roles (slug, display_name, description, display_order) VALUES
  ('reservation', 'Reservation', 'Quotes, bookings, and availability — no other modules', 5)
ON CONFLICT (slug) DO NOTHING;

-- 3. Seed permissions for the reservation role across all modules.
--    Write on bookings + availability, 'none' on everything else.
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id,
  CASE m.slug
    WHEN 'bookings'     THEN 'write'
    WHEN 'availability' THEN 'write'
    ELSE 'none'
  END
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'reservation'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- Verify
SELECT m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles   r ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE r.slug = 'reservation'
 ORDER BY m.display_order;
