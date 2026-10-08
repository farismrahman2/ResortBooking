-- ─────────────────────────────────────────────────────────────────────────────
-- Performance · 002 — Phase 2: lighter report functions
--
-- Same results, less work. Verified against the previous versions on live
-- data before applying (identical output).
--
--   get_booking_stats()        checkout payments summed once per checkout and
--                              hash-joined, instead of a sub-query per booking;
--                              status compared as the enum (index-friendly).
--   reports_daily_occupancy()  only bookings that can touch [p_from, p_to] are
--                              read, and each is joined to its own date range —
--                              the OR join over every booking ever made forced
--                              a nested loop per day. Conference room still
--                              excluded (Conference · 001).
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_booking_stats()
 RETURNS TABLE(total_bookings bigint, total_revenue numeric, pending_advance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH paid AS (
    SELECT cp.checkout_id, SUM(cp.amount) AS paid
    FROM checkout_payments cp
    GROUP BY cp.checkout_id
  )
  SELECT
    COUNT(*) AS total_bookings,
    COALESCE(SUM(CASE WHEN b.status = 'no_show' THEN COALESCE(b.advance_paid, 0) ELSE b.total END), 0) AS total_revenue,
    COALESCE(SUM(
      CASE WHEN b.status = 'no_show' THEN 0 ELSE GREATEST(0,
        b.total
        - CASE WHEN c.status = 'finalized' THEN COALESCE(c.discount_amount, 0) ELSE 0 END
        - COALESCE(b.advance_paid, 0)
        - CASE WHEN c.status = 'finalized' THEN COALESCE(p.paid, 0) ELSE 0 END
      ) END
    ), 0) AS pending_advance
  FROM bookings b
  LEFT JOIN checkouts c ON c.booking_id = b.id
  LEFT JOIN paid p ON p.checkout_id = c.id
  WHERE b.status <> 'cancelled';
$function$;

CREATE OR REPLACE FUNCTION public.reports_daily_occupancy(p_from date, p_to date)
 RETURNS TABLE(date date, rooms_occupied integer, total_rooms integer, occupancy_pct numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS date),
  total_setting AS (SELECT NULLIF(value, '')::int AS n FROM settings WHERE key = 'total_rooms'),
  total_inv AS (SELECT COALESCE(SUM(total_units), 0)::int AS n FROM room_inventory WHERE room_type::text <> 'conference_room'),
  total AS (SELECT COALESCE((SELECT n FROM total_setting), (SELECT n FROM total_inv))::int AS total_rooms),
  -- Each stay as [start, end) with its bedroom count, only if it can touch the window.
  stays AS (
    SELECT b.visit_date AS s, b.visit_date + 1 AS e, br.qty
    FROM bookings b JOIN booking_rooms br ON br.booking_id = b.id
    WHERE b.status IN ('confirmed', 'checked_out') AND b.package_type = 'daylong'
      AND b.visit_date BETWEEN p_from AND p_to
      AND br.room_type <> 'conference_room'
    UNION ALL
    SELECT b.visit_date, b.check_out_date, br.qty
    FROM bookings b JOIN booking_rooms br ON br.booking_id = b.id
    WHERE b.status IN ('confirmed', 'checked_out') AND b.package_type = 'night'
      AND b.visit_date <= p_to AND b.check_out_date > p_from
      AND br.room_type <> 'conference_room'
    UNION ALL
    -- Group itineraries: rooms count on their own date, night and day alike.
    SELECT bd.day_date, bd.day_date + 1, bdr.qty
    FROM booking_days bd
    JOIN bookings b ON b.id = bd.booking_id AND b.status IN ('confirmed', 'checked_out')
    JOIN booking_day_rooms bdr ON bdr.booking_day_id = bd.id
    WHERE bd.day_date BETWEEN p_from AND p_to
      AND bdr.room_type <> 'conference_room'
  ),
  occ AS (
    SELECT d.date, COALESCE(SUM(st.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN stays st ON d.date >= st.s AND d.date < st.e
    GROUP BY d.date
  )
  SELECT o.date, o.rooms_occupied, t.total_rooms,
    CASE WHEN t.total_rooms = 0 THEN 0 ELSE ROUND((o.rooms_occupied::numeric / t.total_rooms) * 100, 2) END
  FROM occ o, total t
  ORDER BY o.date;
$function$;
