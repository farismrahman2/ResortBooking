-- ─────────────────────────────────────────────────────────────────────────────
-- Canopy · 002 — floors 2 to 5
--
--   x11       Super Premium Canopy   (new type: 211, 311, 411, 511)
--   x12–x14   Premium Deluxe Canopy  (4 → 16 rooms)
--   x15       Deluxe Canopy          (1 → 5 rooms)
--
-- Floor 2 (211–215) goes on sale now. Floors 3–5 (311–515) are added but
-- held by a room block "not yet open", until further notice — release it in
-- Settings → Room blocks when they open. Room numbers live in
-- lib/config/rooms.ts.
--
-- Super Premium Canopy is seeded at the Super Premium price on every package
-- (as the first Canopy rooms were seeded from their non-Canopy twins).
-- Adjust in Settings → Packages. The property's room count becomes 42.
--
-- TWO PASSES. Postgres will not use a new enum value inside the transaction
-- that added it, so run PASS 1 on its own, then PASS 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASS 1 ───────────────────────────────────────────────────────────────────
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'super_premium_canopy';

-- ── PASS 2 (run after PASS 1 has committed) ──────────────────────────────────
INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'super_premium_canopy', 'Super Premium Canopy', 4, false, 10
WHERE NOT EXISTS (SELECT 1 FROM room_inventory WHERE room_type = 'super_premium_canopy');

UPDATE room_inventory SET total_units = 16, display_order = 11 WHERE room_type = 'premium_deluxe_canopy';
UPDATE room_inventory SET total_units = 5,  display_order = 12 WHERE room_type = 'deluxe_canopy';
UPDATE room_inventory SET display_order = 13 WHERE room_type = 'conference_room';

INSERT INTO package_room_prices (package_id, room_type, price)
SELECT p.package_id, 'super_premium_canopy', p.price
FROM package_room_prices p
WHERE p.room_type = 'super_premium'
  AND NOT EXISTS (SELECT 1 FROM package_room_prices v
                  WHERE v.package_id = p.package_id AND v.room_type = 'super_premium_canopy');

-- Occupancy KPI: physical bedrooms 22 → 42 (blocked rooms are subtracted per day).
UPDATE settings SET value = '42' WHERE key = 'total_rooms' AND value = '22';

-- Floors 3–5 are not open yet.
INSERT INTO room_blocks (room_numbers, start_date, end_date, reason_kind, reason)
SELECT ARRAY['311','312','313','314','315','411','412','413','414','415','511','512','513','514','515'],
       DATE '2026-10-10', NULL, 'not_open', 'Canopy floors 3–5'
WHERE NOT EXISTS (SELECT 1 FROM room_blocks WHERE reason_kind = 'not_open' AND reason = 'Canopy floors 3–5');
