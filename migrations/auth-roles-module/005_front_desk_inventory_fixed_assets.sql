-- ============================================================================
-- Grant front_desk access to:
--   - inventory module (write)    → stock management: counts, movements
--   - fixed_assets module (write) → asset register: add/edit/dispose assets
--
-- Both modules previously seeded front_desk at 'none' (see
-- migrations/inventory-module/000_* and migrations/fixed-assets-module/000_*).
--
-- Idempotent: INSERT seeds the row if missing; ON CONFLICT … DO UPDATE bumps an
-- existing 'none' row up to 'write'. Safe to re-run.
-- ============================================================================

-- 1) inventory → write
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'front_desk' AND m.slug = 'inventory'
ON CONFLICT (role_id, module_id) DO UPDATE SET level = 'write';

-- 2) fixed_assets → write
INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
  FROM roles r CROSS JOIN modules m
 WHERE r.slug = 'front_desk' AND m.slug = 'fixed_assets'
ON CONFLICT (role_id, module_id) DO UPDATE SET level = 'write';

-- Verify
SELECT r.slug AS role, m.slug AS module, rp.level
  FROM role_permissions rp
  JOIN roles r   ON r.id = rp.role_id
  JOIN modules m ON m.id = rp.module_id
 WHERE r.slug = 'front_desk'
 ORDER BY m.display_order;
