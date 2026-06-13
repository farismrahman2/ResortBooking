-- ============================================================================
-- No-show booking status — advances are non-refundable, so a no-show keeps
-- the advance as earned revenue but never books the room rate that was
-- never actually consumed.
--
-- Schema-wise: a third terminal status alongside cancelled and checked_out.
-- Availability treats it like cancelled (room is freed for resale). Revenue
-- reporting treats it like cancelled for the room total, but adds back the
-- advance as actual income — see lib/queries/bookings.ts::getBookingStats
-- and migrations/perf-pass/002_booking_stats_rpc.sql.
--
-- ⚠️ RUN IN TWO PASSES. Postgres rejects same-transaction use of a newly
-- added enum value ("unsafe use of new value"). Supabase SQL Editor wraps
-- each Run in one transaction, so:
--   • Pass 1: section 1 (extend the enum) alone — Run.
--   • Pass 2: sections 2–4 — Run.
-- The function body uses b.status::text so the planner never has to resolve
-- the enum literal against an uncommitted catalog version.
-- ============================================================================

-- ─── PASS 1 ─────────────────────────────────────────────────────────────────
-- 1. Extend booking_status — same enum-or-CHECK detection used to add
-- 'checked_out' in 000_create_checkout_tables.sql.
DO $$
DECLARE
  is_enum BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'booking_status' AND typtype = 'e'
  ) INTO is_enum;

  IF is_enum THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'booking_status' AND e.enumlabel = 'no_show'
    ) THEN
      EXECUTE 'ALTER TYPE booking_status ADD VALUE ''no_show''';
    END IF;
  ELSE
    DECLARE
      cname TEXT;
    BEGIN
      SELECT con.conname INTO cname
        FROM pg_constraint con
        JOIN pg_class    rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid  = rel.relnamespace
       WHERE rel.relname = 'bookings'
         AND ns.nspname  = 'public'
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%status%'
       LIMIT 1;
      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', cname);
      END IF;
      ALTER TABLE bookings
        ADD CONSTRAINT bookings_status_check
        CHECK (status IN ('draft','sent','confirmed','cancelled','checked_out','no_show'));
    END;
  END IF;
END $$;

-- ─── PASS 2 (run separately after pass 1 commits) ───────────────────────────
-- 2. No-show audit columns — when + who. Advance amount lives in
-- bookings.advance_paid already; we don't duplicate it.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_by UUID REFERENCES auth.users(id);

-- 2b. Extend admin_alerts.event_type CHECK to allow 'booking_no_show'.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'admin_alerts'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_alerts DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_event_type_check
    CHECK (event_type IN (
      'discount_applied','guest_reduced','checkout_voided',
      'refund_recorded','booking_cancelled','booking_no_show','user_deactivated'
    ));
END $$;

-- 3. Reporting RPC — re-create get_booking_stats() to handle no_show.
-- For a no-show: total revenue contribution = advance_paid (the non-refundable
-- amount the guest actually paid), NOT the full booking total. pending_advance
-- becomes 0 (the desk isn't going to chase a no-show for the balance).
-- For cancelled: still excluded entirely (advances are refunded).
--
-- b.status::text avoids the same-transaction enum-literal trap if this whole
-- file is replayed in one shot on a fresh DB.
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
    COALESCE(SUM(
      CASE
        WHEN b.status::text = 'no_show' THEN COALESCE(b.advance_paid, 0)
        ELSE b.total
      END
    ), 0)                                          AS total_revenue,
    COALESCE(SUM(
      CASE
        WHEN b.status::text = 'no_show' THEN 0
        ELSE GREATEST(0,
          b.total
          - CASE WHEN c.status = 'finalized' THEN COALESCE(c.discount_amount, 0) ELSE 0 END
          - COALESCE(b.advance_paid, 0)
          - CASE WHEN c.status = 'finalized' THEN COALESCE(p.paid, 0) ELSE 0 END
        )
      END
    ), 0)                                          AS pending_advance
  FROM bookings b
  LEFT JOIN checkouts c ON c.booking_id = b.id
  LEFT JOIN LATERAL (
    SELECT SUM(cp.amount) AS paid
      FROM checkout_payments cp
     WHERE cp.checkout_id = c.id
  ) p ON true
  WHERE b.status::text <> 'cancelled';
$$;

SELECT * FROM get_booking_stats();
