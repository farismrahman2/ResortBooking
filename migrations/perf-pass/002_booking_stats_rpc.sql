-- ============================================================================
-- get_booking_stats() RPC — dashboard revenue widget at any scale.
--
-- Replaces the app-side aggregation in lib/queries/bookings.ts::getBookingStats
-- which pulled every non-cancelled booking (with nested checkout + payments)
-- and summed in JS. Two problems with that:
--   1. PostgREST caps responses at 1000 rows → revenue silently undercounts
--      once the property passes 1000 bookings.
--   2. Payload grows linearly with booking history.
--
-- The math mirrors the JS exactly (and lib/checkout/totals.ts::calcNetDue):
--   pending_advance = Σ GREATEST(0,
--       total
--       - checkout discount  (only when checkout is finalized)
--       - advance_paid
--       - checkout payments  (only when checkout is finalized))
--
-- checkouts has UNIQUE(booking_id) → LEFT JOIN is 1:1 safe.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_booking_stats()
RETURNS TABLE (
  total_bookings  BIGINT,
  total_revenue   NUMERIC,
  pending_advance NUMERIC
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*)                                       AS total_bookings,
    COALESCE(SUM(b.total), 0)                      AS total_revenue,
    COALESCE(SUM(GREATEST(0,
      b.total
      - CASE WHEN c.status = 'finalized' THEN COALESCE(c.discount_amount, 0) ELSE 0 END
      - COALESCE(b.advance_paid, 0)
      - CASE WHEN c.status = 'finalized' THEN COALESCE(p.paid, 0) ELSE 0 END
    )), 0)                                         AS pending_advance
  FROM bookings b
  LEFT JOIN checkouts c ON c.booking_id = b.id
  LEFT JOIN LATERAL (
    SELECT SUM(cp.amount) AS paid
      FROM checkout_payments cp
     WHERE cp.checkout_id = c.id
  ) p ON true
  WHERE b.status <> 'cancelled';
$$;

-- Verify: should return one row of stats
SELECT * FROM get_booking_stats();
