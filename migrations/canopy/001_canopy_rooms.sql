-- ─────────────────────────────────────────────────────────────────────────────
-- Canopy · 001 — five new rooms
--
--   111, 112, 113, 114   Premium Deluxe Canopy
--   115                  Deluxe Canopy
--
-- Two new room types, each with its own price on every package. Seeded at the
-- price the package already charges for the matching non-canopy type:
-- Premium Deluxe Canopy = Premium Deluxe, Deluxe Canopy = Deluxe.
-- Adjust in Settings → Packages. Room numbers live in lib/config/rooms.ts.
--
-- TWO PASSES. Postgres will not use a new enum value inside the transaction
-- that added it, so run PASS 1 on its own, then PASS 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASS 1 ───────────────────────────────────────────────────────────────────
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'premium_deluxe_canopy';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'deluxe_canopy';

-- ── PASS 2 (run after PASS 1 has committed) ──────────────────────────────────
INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'premium_deluxe_canopy', 'Premium Deluxe Canopy', 4, false, 10
WHERE NOT EXISTS (SELECT 1 FROM room_inventory WHERE room_type = 'premium_deluxe_canopy');

INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'deluxe_canopy', 'Deluxe Canopy', 1, false, 11
WHERE NOT EXISTS (SELECT 1 FROM room_inventory WHERE room_type = 'deluxe_canopy');

INSERT INTO package_room_prices (package_id, room_type, price)
SELECT p.package_id, 'premium_deluxe_canopy', p.price
FROM package_room_prices p
WHERE p.room_type = 'premium_deluxe'
  AND NOT EXISTS (SELECT 1 FROM package_room_prices v
                  WHERE v.package_id = p.package_id AND v.room_type = 'premium_deluxe_canopy');

INSERT INTO package_room_prices (package_id, room_type, price)
SELECT p.package_id, 'deluxe_canopy', p.price
FROM package_room_prices p
WHERE p.room_type = 'deluxe'
  AND NOT EXISTS (SELECT 1 FROM package_room_prices v
                  WHERE v.package_id = p.package_id AND v.room_type = 'deluxe_canopy');

-- The property's room count, used for the occupancy KPI: 17 → 22.
UPDATE settings SET value = '22' WHERE key = 'total_rooms' AND value = '17';
