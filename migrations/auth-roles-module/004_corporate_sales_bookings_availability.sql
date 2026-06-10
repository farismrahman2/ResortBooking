-- ============================================================================
-- Grant corporate_sales access to:
--   - bookings module (write) → can use /quotes (create + edit) and /bookings
--   - availability module (read) → can check room availability before quoting
--
-- Idempotent: ON CONFLICT keeps existing rows untouched if already present,
-- and the UPDATE fallback fixes the level if a previous 'none' row exists.
-- ============================================================================

-- 1) bookings → write (lets them create/edit quotes & view bookings)
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'corporate_sales' AND m.slug = 'bookings'
ON CONFLICT (role_id, module_id) DO UPDATE SET level = 'write';

-- 2) availability → read
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'read'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'corporate_sales' AND m.slug = 'availability'
ON CONFLICT (role_id, module_id) DO UPDATE SET level = 'read';

-- Verify
SELECT r.slug AS role, m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles r   ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE r.slug = 'corporate_sales'
 ORDER BY m.display_order;
