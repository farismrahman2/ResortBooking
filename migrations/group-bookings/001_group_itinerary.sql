-- ─────────────────────────────────────────────────────────────────────────────
-- Group bookings · 001 — one booking, one bill, a different shape every day
--
-- A conference group arrives on the 4th with 30 people in 7 rooms, keeps two
-- of them in Room 101 for three nights, and has 32 day guests on the 5th using
-- three rooms for free. Until now that was three bookings and three bills.
--
-- A booking (and the quote before it) may now be package_type 'group', in
-- which case its rooms and guests live in a per-day ITINERARY instead of the
-- single date range + single room set the other two types use:
--
--   booking_days       one row per (date, stay_kind). 'night' = rooms are
--                      slept in that night; 'daylong' = day-use guests who
--                      leave in the evening. A date may have both.
--   booking_day_rooms  the rooms for that segment, with unit_price 0 meaning
--                      complimentary, exactly as booking_rooms does.
--
-- A group booking has NO booking_rooms rows — its rooms are only ever in the
-- itinerary — so the existing room-blocking logic contributes nothing for it
-- and the day rooms are the single source of truth. Every availability path
-- (the two SQL functions below, and lib/queries/availability.ts) reads both.
--
-- Money is unchanged: subtotal / discount / total / advance columns and
-- line_items on the booking, so checkout, dues, reports and the invoice work
-- as they do for any other booking.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PASS 1 — run this statement ON ITS OWN first.
--
-- A new enum value cannot be referenced by anything else in the same
-- transaction that adds it, and the SQL editor runs a pasted block as one
-- transaction. Run this line, wait for it to succeed, then run PASS 2.
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TYPE package_type ADD VALUE IF NOT EXISTS 'group';


-- ═════════════════════════════════════════════════════════════════════════════
-- PASS 2 — everything else. Safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Itinerary tables ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_days (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  day_date       DATE NOT NULL,
  stay_kind      TEXT NOT NULL CHECK (stay_kind IN ('night', 'daylong')),
  adults         INT  NOT NULL DEFAULT 0 CHECK (adults >= 0),
  /** Present but not charged per head — e.g. 28 guests who already paid the
      previous night's package and stay on for the day. Counted in every
      headcount, skipped by the per-person rate. */
  adults_comp    INT  NOT NULL DEFAULT 0 CHECK (adults_comp >= 0),
  children_paid  INT  NOT NULL DEFAULT 0 CHECK (children_paid >= 0),
  children_free  INT  NOT NULL DEFAULT 0 CHECK (children_free >= 0),
  drivers        INT  NOT NULL DEFAULT 0 CHECK (drivers >= 0),
  extra_beds     INT  NOT NULL DEFAULT 0 CHECK (extra_beds >= 0),
  notes          TEXT,
  sort_order     INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, day_date, stay_kind)
);

CREATE TABLE IF NOT EXISTS quote_day_rooms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_day_id   UUID NOT NULL REFERENCES quote_days(id) ON DELETE CASCADE,
  room_type      room_type NOT NULL,
  qty            INT NOT NULL CHECK (qty >= 1),
  unit_price     INT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  room_numbers   TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS booking_days (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  day_date       DATE NOT NULL,
  stay_kind      TEXT NOT NULL CHECK (stay_kind IN ('night', 'daylong')),
  adults         INT  NOT NULL DEFAULT 0 CHECK (adults >= 0),
  adults_comp    INT  NOT NULL DEFAULT 0 CHECK (adults_comp >= 0),
  children_paid  INT  NOT NULL DEFAULT 0 CHECK (children_paid >= 0),
  children_free  INT  NOT NULL DEFAULT 0 CHECK (children_free >= 0),
  drivers        INT  NOT NULL DEFAULT 0 CHECK (drivers >= 0),
  extra_beds     INT  NOT NULL DEFAULT 0 CHECK (extra_beds >= 0),
  notes          TEXT,
  sort_order     INT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, day_date, stay_kind)
);

CREATE TABLE IF NOT EXISTS booking_day_rooms (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_day_id UUID NOT NULL REFERENCES booking_days(id) ON DELETE CASCADE,
  room_type      room_type NOT NULL,
  qty            INT NOT NULL CHECK (qty >= 1),
  unit_price     INT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  room_numbers   TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_quote_days_quote      ON quote_days(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_days_date       ON quote_days(day_date);
CREATE INDEX IF NOT EXISTS idx_quote_day_rooms_day   ON quote_day_rooms(quote_day_id);
CREATE INDEX IF NOT EXISTS idx_booking_days_booking  ON booking_days(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_days_date     ON booking_days(day_date);
CREATE INDEX IF NOT EXISTS idx_booking_day_rooms_day ON booking_day_rooms(booking_day_id);

-- 2. A group prices night segments from one package and day segments from
--    another, so it freezes two snapshots. package_snapshot keeps the night
--    package (or the only one, for a day-only group); this holds the other.
ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS day_package_snapshot JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS day_package_snapshot JSONB;

-- 3. RLS — same posture as quote_rooms / booking_rooms: any signed-in user.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_days','quote_day_rooms','booking_days','booking_day_rooms'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'p_' || t || '_auth'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'p_' || t || '_auth', t);
    END IF;
  END LOOP;
END $$;

-- 4. Availability range — the calendar's source of truth ─────────────────────
--    Two more branches: itinerary rooms on their exact date, from bookings and
--    from confirmed-but-unconverted quotes. No-show is excluded here because
--    this function's callers do not post-filter it the way the single-date
--    path does, and a no-show frees the room.
CREATE OR REPLACE FUNCTION public.get_availability_range(p_from date, p_to date)
 RETURNS TABLE(check_date date, check_room_type room_type, qty_booked bigint)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    d::date                  AS check_date,
    br.room_type             AS check_room_type,
    SUM(br.qty)::bigint      AS qty_booked
  FROM generate_series(p_from, p_to, interval '1 day') AS d
  JOIN booking_rooms br ON true
  JOIN bookings b ON b.id = br.booking_id
  WHERE b.status != 'cancelled'
    AND b.visit_date <= d::date
    AND (
      (b.check_out_date IS NOT NULL AND b.check_out_date > d::date)
      OR
      (b.check_out_date IS NULL AND b.visit_date = d::date)
    )
  GROUP BY d, br.room_type

  UNION ALL

  SELECT
    d::date                  AS check_date,
    qr.room_type             AS check_room_type,
    SUM(qr.qty)::bigint      AS qty_booked
  FROM generate_series(p_from, p_to, interval '1 day') AS d
  JOIN quote_rooms qr ON true
  JOIN quotes q ON q.id = qr.quote_id
  WHERE q.status = 'confirmed'
    AND q.converted_to_booking_id IS NULL
    AND q.visit_date <= d::date
    AND (
      (q.check_out_date IS NOT NULL AND q.check_out_date > d::date)
      OR
      (q.check_out_date IS NULL AND q.visit_date = d::date)
    )
  GROUP BY d, qr.room_type

  UNION ALL

  -- Group booking itineraries: a segment blocks its rooms on its own date.
  SELECT
    bd.day_date              AS check_date,
    bdr.room_type            AS check_room_type,
    SUM(bdr.qty)::bigint     AS qty_booked
  FROM booking_days bd
  JOIN booking_day_rooms bdr ON bdr.booking_day_id = bd.id
  JOIN bookings b ON b.id = bd.booking_id
  WHERE b.status::text NOT IN ('cancelled', 'no_show')
    AND bd.day_date BETWEEN p_from AND p_to
  GROUP BY bd.day_date, bdr.room_type

  UNION ALL

  SELECT
    qd.day_date              AS check_date,
    qdr.room_type            AS check_room_type,
    SUM(qdr.qty)::bigint     AS qty_booked
  FROM quote_days qd
  JOIN quote_day_rooms qdr ON qdr.quote_day_id = qd.id
  JOIN quotes q ON q.id = qd.quote_id
  WHERE q.status = 'confirmed'
    AND q.converted_to_booking_id IS NULL
    AND qd.day_date BETWEEN p_from AND p_to
  GROUP BY qd.day_date, qdr.room_type
$function$;

-- 5. Daily occupancy for the reports ──────────────────────────────────────────
--    Itinerary rooms count on their date, night and day alike — the existing
--    rule already counts a daylong booking's rooms as occupied for its day.
CREATE OR REPLACE FUNCTION public.reports_daily_occupancy(p_from date, p_to date)
 RETURNS TABLE(date date, rooms_occupied integer, total_rooms integer, occupancy_pct numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS date
  ),
  total_setting AS (
    SELECT NULLIF(value, '')::int AS n FROM settings WHERE key = 'total_rooms'
  ),
  total_inv AS (
    SELECT COALESCE(SUM(total_units), 0)::int AS n FROM room_inventory
  ),
  total AS (
    SELECT COALESCE((SELECT n FROM total_setting), (SELECT n FROM total_inv))::int AS total_rooms
  ),
  ranged AS (
    SELECT
      d.date,
      COALESCE(SUM(br.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN bookings b
      ON b.status::text IN ('confirmed', 'checked_out')
     AND (
       (b.package_type = 'daylong' AND d.date  =  b.visit_date)
       OR
       (b.package_type = 'night'   AND d.date >=  b.visit_date AND d.date < b.check_out_date)
     )
    LEFT JOIN booking_rooms br ON br.booking_id = b.id
    GROUP BY d.date
  ),
  itinerary AS (
    SELECT
      d.date,
      COALESCE(SUM(bdr.qty), 0)::int AS rooms_occupied
    FROM days d
    LEFT JOIN booking_days bd ON bd.day_date = d.date
    LEFT JOIN bookings b ON b.id = bd.booking_id AND b.status::text IN ('confirmed', 'checked_out')
    LEFT JOIN booking_day_rooms bdr ON bdr.booking_day_id = bd.id AND b.id IS NOT NULL
    GROUP BY d.date
  )
  SELECT
    r.date,
    (r.rooms_occupied + i.rooms_occupied)::int AS rooms_occupied,
    t.total_rooms,
    CASE
      WHEN t.total_rooms = 0 THEN 0
      ELSE ROUND(((r.rooms_occupied + i.rooms_occupied)::numeric / t.total_rooms) * 100, 2)
    END AS occupancy_pct
  FROM ranged r
  JOIN itinerary i ON i.date = r.date, total t
  ORDER BY r.date;
$function$;
