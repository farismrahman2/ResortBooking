-- ============================================================================
-- Migration D — get_expense_daily_pivot RPC
-- ============================================================================
-- Returns one row per (date, category) for a date range. The query layer
-- pivots this long-form result into a wide "Excel-style" matrix in JS.
-- Mirrors the existing `get_availability_range` RPC pattern.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_expense_daily_pivot(p_from date, p_to date)
RETURNS TABLE (
    expense_date  date,
    category_id   uuid,
    category_slug text,
    daily_total   numeric
) LANGUAGE sql STABLE AS $$
    SELECT
        e.expense_date,
        e.category_id,
        c.slug AS category_slug,
        SUM(e.amount) AS daily_total
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
    WHERE e.is_draft = false
      AND e.expense_date >= p_from
      AND e.expense_date <= p_to
    GROUP BY e.expense_date, e.category_id, c.slug
    ORDER BY e.expense_date, c.slug;
$$;
