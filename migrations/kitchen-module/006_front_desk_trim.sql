-- ============================================================================
-- 006 — take enquiries, meal menus and field visits off the front desk
--
-- Sets them to 'none' rather than deleting the rows: the permission grid reads
-- a level per role/module pair, and a missing row and an explicit 'none' both
-- deny — but only the explicit row shows the setting as a deliberate choice
-- when somebody opens Settings → Roles later.
--
-- Equivalent to setting all three to None on Settings → Roles → Front Desk.
-- Idempotent.
-- ============================================================================

UPDATE role_permissions rp
SET level = 'none'
FROM roles r, modules m
WHERE rp.role_id = r.id
  AND rp.module_id = m.id
  AND r.slug = 'front_desk'
  AND m.slug IN ('enquiries', 'menus', 'field_visits');

-- Verify — the front desk's whole permission set, so the change can be read in
-- context rather than in isolation.
SELECT m.slug AS module, rp.level
FROM role_permissions rp
JOIN roles r   ON r.id = rp.role_id
JOIN modules m ON m.id = rp.module_id
WHERE r.slug = 'front_desk'
ORDER BY rp.level DESC, m.slug;
