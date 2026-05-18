-- =====================================================================
-- Reports Module — Phase 1 helpers
-- =====================================================================
-- Read-only aggregator functions used by the reports hub. Idempotent.
-- Adjusted from the spec to match actual schema: bookings has visit_date
-- (not check_in_date) and total (not total_amount). Total-rooms config
-- reuses the existing `settings` key-value table — no new app_settings.
-- =====================================================================

-- Helper: earliest day of usable data. Hardcoded baseline of 2026-05-01;
-- otherwise the earliest visit_date / expense_date in the system.
CREATE OR REPLACE FUNCTION reports_data_start_date()
RETURNS DATE AS $$
  SELECT LEAST(
    COALESCE((SELECT MIN(visit_date)   FROM bookings WHERE visit_date IS NOT NULL), '2026-05-01'),
    COALESCE((SELECT MIN(expense_date) FROM expenses), '2026-05-01'),
    '2026-05-01'::date
  );
$$ LANGUAGE sql STABLE;

-- Helper: monthly income aggregator (rooms + finalized-checkout extras).
-- Returns a row per month in [p_from, p_to], zero-filled where missing.
CREATE OR REPLACE FUNCTION reports_monthly_income(p_from DATE, p_to DATE)
RETURNS TABLE (
  month          DATE,
  room_revenue   NUMERIC,
  extras_revenue NUMERIC,
  total_revenue  NUMERIC,
  booking_count  BIGINT
) AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date AS month
  ),
  bookings_agg AS (
    SELECT
      date_trunc('month', visit_date)::date AS month,
      SUM(total) AS room_revenue,
      COUNT(*)   AS booking_count
    FROM bookings
    WHERE visit_date BETWEEN p_from AND p_to
      AND status <> 'cancelled'
    GROUP BY 1
  ),
  extras_agg AS (
    SELECT
      date_trunc('month', co.finalized_at)::date AS month,
      SUM(co.charges_total) AS extras_revenue
    FROM checkouts co
    WHERE co.status = 'finalized'
      AND co.finalized_at BETWEEN p_from AND (p_to + interval '1 day')
    GROUP BY 1
  )
  SELECT
    m.month,
    COALESCE(b.room_revenue,   0)::numeric AS room_revenue,
    COALESCE(e.extras_revenue, 0)::numeric AS extras_revenue,
    (COALESCE(b.room_revenue, 0) + COALESCE(e.extras_revenue, 0))::numeric AS total_revenue,
    COALESCE(b.booking_count, 0) AS booking_count
  FROM months m
  LEFT JOIN bookings_agg b USING (month)
  LEFT JOIN extras_agg   e USING (month)
  ORDER BY m.month;
$$ LANGUAGE sql STABLE;

-- Helper: monthly expenses aggregator (excludes drafts).
CREATE OR REPLACE FUNCTION reports_monthly_expenses(p_from DATE, p_to DATE)
RETURNS TABLE (
  month          DATE,
  total_expenses NUMERIC,
  expense_count  BIGINT
) AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date AS month
  ),
  exp_agg AS (
    SELECT
      date_trunc('month', expense_date)::date AS month,
      SUM(amount) AS total_expenses,
      COUNT(*)    AS expense_count
    FROM expenses
    WHERE expense_date BETWEEN p_from AND p_to
      AND is_draft = false
    GROUP BY 1
  )
  SELECT
    m.month,
    COALESCE(e.total_expenses, 0)::numeric AS total_expenses,
    COALESCE(e.expense_count,  0)          AS expense_count
  FROM months m
  LEFT JOIN exp_agg e USING (month)
  ORDER BY m.month;
$$ LANGUAGE sql STABLE;

-- Helper: daily occupancy. `total_rooms` is read from the existing
-- `settings` key-value table; if unset, falls back to SUM(room_inventory.total_units).
-- A booking occupies a room on each date in [visit_date, check_out_date) for
-- night packages and only on visit_date for daylong.
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
      ON b.status <> 'cancelled'
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
