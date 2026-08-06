-- =====================================================================
-- Fix: no-show bookings must NOT occupy a room
-- =====================================================================
-- reports_daily_occupancy() joined on `b.status <> 'cancelled'`, so a
-- no-show still consumed a room for occupancy purposes. That contradicts
-- migrations/checkout-module/003_no_show.sql, which states a no-show
-- releases the room for resale ("Availability treats it like cancelled"),
-- and it contradicted the JS fallback in lib/queries/reports/operations.ts,
-- which correctly excluded no_show.
--
-- The practical symptom: occupancy_pct, and the RevPAR derived from it,
-- changed value depending on whether this RPC existed — installs with the
-- migration applied reported higher occupancy than those without.
--
-- Now restricted to the statuses that genuinely hold a room. draft/sent are
-- also excluded: an unaccepted quote does not occupy anything.
-- Idempotent — CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION reports_daily_occupancy(p_from DATE, p_to DATE)
RETURNS TABLE (
  date           DATE,
  rooms_occupied INT,
  total_rooms    INT,
  occupancy_pct  NUMERIC
) AS $$
  WITH days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS date
  ),
  total_setting AS (
    SELECT NULLIF(value, '')::int AS n
      FROM settings
     WHERE key = 'total_rooms'
  ),
  total_inv AS (
    SELECT COALESCE(SUM(total_units), 0)::int AS n FROM room_inventory
  ),
  total AS (
    SELECT COALESCE((SELECT n FROM total_setting), (SELECT n FROM total_inv))::int AS total_rooms
  ),
  occupied AS (
    SELECT
      d.date,
      COALESCE(SUM(br.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN bookings b
      -- Only statuses that actually hold a room. A no-show frees it.
      ON b.status IN ('confirmed', 'checked_out')
     AND (
       (b.package_type = 'daylong' AND d.date  =  b.visit_date)
       OR
       (b.package_type = 'night'   AND d.date >=  b.visit_date AND d.date < b.check_out_date)
     )
    LEFT JOIN booking_rooms br ON br.booking_id = b.id
    GROUP BY d.date
  )
  SELECT
    o.date,
    o.rooms_occupied,
    t.total_rooms,
    CASE
      WHEN t.total_rooms = 0 THEN 0
      ELSE ROUND((o.rooms_occupied::numeric / t.total_rooms) * 100, 2)
    END AS occupancy_pct
  FROM occupied o, total t
  ORDER BY o.date;
$$ LANGUAGE sql STABLE;

SELECT 'reports_daily_occupancy' AS fn, 'no_show excluded' AS status;
