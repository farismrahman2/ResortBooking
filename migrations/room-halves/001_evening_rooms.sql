-- ─────────────────────────────────────────────────────────────────────────────
-- Room halves · 001 — rooms handed over in the evening
--
-- A night booking often gets some of its rooms on arrival and the rest at
-- 6 PM, after that day's day guests leave. Those rooms are sold twice on the
-- check-in date — once for the day, once for the night — and the system has
-- to know which rooms are which.
--
-- `evening_rooms` on every room row is the subset of `room_numbers` handed
-- over at the evening handover time on the check-in day. They occupy the
-- NIGHT half of that date only; instant rooms occupy both halves; daylong
-- bookings occupy the day half. See lib/engine/halves.ts for the full table.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quote_rooms       ADD COLUMN IF NOT EXISTS evening_rooms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE booking_rooms     ADD COLUMN IF NOT EXISTS evening_rooms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE quote_day_rooms   ADD COLUMN IF NOT EXISTS evening_rooms TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE booking_day_rooms ADD COLUMN IF NOT EXISTS evening_rooms TEXT[] NOT NULL DEFAULT '{}';

-- The handover time, shown on confirmations and the daily report.
INSERT INTO settings (key, value)
SELECT 'evening_handover_time', '18:00'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'evening_handover_time');

-- The calendar's source of truth now answers per half. A day's number of
-- occupied rooms differs from its night's whenever evening rooms are in play.
-- The return columns change, and Postgres will not REPLACE a function whose
-- result type differs — drop the old signature first.
DROP FUNCTION IF EXISTS public.get_availability_range(date, date);
CREATE OR REPLACE FUNCTION public.get_availability_range(p_from date, p_to date)
 RETURNS TABLE(check_date date, check_room_type room_type, qty_day bigint, qty_night bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS d
  ),
  -- Every room row with the dates it spans, from bookings, unconverted
  -- confirmed quotes, and group itinerary segments (one night or one day each).
  spans AS (
    SELECT br.room_type, br.qty, COALESCE(cardinality(br.evening_rooms), 0) AS evening_qty,
           b.package_type::text AS kind, b.visit_date, b.check_out_date
    FROM booking_rooms br
    JOIN bookings b ON b.id = br.booking_id
    WHERE b.status::text NOT IN ('cancelled', 'no_show')
    UNION ALL
    SELECT qr.room_type, qr.qty, COALESCE(cardinality(qr.evening_rooms), 0),
           q.package_type::text, q.visit_date, q.check_out_date
    FROM quote_rooms qr
    JOIN quotes q ON q.id = qr.quote_id
    WHERE q.status = 'confirmed' AND q.converted_to_booking_id IS NULL
    UNION ALL
    SELECT bdr.room_type, bdr.qty, COALESCE(cardinality(bdr.evening_rooms), 0),
           bd.stay_kind, bd.day_date,
           CASE WHEN bd.stay_kind = 'night' THEN bd.day_date + 1 ELSE NULL END
    FROM booking_day_rooms bdr
    JOIN booking_days bd ON bd.id = bdr.booking_day_id
    JOIN bookings b ON b.id = bd.booking_id
    WHERE b.status::text NOT IN ('cancelled', 'no_show')
    UNION ALL
    SELECT qdr.room_type, qdr.qty, COALESCE(cardinality(qdr.evening_rooms), 0),
           qd.stay_kind, qd.day_date,
           CASE WHEN qd.stay_kind = 'night' THEN qd.day_date + 1 ELSE NULL END
    FROM quote_day_rooms qdr
    JOIN quote_days qd ON qd.id = qdr.quote_day_id
    JOIN quotes q ON q.id = qd.quote_id
    WHERE q.status = 'confirmed' AND q.converted_to_booking_id IS NULL
  ),
  halves AS (
    SELECT
      d.d AS check_date,
      s.room_type,
      -- DAY: daylong on the day; night stays every day of the stay except
      -- checkout, minus the evening rooms on the check-in day.
      CASE
        WHEN s.kind = 'daylong' AND d.d = s.visit_date THEN s.qty
        WHEN s.kind = 'night' AND d.d = s.visit_date AND d.d < s.check_out_date THEN s.qty - s.evening_qty
        WHEN s.kind = 'night' AND d.d > s.visit_date AND d.d < s.check_out_date THEN s.qty
        ELSE 0
      END AS q_day,
      -- NIGHT: night stays every night of the stay.
      CASE
        WHEN s.kind = 'night' AND d.d >= s.visit_date AND d.d < s.check_out_date THEN s.qty
        ELSE 0
      END AS q_night
    FROM days d
    JOIN spans s
      ON s.visit_date <= d.d
     AND (s.check_out_date > d.d OR (s.check_out_date IS NULL AND s.visit_date = d.d))
  )
  SELECT check_date, room_type, SUM(q_day)::bigint, SUM(q_night)::bigint
  FROM halves
  GROUP BY check_date, room_type
  HAVING SUM(q_day) > 0 OR SUM(q_night) > 0
$function$;
