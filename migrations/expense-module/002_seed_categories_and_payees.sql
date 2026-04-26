-- ============================================================================
-- Migration B-seed — Categories + Payees + Recurring templates
-- ============================================================================
-- Run AFTER 001_expense_schema.sql. Idempotent: re-running won't duplicate rows.
-- ============================================================================

-- 1. Categories
INSERT INTO expense_categories (name, slug, category_group, requires_description, requires_payee, display_order) VALUES
    -- Bazar / supplies
    ('Groceries (Daily Bazar)',       'groceries',          'bazar',          false, true,  10),
    ('Raw Meat',                      'raw_meat',           'bazar',          false, true,  20),
    ('Beverages (Soft Drinks/Water)', 'beverages',          'maintenance',    true,  false, 30),
    -- Utilities
    ('Diesel Oil',                    'diesel_oil',         'utilities',      false, false, 40),
    ('Wifi / Internet',               'wifi',               'utilities',      false, false, 50),
    ('Electricity Bill',              'electricity',        'utilities',      false, false, 60),
    -- Maintenance / services
    ('Housekeeping',                  'housekeeping',       'maintenance',    true,  false, 70),
    ('Swimming Pool Maintenance',     'pool_maintenance',   'maintenance',    false, false, 80),
    ('Metal Work (Mistiri)',          'metal_work',         'services',       false, true,  90),
    ('Contractor Work (General)',     'contractor_work',    'services',       false, true,  100),
    -- Salary
    ('Salary',                        'salary',             'salary',         false, false, 110),
    -- Materials
    ('Paint & Decoration',            'paint_decor',        'materials',      false, true,  120),
    ('Electric Material',             'electric_material',  'materials',      false, false, 130),
    -- Catch-all
    ('Miscellaneous',                 'miscellaneous',      'miscellaneous',  true,  false, 200)
ON CONFLICT (slug) DO NOTHING;

-- 2. Payees
INSERT INTO expense_payees (name, payee_type, notes, display_order) VALUES
    ('Al Amin',    'supplier',   'Daily groceries supplier',  10),
    ('Shahed',     'supplier',   'Raw meats supplier',        20),
    ('Nasir',      'contractor', 'Metal work / mistiri',      30),
    ('Banar',      'contractor', 'General contractor',        40),
    ('Rong/Rahi',  'contractor', 'Paint & decoration vendor', 50)
ON CONFLICT (lower(name)) DO NOTHING;

-- 3. Recurring templates (Phase 3 — safe to run early; nothing references them yet)
INSERT INTO recurring_expense_templates
    (name, category_id, day_of_month, default_amount, default_description)
VALUES
    ('Monthly Wifi Bill',
     (SELECT id FROM expense_categories WHERE slug = 'wifi'),
     5, NULL, 'Monthly internet bill'),
    ('Monthly Electricity Bill',
     (SELECT id FROM expense_categories WHERE slug = 'electricity'),
     10, NULL, 'Monthly power bill (REB)'),
    ('Monthly Salary Disbursement',
     (SELECT id FROM expense_categories WHERE slug = 'salary'),
     1, NULL, 'Staff salary for the month')
ON CONFLICT DO NOTHING;
