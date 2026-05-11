-- =====================================================================
-- Perf pass — 000: indexes on hot filter columns
-- =====================================================================
-- Single-tenant resort schema, all queries currently do Seq Scans on
-- bookings/quotes/loans/payroll_runs because the original migrations
-- shipped without secondary indexes. This file is idempotent and
-- backfills the ones the codebase actually filters on.
-- =====================================================================

-- bookings: visit_date is the universal filter (lists, analytics,
-- availability, reports). status is the second-most-common filter.
CREATE INDEX IF NOT EXISTS idx_bookings_visit_date    ON bookings(visit_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status        ON bookings(status);
-- Composite for the very common "confirmed/checked_out in date range" query
CREATE INDEX IF NOT EXISTS idx_bookings_status_visit  ON bookings(status, visit_date);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out     ON bookings(check_out_date) WHERE check_out_date IS NOT NULL;
-- created_at is used by ordering on /bookings list when visit_date ties
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number ON bookings(booking_number);

-- quotes: same filter patterns
CREATE INDEX IF NOT EXISTS idx_quotes_visit_date      ON quotes(visit_date);
CREATE INDEX IF NOT EXISTS idx_quotes_status          ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_status_visit    ON quotes(status, visit_date);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number    ON quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_converted       ON quotes(converted_to_booking_id) WHERE converted_to_booking_id IS NOT NULL;

-- booking_rooms / quote_rooms — joined heavily for availability queries
CREATE INDEX IF NOT EXISTS idx_booking_rooms_booking  ON booking_rooms(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_rooms_room_type ON booking_rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_quote_rooms_quote      ON quote_rooms(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_rooms_room_type  ON quote_rooms(room_type);

-- loans: filtered by status in the HR loan-exposure report
CREATE INDEX IF NOT EXISTS idx_loans_status           ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_employee         ON loans(employee_id);
CREATE INDEX IF NOT EXISTS idx_loans_taken_on         ON loans(taken_on);

-- payroll_runs: salary-vs-revenue report filters by period + status
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period    ON payroll_runs(period);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status    ON payroll_runs(status);

-- history_log: audit queries
CREATE INDEX IF NOT EXISTS idx_history_log_entity_id   ON history_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_history_log_created_at  ON history_log(created_at DESC);

-- Verify (counts the new indexes the planner can use)
SELECT schemaname, tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname LIKE 'idx_%'
 ORDER BY tablename, indexname;
