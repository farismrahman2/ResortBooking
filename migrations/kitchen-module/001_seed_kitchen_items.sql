-- =====================================================================
-- Seed the kitchen item catalogue from the PAX KITCHEN Requisition form
-- =====================================================================
-- Transcribed from the paper form (Requisition 08). Names are stored as
-- "English / বাংলা" so the picker matches whichever script the person types —
-- kitchen staff write Bangla, office staff read English.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: assign kitchen_vendor_id. Tagging is
-- yours to do. The split that matters (fish vs chicken vs beef, and which dry
-- goods count as "grocery") is a business decision about who you buy from,
-- not something to infer from a category name.
--
-- Duplicates on the paper form are seeded once. গুড়া দুধ, গরুর দুধ, চিনি,
-- কাঁচা কলা and টমেটো সস each appear in two columns — they are one item, and
-- the column they sat in was about who fetched them, which is now the vendor
-- tag instead.
--
-- Idempotent: matches on (kitchen store, name), so re-running adds nothing.
-- =====================================================================

WITH store AS (
  SELECT id FROM inv_stores WHERE slug = 'kitchen'
),
seed(name, cat_slug, unit_slug) AS (VALUES
  -- ── Grocery / dry goods (form column 1) ─────────────────────────────
  ('Soybean oil / তেল',              'oil_ghee',   'liter'),
  ('Flour (maida) / ময়দা',           'rice_grains','kilogram'),
  ('Panch phoron / পাঁচফোড়ন',        'spices',     'kilogram'),
  ('Masoor dal / মুসুরি ডাল',         'rice_grains','kilogram'),
  ('Chana dal / বুটের ডাল',          'rice_grains','kilogram'),
  ('Moong dal / মুগ ডাল',            'rice_grains','kilogram'),
  ('Semolina (suji) / সুজি',         'rice_grains','kilogram'),
  ('Sugar / চিনি',                   'packaged',   'kilogram'),
  ('Polao rice / পোলাও চাল',         'rice_grains','kilogram'),
  ('Miniket rice / মিনিকেট চাল',      'rice_grains','kilogram'),
  ('Raisin / কিসমিস',                'packaged',   'gram'),
  ('Cardamom / এলাচি',               'spices',     'gram'),
  ('Clove / লং',                     'spices',     'gram'),
  ('Turmeric powder / হলুদের গুঁড়া',  'spices',     'kilogram'),
  ('Chilli powder / মরিচের গুঁড়া',    'spices',     'kilogram'),
  ('Kewra water / কেওড়া জল',         'spices',     'piece'),
  ('Tomato sauce / টমেটো সস',         'packaged',   'kilogram'),
  ('Ghee / ঘি',                      'oil_ghee',   'kilogram'),
  ('Toast biscuit / টোস্ট বিস্কুট',    'packaged',   'piece'),
  ('Powdered milk / গুঁড়া দুধ',       'dairy_eggs', 'gram'),
  ('Cashew nut / কাজুবাদাম',          'packaged',   'gram'),
  ('Almond / কাঠবাদাম',              'packaged',   'gram'),
  ('Dry chilli / শুকনা মরিচ',         'spices',     'gram'),
  ('Mustard oil / সরিষার তেল',        'oil_ghee',   'liter'),
  ('Peanut / চিনা বাদাম',            'packaged',   'gram'),
  ('Cumin / জিরা',                   'spices',     'gram'),
  ('Bread / ব্রেড',                  'packaged',   'piece'),
  ('Vermicelli (semai) / সেমাই',     'packaged',   'pack'),
  ('Rin powder / রিন পাউডার',         'cleaning_k', 'kilogram'),
  ('Firewood / লাকরি',               'other_k',    'kilogram'),
  ('Roast masala / রোস্টের মসলা',     'spices',     'piece'),
  ('Garam masala / গরম মসলা',        'spices',     'piece'),
  ('Chickpea / ছোলা',                'rice_grains','kilogram'),
  ('Cow milk / গরুর দুধ',            'dairy_eggs', 'liter'),

  -- ── Vegetables (form column 2, upper) ───────────────────────────────
  ('Onion / পেঁয়াজ',                 'vegetables', 'kilogram'),
  ('Potato / আলু',                   'vegetables', 'kilogram'),
  ('Green banana / কাঁচা কলা',        'vegetables', 'piece'),
  ('Ginger / আদা',                   'vegetables', 'kilogram'),
  ('Garlic / রসুন',                  'vegetables', 'kilogram'),
  ('Tomato / টমেটো',                 'vegetables', 'kilogram'),
  ('Carrot / গাজর',                  'vegetables', 'kilogram'),
  ('Papaya / পেঁপে',                 'vegetables', 'kilogram'),
  ('Snake gourd / চিচিঙ্গা',          'vegetables', 'kilogram'),
  ('Coriander leaf / ধনিয়া পাতা',     'vegetables', 'gram'),
  ('Lemon / লেবু',                   'vegetables', 'piece'),
  ('Cucumber / শসা',                 'vegetables', 'kilogram'),
  ('Taro stolon (loti) / লতি',       'vegetables', 'kilogram'),
  ('Bottle gourd / লাউ',             'vegetables', 'piece'),
  ('Jhali kumra / ঝালি',             'vegetables', 'piece'),
  ('Green chilli / কাঁচা মরিচ',       'vegetables', 'gram'),
  ('Round eggplant / গোল বেগুন',      'vegetables', 'kilogram'),
  ('Capsicum / ক্যাপসিকাম',           'vegetables', 'kilogram'),
  ('Cabbage / পাতাকপি',              'vegetables', 'piece'),
  ('Cauliflower / ফুলকপি',           'vegetables', 'piece'),
  ('Long bean (borboti) / বরবটি',    'vegetables', 'kilogram'),

  -- ── Meat, poultry, fish (form column 2, lower) ──────────────────────
  ('Beef / গরুর মাংস',               'meat_fish',  'kilogram'),
  ('Deshi chicken / দেশি মুরগি',      'meat_fish',  'piece'),
  ('Broiler chicken / বয়লার মুরগি',   'meat_fish',  'piece'),
  -- Not on this form, but the chicken group bills it every week.
  ('Sonali chicken / সোনালি মুরগি',   'meat_fish',  'piece'),
  ('Egg / ডিম',                      'dairy_eggs', 'piece'),
  ('Mutton / মাটন',                  'meat_fish',  'kilogram'),
  ('Fish / মাছ',                     'meat_fish',  'kilogram'),
  ('Dried fish (shutki) / শুটকি',     'meat_fish',  'kilogram'),
  ('Prawn / চিংড়ি মাছ',              'meat_fish',  'kilogram'),
  ('Small fish (gura) / গুড়া মাছ',    'meat_fish',  'kilogram'),

  -- ── Dining / pantry (form column 3, "DAINING") ──────────────────────
  ('Tissue napkin / টিস্যু ন্যাপকিন',  'disposables','pack'),
  ('Tea leaf / চা পাতা',             'beverages_k','gram'),
  ('Sweet - red / মিষ্টি লাল',        'packaged',   'piece'),
  ('Yoghurt / দই',                   'dairy_eggs', 'kilogram'),
  ('Banana / কলা',                   'vegetables', 'piece'),
  ('One-time cup / ওয়ান টাইম কাপ',   'disposables','piece'),
  ('Savlon / স্যাভলন',               'cleaning_k', 'bottle'),
  ('Wrapping paper / রেপিং পেপার',    'disposables','roll'),
  ('Tang / ট্যাং',                   'beverages_k','bottle'),
  ('Water 500ml / পানি ৫০০ মিলি',     'beverages_k','bottle'),
  ('Malta orange / মালটা',           'vegetables', 'kilogram')
),
resolved AS (
  SELECT
    s.name,
    c.id  AS category_id,
    u.id  AS unit_id,
    ROW_NUMBER() OVER (ORDER BY s.name) AS rn
  FROM seed s
  CROSS JOIN store st
  LEFT JOIN inv_categories c ON c.slug = s.cat_slug AND c.store_id = st.id
  LEFT JOIN inv_units      u ON u.slug = s.unit_slug
  WHERE NOT EXISTS (
    SELECT 1 FROM inv_items i WHERE i.store_id = st.id AND i.name = s.name
  )
)
INSERT INTO inv_items (sku_code, store_id, category_id, name, unit_id, item_type, is_active)
SELECT
  -- Continue the KIT- sequence past whatever already exists, so a partial
  -- earlier run or a hand-added item can't cause a UNIQUE collision.
  'KIT-' || LPAD((
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(sku_code, '^KIT-', ''), '')::int)
        FROM inv_items WHERE sku_code ~ '^KIT-[0-9]+$'
    ), 0) + r.rn
  )::text, 4, '0'),
  st.id, r.category_id, r.name, r.unit_id, 'consumable', true
FROM resolved r CROSS JOIN store st;

-- Verify
SELECT 'kitchen_items_total' AS item, COUNT(*)::text AS val
  FROM inv_items i JOIN inv_stores s ON s.id = i.store_id WHERE s.slug='kitchen'
UNION ALL
SELECT 'awaiting_vendor_tag', COUNT(*)::text
  FROM inv_items i JOIN inv_stores s ON s.id = i.store_id
 WHERE s.slug='kitchen' AND i.kitchen_vendor_id IS NULL;
