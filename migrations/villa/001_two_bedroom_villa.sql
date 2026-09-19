-- ─────────────────────────────────────────────────────────────────────────────
-- Villa · 001 — the two-bedroom villa (Deluxe 301 + 302 sold as one unit)
--
-- The resort sells 301 and 302 either as two Deluxe rooms or together as a
-- "Two-bedroom Villa". The villa is a room type of its own — it has its own
-- price on every package and its own line on the confirmation — but it owns
-- no rooms: which physical rooms it takes is fixed in code
-- (lib/config/rooms.ts, COMPOSITE_ROOMS), and the availability engine expands
-- it into 301 + 302 for every check, so the two ways of selling the same
-- rooms cannot collide.
--
-- TWO PASSES. Postgres will not use a new enum value inside the transaction
-- that added it, so run PASS 1 on its own, then PASS 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASS 1 ───────────────────────────────────────────────────────────────────
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'villa_2br';

-- ── PASS 2 (run after PASS 1 has committed) ──────────────────────────────────

-- One sellable unit. Its total_units does NOT add to the property's room
-- count — the engine and the reports know it stands on two Deluxe rooms.
INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'villa_2br', 'Two-bedroom Villa', 1, false, 9
WHERE NOT EXISTS (SELECT 1 FROM room_inventory WHERE room_type = 'villa_2br');

-- A starting price on every package: twice that package's Deluxe rate, so a
-- villa is never accidentally sold at 0. Adjust in Settings → Packages.
INSERT INTO package_room_prices (package_id, room_type, price)
SELECT p.package_id, 'villa_2br', p.price * 2
FROM package_room_prices p
WHERE p.room_type = 'deluxe'
  AND NOT EXISTS (
    SELECT 1 FROM package_room_prices v
    WHERE v.package_id = p.package_id AND v.room_type = 'villa_2br'
  );
