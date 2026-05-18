-- Add Superior Deluxe as a new room type carved out of Deluxe.
--
-- Physical rooms #203 and #206 move from Deluxe to Superior Deluxe, so
-- deluxe.total_units drops 6 → 4 and superior_deluxe is created with
-- total_units = 2. Total occupancy denominator (sum of total_units) is
-- preserved, so reports/KPIs are unaffected.
--
-- Historical booking_rooms / quote_rooms rows where room_type = 'deluxe'
-- and room_numbers contains '203' or '206' are intentionally left alone:
-- the cross-room conflict check (getBookedRoomNumbers) works off
-- room_numbers regardless of room_type, so #203/#206 already booked as
-- Deluxe will correctly block a future Superior Deluxe booking on the
-- same dates. Drafts/sent quotes are likewise left as-is.
--
-- Pricing: each existing package gets a superior_deluxe row priced
-- identically to its deluxe row. Edit per-package in Settings if you
-- want a different rate.
--
-- NOTE: if room_type columns on booking_rooms/quote_rooms/package_room_prices/
-- room_inventory are backed by a Postgres ENUM or CHECK constraint, you may
-- need to ALTER TYPE ... ADD VALUE 'superior_deluxe' (ENUM) or DROP/RECREATE
-- the constraint before this migration will run.

BEGIN;

-- 1. Make room for the new row at display_order = deluxe.display_order + 1
UPDATE room_inventory
SET display_order = display_order + 1
WHERE display_order > (SELECT display_order FROM room_inventory WHERE room_type = 'deluxe');

-- 2. Insert the new inventory row immediately after Deluxe
INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'superior_deluxe', 'Superior Deluxe', 2, false, display_order + 1
FROM room_inventory
WHERE room_type = 'deluxe';

-- 3. Drop two units from Deluxe (rooms #203 and #206 moved out)
UPDATE room_inventory
SET total_units = total_units - 2
WHERE room_type = 'deluxe';

-- 4. Copy the Deluxe price into Superior Deluxe for every existing package
INSERT INTO package_room_prices (package_id, room_type, price)
SELECT package_id, 'superior_deluxe', price
FROM package_room_prices
WHERE room_type = 'deluxe';

COMMIT;
