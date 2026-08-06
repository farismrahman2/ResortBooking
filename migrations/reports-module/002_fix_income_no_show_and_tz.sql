-- =====================================================================
-- Fix reports_monthly_income: no-show revenue + Dhaka month bucketing
-- =====================================================================
-- Two defects in the version from coffee-shop-module/001:
--
-- 1. NO-SHOW COUNTED AT FULL VALUE. `SUM(total) … WHERE status <> 'cancelled'`
--    counted a no-show's entire booking total. checkout-module/003_no_show.sql
--    states the rule: a no-show contributes advance_paid only, because that is
--    the non-refundable amount actually collected. get_booking_stats() already
--    implements this, so the dashboard and the reports disagreed. The same
--    filter also admitted draft/sent bookings — an unaccepted quote is not
--    revenue.
--
-- 2. EXTRAS BUCKETED BY UTC. checkouts.finalized_at is TIMESTAMPTZ, and
--    date_trunc('month', finalized_at) truncates in UTC. The resort runs on
--    Asia/Dhaka (UTC+6), so a checkout finalized between 00:00 and 05:59
--    Dhaka fell into the PREVIOUS month at a month boundary. Now converted
--    with AT TIME ZONE 'Asia/Dhaka' first. The upper bound also became
--    half-open so the last day isn't double-counted into the next month.
--
-- This feeds the Reports hub, /reports/income, monthly P&L and
-- salary-vs-revenue, so those figures will move — that is the fix, not a
-- regression. Room revenue was previously overstated by
-- SUM(total - advance_paid) across all no-shows.
--
-- Idempotent — drops and recreates.
-- =====================================================================

DROP FUNCTION IF EXISTS reports_monthly_income(DATE, DATE);

CREATE OR REPLACE FUNCTION reports_monthly_income(p_from DATE, p_to DATE)
RETURNS TABLE (
  month               DATE,
  room_revenue        NUMERIC,
  extras_revenue      NUMERIC,
  coffee_shop_revenue NUMERIC,
  total_revenue       NUMERIC,
  booking_count       BIGINT
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
      -- A no-show keeps only the non-refundable advance.
      SUM(CASE
            WHEN status::text = 'no_show' THEN COALESCE(advance_paid, 0)
            ELSE COALESCE(total, 0)
          END) AS room_revenue,
      COUNT(*)   AS booking_count
    FROM bookings
    WHERE visit_date BETWEEN p_from AND p_to
      AND status::text IN ('confirmed', 'checked_out', 'no_show')
    GROUP BY 1
  ),
  extras_agg AS (
    SELECT
      -- Bucket by Dhaka calendar month, not UTC.
      date_trunc('month', (co.finalized_at AT TIME ZONE 'Asia/Dhaka'))::date AS month,
      SUM(co.charges_total) AS extras_revenue
    FROM checkouts co
    WHERE co.status = 'finalized'
      AND (co.finalized_at AT TIME ZONE 'Asia/Dhaka') >= p_from
      AND (co.finalized_at AT TIME ZONE 'Asia/Dhaka') <  (p_to + interval '1 day')
    GROUP BY 1
  ),
  coffee_agg AS (
    SELECT
      date_trunc('month', cs.sale_date)::date AS month,
      SUM(cs.net_amount) AS coffee_shop_revenue
    FROM coffee_shop_sales cs
    WHERE cs.status = 'completed'
      AND cs.sale_date BETWEEN p_from AND p_to
    GROUP BY 1
  )
  SELECT
    m.month,
    COALESCE(b.room_revenue,        0)::numeric AS room_revenue,
    COALESCE(e.extras_revenue,      0)::numeric AS extras_revenue,
    COALESCE(c.coffee_shop_revenue, 0)::numeric AS coffee_shop_revenue,
    (COALESCE(b.room_revenue, 0)
      + COALESCE(e.extras_revenue, 0)
      + COALESCE(c.coffee_shop_revenue, 0))::numeric AS total_revenue,
    COALESCE(b.booking_count, 0) AS booking_count
  FROM months m
  LEFT JOIN bookings_agg b USING (month)
  LEFT JOIN extras_agg   e USING (month)
  LEFT JOIN coffee_agg   c USING (month)
  ORDER BY m.month;
$$ LANGUAGE sql STABLE;

SELECT 'reports_monthly_income' AS fn, 'no_show + Dhaka tz fixed' AS status;
