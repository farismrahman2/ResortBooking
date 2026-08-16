-- ─────────────────────────────────────────────────────────────────────────────
-- Platform audit · 001 — unique business numbers
--
-- Quote and booking numbers are allocated by reading MAX+1 and inserting.
-- Nothing stopped two concurrent conversions from picking the SAME number —
-- the table had a plain (non-unique) index, so both inserts succeeded and the
-- duplicate went out on invoices and WhatsApp messages.
--
-- These unique indexes make the duplicate impossible; the app now catches the
-- rejection (SQLSTATE 23505) and retries with a freshly read number.
--
-- If this errors with "could not create unique index" you ALREADY have
-- duplicate numbers. Find them with:
--   SELECT booking_number, count(*) FROM bookings GROUP BY 1 HAVING count(*) > 1;
--   SELECT quote_number,   count(*) FROM quotes   GROUP BY 1 HAVING count(*) > 1;
-- renumber the newer duplicate by hand, then run this again.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_booking_number ON bookings (booking_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_quote_number     ON quotes   (quote_number);
