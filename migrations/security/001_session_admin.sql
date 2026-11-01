-- ─────────────────────────────────────────────────────────────────────────────
-- Security · 001 — let the admin see and end other users' login sessions
--
-- For a lost or stolen laptop: Settings → Users → (user) → Signed-in devices,
-- and "Emergency: sign out everyone". Deleting a row from auth.sessions ends
-- that login: its refresh tokens go with it, and Supabase answers
-- session_not_found to the next request made with its access token, so the
-- device is sent to /login on its next click.
--
-- The functions run as their owner (SECURITY DEFINER) to reach the auth
-- schema, and ONLY the service role may call them — the server calls them
-- after checking the caller is the admin (lib/actions/users.ts).
--
-- One pass. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_sessions(p_user UUID)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, last_active TIMESTAMPTZ, user_agent TEXT, ip TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT s.id, s.created_at,
         greatest(s.updated_at, s.refreshed_at AT TIME ZONE 'UTC', s.created_at) AS last_active,
         s.user_agent, host(s.ip)
    FROM auth.sessions s
   WHERE s.user_id = p_user
     AND (s.not_after IS NULL OR s.not_after > now())
   ORDER BY 3 DESC
$$;

-- One session (p_session) or all of the user's sessions. Returns how many ended.
CREATE OR REPLACE FUNCTION public.admin_revoke_sessions(p_user UUID, p_session UUID DEFAULT NULL, p_keep_session UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  DELETE FROM auth.sessions s
   WHERE s.user_id = p_user
     AND (p_session IS NULL OR s.id = p_session)
     AND (p_keep_session IS NULL OR s.id <> p_keep_session);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Everyone except the caller's own session. Returns how many ended.
CREATE OR REPLACE FUNCTION public.admin_revoke_all_sessions(p_keep_session UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  IF p_keep_session IS NULL THEN RAISE EXCEPTION 'p_keep_session is required'; END IF;
  DELETE FROM auth.sessions s WHERE s.id <> p_keep_session;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_sessions(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_sessions(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_all_sessions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_sessions(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_sessions(UUID) TO service_role;

-- Audit Log events for sign-outs and password resets.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT con.conname INTO cname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'admin_alerts' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event_type%' LIMIT 1;
  IF cname IS NOT NULL THEN EXECUTE format('ALTER TABLE admin_alerts DROP CONSTRAINT %I', cname); END IF;
  ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_event_type_check
    CHECK (event_type IN (
      'discount_applied','guest_reduced','checkout_voided','refund_recorded','booking_cancelled',
      'booking_no_show','user_deactivated','due_overdue',
      'advance_corrected','advance_removed','booking_edited',
      'room_block_created','room_block_changed','room_block_released',
      'room_prices_changed','revenue_display_changed',
      'sessions_revoked','password_reset'
    ));
END $$;
