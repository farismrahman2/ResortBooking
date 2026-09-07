-- ─────────────────────────────────────────────────────────────────────────────
-- Comp rooms · 001 — a paid room and a free room of the same type
--
-- The quote form has always had two room sections: the paid rooms and the
-- complimentary ones. Both write to the same table, one row each, so giving
-- a guest (say) one Eco Deluxe at ৳6,000 plus one Eco Deluxe free produces
-- two rows with room_type = 'eco_deluxe' — which the old
-- UNIQUE (quote_id, room_type) rejected:
--
--   duplicate key value violates unique constraint
--   "quote_rooms_quote_id_room_type_key"
--
-- The quote was rolled back and the agent could not save it at all. The same
-- constraint on booking_rooms would have blocked the conversion too.
--
-- The natural key is really (quote, room type, paid or free), so the plain
-- unique constraints are replaced by two partial ones. A quote still cannot
-- carry two paid rows of one type, or two free rows of one type — only the
-- one-paid-plus-one-free pair the form produces is allowed through.
--
-- Nothing existing can violate the new indexes: the old constraint was
-- stricter than both of them together.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE quote_rooms   DROP CONSTRAINT IF EXISTS quote_rooms_quote_id_room_type_key;
ALTER TABLE booking_rooms DROP CONSTRAINT IF EXISTS booking_rooms_booking_id_room_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS quote_rooms_quote_id_room_type_paid_key
  ON quote_rooms (quote_id, room_type) WHERE unit_price > 0;

CREATE UNIQUE INDEX IF NOT EXISTS quote_rooms_quote_id_room_type_free_key
  ON quote_rooms (quote_id, room_type) WHERE unit_price = 0;

CREATE UNIQUE INDEX IF NOT EXISTS booking_rooms_booking_id_room_type_paid_key
  ON booking_rooms (booking_id, room_type) WHERE unit_price > 0;

CREATE UNIQUE INDEX IF NOT EXISTS booking_rooms_booking_id_room_type_free_key
  ON booking_rooms (booking_id, room_type) WHERE unit_price = 0;
