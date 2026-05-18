-- =====================================================================
-- Coffee Shop POS — 001: extend reports_monthly_income with coffee shop
-- =====================================================================
-- Adds a third revenue line to the monthly income helper so the Reports
-- hub + /reports/income can show room / extras / coffee shop separately.
-- Adapted from spec to match the actual bookings schema (visit_date +
-- total). Idempotent — drops and recreates the function.
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
