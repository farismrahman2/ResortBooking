-- ============================================================================
-- Kitchen module · 005 — front desk gets the kitchen
--
-- The original seed gave front_desk 'none', on the assumption that ordering
-- was a store-and-manager job. In practice front desk is the desk that knows
-- the day's arrivals, and the requisition is written against pax — so they are
-- the people best placed to raise it.
--
-- 'write', not 'read': read-only would let them look at orders they cannot
-- create, which is not access in any useful sense.
--
-- NOTE — this grant is not narrow. The module's permission is one level for
-- the whole module, so kitchen:write also opens Payments and the Supplier
-- Ledger: front desk will be able to record a cheque and see what each
-- supplier is owed. If that is not wanted, say so and the money screens can
-- take a second permission the way the HR and checkout reports already do.
--
-- Equivalent to setting Kitchen → Write on Settings → Roles → Front Desk.
-- Idempotent: safe to run more than once.
-- ============================================================================

INSERT INTO role_permissions (role_id, module_id, level)
SELECT r.id, m.id, 'write'
FROM roles r CROSS JOIN modules m
WHERE r.slug = 'front_desk' AND m.slug = 'kitchen'
ON CONFLICT (role_id, module_id) DO UPDATE SET level = 'write';

-- Verify
SELECT r.slug AS role, m.slug AS module, rp.level
FROM role_permissions rp
JOIN roles r   ON r.id = rp.role_id
JOIN modules m ON m.id = rp.module_id
WHERE m.slug = 'kitchen'
ORDER BY r.slug;
