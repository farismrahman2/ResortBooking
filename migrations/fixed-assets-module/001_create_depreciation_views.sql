-- =====================================================================
-- Fixed Assets Module — Phase 2: depreciation view + monthly RPC
-- Run after 000_create_fixed_assets_tables.sql. Idempotent.
-- The app computes depreciation in TypeScript (lib/fixed-assets/depreciation.ts)
-- for consistency/testability; this view + RPC exist for direct SQL / BI use
-- and a future P&L integration.
-- =====================================================================

CREATE OR REPLACE VIEW fa_assets_with_depreciation AS
WITH calc AS (
  SELECT
    a.id AS asset_id,
    LEAST(
      (a.useful_life_years * 12)::int,
      CASE
        WHEN a.status = 'active' THEN
          (EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.depreciation_start_date)) * 12 +
           EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.depreciation_start_date)))::int
        ELSE
          (EXTRACT(YEAR FROM AGE(a.disposal_date, a.depreciation_start_date)) * 12 +
           EXTRACT(MONTH FROM AGE(a.disposal_date, a.depreciation_start_date)))::int
      END
    ) AS months_elapsed,
    ROUND((a.acquisition_cost - a.salvage_value) / (a.useful_life_years * 12)::numeric, 2) AS monthly_depreciation
  FROM fa_assets a
  WHERE a.is_active = true
)
SELECT
  a.*,
  calc.monthly_depreciation,
  GREATEST(calc.months_elapsed, 0) AS months_elapsed,
  ROUND(LEAST(calc.monthly_depreciation * GREATEST(calc.months_elapsed, 0),
              a.acquisition_cost - a.salvage_value), 2) AS total_depreciation,
  ROUND(GREATEST(
    a.acquisition_cost - calc.monthly_depreciation * GREATEST(calc.months_elapsed, 0),
    a.salvage_value
  ), 2) AS net_book_value,
  GREATEST(a.useful_life_years * 12 - GREATEST(calc.months_elapsed, 0), 0) AS remaining_useful_months,
  (GREATEST(calc.months_elapsed, 0) >= a.useful_life_years * 12) AS is_fully_depreciated
FROM fa_assets a
JOIN calc ON calc.asset_id = a.id;

CREATE OR REPLACE FUNCTION fa_monthly_depreciation(p_month DATE)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(adv.monthly_depreciation), 0)
  FROM fa_assets a
  JOIN fa_assets_with_depreciation adv ON adv.id = a.id
  WHERE a.is_active = true
    AND a.depreciation_start_date <= p_month
    AND (a.disposal_date IS NULL OR a.disposal_date > p_month)
    AND adv.months_elapsed > 0
    AND NOT adv.is_fully_depreciated;
$$ LANGUAGE sql STABLE;

SELECT 'fa_assets_with_depreciation view created' AS status;
