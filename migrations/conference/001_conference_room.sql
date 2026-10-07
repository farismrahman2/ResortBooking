-- ─────────────────────────────────────────────────────────────────────────────
-- Conference · 001 — the conference room, sold like a room
--
-- One new room type, 'conference_room' (one unit). It is booked with a
-- package from the room picker, but it is not a bedroom:
--   • held for the WHOLE of the arrival date (no day/night halves, no evening
--     handover) — a night stay has it on its check-in day only;
--   • priced per day at whatever the agent types in — no package price;
--   • includes no guests and is not counted in occupancy (total_rooms stays 22).
-- Its "room number" on the allocation sheet is "Conference" (lib/config/rooms.ts).
--
-- TWO PASSES. Postgres will not use a new enum value inside the transaction
-- that added it, so run PASS 1 on its own, then PASS 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PASS 1 ───────────────────────────────────────────────────────────────────
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'conference_room';

-- ── PASS 2 (run after PASS 1 has committed) ──────────────────────────────────
INSERT INTO room_inventory (room_type, display_name, total_units, daylong_only, display_order)
SELECT 'conference_room', 'Conference Room', 1, false, 12
WHERE NOT EXISTS (SELECT 1 FROM room_inventory WHERE room_type = 'conference_room');

-- Occupancy counts bedrooms only: the conference room is left out of both
-- the occupied count and the inventory fallback total.
CREATE OR REPLACE FUNCTION public.reports_daily_occupancy(p_from date, p_to date)
 RETURNS TABLE(date date, rooms_occupied integer, total_rooms integer, occupancy_pct numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS date),
  total_setting AS (SELECT NULLIF(value, '')::int AS n FROM settings WHERE key = 'total_rooms'),
  total_inv AS (SELECT COALESCE(SUM(total_units), 0)::int AS n FROM room_inventory WHERE room_type::text <> 'conference_room'),
  total AS (SELECT COALESCE((SELECT n FROM total_setting), (SELECT n FROM total_inv))::int AS total_rooms),
  ranged AS (
    SELECT d.date, COALESCE(SUM(br.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN bookings b ON b.status::text IN ('confirmed','checked_out')
     AND ((b.package_type = 'daylong' AND d.date = b.visit_date) OR (b.package_type = 'night' AND d.date >= b.visit_date AND d.date < b.check_out_date))
    LEFT JOIN booking_rooms br ON br.booking_id = b.id AND br.room_type::text <> 'conference_room'
    GROUP BY d.date
  ),
  itinerary AS (
    SELECT d.date, COALESCE(SUM(bdr.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN booking_days bd ON bd.day_date = d.date
    LEFT JOIN bookings b ON b.id = bd.booking_id AND b.status::text IN ('confirmed','checked_out')
    LEFT JOIN booking_day_rooms bdr ON bdr.booking_day_id = bd.id AND b.id IS NOT NULL AND bdr.room_type::text <> 'conference_room'
    GROUP BY d.date
  )
  SELECT r.date, (r.rooms_occupied + i.rooms_occupied)::int, t.total_rooms,
    CASE WHEN t.total_rooms = 0 THEN 0 ELSE ROUND(((r.rooms_occupied + i.rooms_occupied)::numeric / t.total_rooms) * 100, 2) END
  FROM ranged r JOIN itinerary i ON i.date = r.date, total t
  ORDER BY r.date;
$function$;
