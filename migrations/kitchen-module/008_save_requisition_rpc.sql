-- ============================================================================
-- Kitchen module · 008 — save a requisition in one round trip, atomically
--
-- The autosave fires every 1.2 seconds while somebody types, and each one made
-- FOUR sequential Supabase calls: read the row, update the header, delete every
-- line, insert them again. On a phone on 4G that is most of a second of pure
-- network per save, and the saves overlap. It is the reason the form feels
-- heavy while you are working in it.
--
-- Collapsing it into one function fixes three things at once:
--
--   1. ONE round trip instead of four.
--   2. ATOMICITY. The delete and the insert were separate statements, so an
--      insert that failed after a successful delete left a requisition with no
--      lines at all — the worst possible outcome for a screen whose entire job
--      is holding a list.
--   3. NUMBERING. requisition_no was derived from COUNT(*) + 1, which repeats
--      a number as soon as any row is deleted — and discardRequisition deletes.
--      The unique index caught it and the caller retried, but the collision was
--      guaranteed rather than unlucky. MAX + 1 under an advisory lock cannot
--      collide, and the lock serialises two people creating at the same moment.
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION kitchen_save_requisition(
  p_id            uuid,
  p_event_date    date,
  p_notes         text,
  -- "not supplied" and "cleared" are different things. COALESCE alone would
  -- make emptying the notes box impossible, because the schema turns '' into
  -- null and null would then mean "leave it alone".
  p_notes_provided boolean,
  p_is_emergency  boolean,
  p_parent        uuid,
  p_created_by    uuid,
  p_lines         jsonb,
  -- The form sometimes saves the header only (a date change with no line edit).
  -- Rewriting the lines in that case is pure cost.
  p_write_lines   boolean DEFAULT true,
  -- Lazy creation: opening the form must not leave an empty requisition behind,
  -- so the caller says whether anything worth persisting has been entered yet.
  -- Passed in rather than inferred, because a draft whose every line was just
  -- deleted still has to save that deletion.
  p_create_if_missing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER          -- RLS still applies; this is a convenience, not a bypass.
AS $$
DECLARE
  v_status  text;
  v_no      text;
  v_next    int;
  v_created boolean := false;
BEGIN
  -- FOR UPDATE: two tabs autosaving the same draft otherwise interleave their
  -- delete/insert and can shuffle sort_order or duplicate lines.
  SELECT status INTO v_status
    FROM kitchen_requisitions
   WHERE id = p_id
   FOR UPDATE;

  IF NOT FOUND AND NOT p_create_if_missing THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'noop', true);
  END IF;

  IF NOT FOUND THEN
    -- Serialise number allocation. Cheap: held only for this transaction, and
    -- creating a requisition is a once-a-day act, not a hot path.
    PERFORM pg_advisory_xact_lock(hashtext('kitchen_requisition_no'));

    SELECT COALESCE(MAX(substring(requisition_no from 4)::int), 0) + 1
      INTO v_next
      FROM kitchen_requisitions
     WHERE requisition_no ~ '^RQ-[0-9]+$';   -- excludes amendments (RQ-0008-A)

    v_no := 'RQ-' || lpad(v_next::text, 4, '0');

    INSERT INTO kitchen_requisitions (
      id, requisition_no, status, event_date, is_emergency,
      parent_requisition_id, created_by
    ) VALUES (
      p_id, v_no, 'draft',
      COALESCE(p_event_date, CURRENT_DATE),
      COALESCE(p_is_emergency, false),
      p_parent, p_created_by
    );
    v_status  := 'draft';
    v_created := true;

  ELSIF v_status <> 'draft' THEN
    -- Not an exception: the caller turns this into a message, and raising
    -- would roll back nothing useful while costing a stack trace.
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot edit — this requisition is ' || replace(v_status, '_', ' ') || '.'
    );
  END IF;

  -- Header. Every field is only written when the caller actually supplied one:
  -- event_date and is_emergency are NOT NULL, and an empty date input arriving
  -- as null used to overwrite the value the insert had just defaulted.
  UPDATE kitchen_requisitions
     SET event_date   = COALESCE(p_event_date, event_date),
         notes        = CASE WHEN p_notes_provided THEN p_notes ELSE notes END,
         is_emergency = COALESCE(p_is_emergency, is_emergency),
         updated_at   = NOW()
   WHERE id = p_id;

  IF p_write_lines THEN
    DELETE FROM kitchen_requisition_lines WHERE requisition_id = p_id;

    INSERT INTO kitchen_requisition_lines (
      requisition_id, sort_order, item_id, item_name, kitchen_vendor_id,
      qty, piece_count, unit_id, notes, is_extra
    )
    SELECT
      p_id,
      (l->>'sort_order')::int,
      NULLIF(l->>'item_id', '')::uuid,
      l->>'item_name',
      NULLIF(l->>'kitchen_vendor_id', '')::uuid,
      (l->>'qty')::numeric,
      NULLIF(l->>'piece_count', '')::numeric,
      NULLIF(l->>'unit_id', '')::uuid,
      NULLIF(l->>'notes', ''),
      COALESCE((l->>'is_extra')::boolean, false)
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS l
    -- Same rule as the TypeScript path: a blank row doesn't persist, but a
    -- negative one does — that is how an amendment cancels part of an order.
    WHERE COALESCE(btrim(l->>'item_name'), '') <> ''
      AND COALESCE((l->>'qty')::numeric, 0) <> 0;
  END IF;

  SELECT requisition_no INTO v_no FROM kitchen_requisitions WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true, 'created', v_created, 'requisition_no', v_no, 'status', v_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION kitchen_save_requisition(
  uuid, date, text, boolean, boolean, uuid, uuid, jsonb, boolean, boolean
) TO authenticated;

COMMENT ON FUNCTION kitchen_save_requisition IS
  'Create-or-update a draft requisition and replace its lines in one atomic '
  'statement. Replaces four sequential round trips from the autosave path.';

-- Verify
SELECT 'kitchen_save_requisition' AS item,
       COUNT(*)::text AS val
  FROM pg_proc WHERE proname = 'kitchen_save_requisition';
