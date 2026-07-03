-- =====================================================================
-- Menus Module — 001_seed_dish_catalog.sql
-- Full dish extract from 20 days of actual GCR menus (Jun–Jul 2026).
-- Idempotent. Table name adapted to Phase 1 schema (menu_dish_catalog);
-- category is free-text in the shipped schema, so the slugs below are
-- stored as-is. Dishes already seeded by 000 (category NULL) get their
-- category backfilled by the ON CONFLICT UPDATE (only when NULL).
-- =====================================================================

INSERT INTO menu_dish_catalog (name, category) VALUES
  -- Rice & bread (ভাত-রুটি)
  ('খিচুড়ি', 'rice_bread'),
  ('সবজি খিচুড়ি', 'rice_bread'),
  ('পরোটা (২ পিস)', 'rice_bread'),
  ('নান', 'rice_bread'),
  ('সাদা ভাত', 'rice_bread'),
  ('সাদা পোলাও', 'rice_bread'),
  ('পোলাও', 'rice_bread'),
  ('ফ্রাইড রাইস', 'rice_bread'),
  ('ব্রেড, বাটার, জেলি', 'rice_bread'),

  -- Curries & mains (তরকারি)
  ('ডিমের ওমলেট (১ পিস)', 'curry_main'),
  ('মুরগীর মাংসের কারী', 'curry_main'),
  ('মুগের ডাল দিয়ে মুরগির কারি', 'curry_main'),
  ('বুটের ডাল দিয়ে মুরগির মাংস', 'curry_main'),
  ('ডাল দিয়ে মুরগি', 'curry_main'),
  ('চিকেন রোস্ট (১ পিস)', 'curry_main'),
  ('মুরগির মাংসের রোস্ট (১ পিস)', 'curry_main'),
  ('চিকেন কোরমা', 'curry_main'),
  ('চিকেন কোরমা উইথ পটেটো', 'curry_main'),
  ('চিকেন মাসালা', 'curry_main'),
  ('চিকেন চাওমিন', 'curry_main'),
  ('গরুর মাংসের কারি', 'curry_main'),
  ('মাটন রেজালা', 'curry_main'),
  ('খাসির মাংসের রেজালা (১ পিস)', 'curry_main'),
  ('ডিম ভুনা', 'curry_main'),
  ('এগ কারি', 'curry_main'),
  ('অর্ধেক ডিম দিয়ে আলুর তরকারি', 'curry_main'),
  ('আলুর দম', 'curry_main'),
  ('বিফ সিজলিং', 'curry_main'),
  ('বারবিকিউ চিকেন (২ পিস)', 'curry_main'),
  ('মুরগি ও মাশরুম দিয়ে চাইনিজ সবজি', 'curry_main'),

  -- Fish (মাছ)
  ('মাছের দোপেয়াজা', 'fish'),
  ('মাছ ভাজি', 'fish'),
  ('মাছ ভাজি (১ পিস)', 'fish'),
  ('মাছের কারি', 'fish'),
  ('ফিশ ফ্রাই', 'fish'),
  ('ফিশ ফ্রাই (চাইনিজ কাটিং)', 'fish'),
  ('সুইট এন্ড সাওয়ার ফিশ', 'fish'),
  ('লাইভ বারবিকিউ কোরাল মাছ (প্রতি ব্যক্তি ৩০০-৩৫০ গ্রাম)', 'fish'),

  -- Vorta & vaji (ভর্তা-ভাজি)
  ('২ ধরনের ভর্তা (আলু, ডিম)', 'vorta_vaji'),
  ('২ ধরনের ভর্তা (চিংড়ি, ডিমের)', 'vorta_vaji'),
  ('২ ধরনের ভর্তা (আলু, বেগুন)', 'vorta_vaji'),
  ('২ ধরনের ভর্তা (আলু, কাচা কলা)', 'vorta_vaji'),
  ('আলু ভর্তা', 'vorta_vaji'),
  ('টমেটো ভর্তা', 'vorta_vaji'),
  ('আনারস দিয়ে শরিষা ভর্তা', 'vorta_vaji'),
  ('বেগুন ভাজি', 'vorta_vaji'),
  ('আলু ভাজি', 'vorta_vaji'),

  -- Dal (ডাল)
  ('ডাল', 'dal'),
  ('ডাল চচ্চরি', 'dal'),
  ('বুটের ডাল', 'dal'),
  ('লাউ ডাল', 'dal'),
  ('মুগের ডাল', 'dal'),

  -- Vegetables (সবজি)
  ('মিক্সড সবজি', 'vegetable'),
  ('চাইনিজ সবজি', 'vegetable'),
  ('লাউ চিংড়ি', 'vegetable'),
  ('লাউ ডিম', 'vegetable'),
  ('চিংড়ি মাছ দিয়ে আলু', 'vegetable'),

  -- Snacks (নাস্তা)
  ('স্যান্ডউইচ', 'snack'),
  ('চিকেন স্যান্ডউইচ', 'snack'),
  ('চিকেন টোস্ট', 'snack'),
  ('সবজি পাকোড়া', 'snack'),
  ('সবজি পাকোড়া (২ পিস)', 'snack'),
  ('চিকেন ফ্রাই', 'snack'),
  ('ফ্রাইড চিকেন', 'snack'),
  ('ফ্রাইড চিকেন উইং (৬ পিস)', 'snack'),
  ('চিকেন জালি কাবাব', 'snack'),
  ('সিঙ্গারা (১ পিস)', 'snack'),
  ('পেয়াজু', 'snack'),
  ('বেগুনী', 'snack'),
  ('ফ্রেঞ্চ ফ্রাই', 'snack'),
  ('চাওমিন', 'snack'),
  ('টোস্ট বিস্কুট (১ পিস)', 'snack'),
  ('বিস্কুট (১ পিস)', 'snack'),

  -- Desserts & sweets (মিষ্টি)
  ('সুজির হালুয়া', 'dessert_sweet'),
  ('জর্দা', 'dessert_sweet'),
  ('সাদা মিস্টি', 'dessert_sweet'),
  ('কালো মিস্টি', 'dessert_sweet'),
  ('লাচ্চা সেমাই', 'dessert_sweet'),
  ('দুধ সেমাই', 'dessert_sweet'),
  ('জিলাপি', 'dessert_sweet'),
  ('রাবড়ি জিলাপি', 'dessert_sweet'),
  ('ক্রিম ক্যারামেল', 'dessert_sweet'),
  ('ফ্রুট কাস্টার্ড', 'dessert_sweet'),
  ('দই', 'dessert_sweet'),
  ('দই (বড় পাতিল)', 'dessert_sweet'),
  ('ফিরনি', 'dessert_sweet'),
  ('শাহী টুকরা', 'dessert_sweet'),
  ('পায়েস', 'dessert_sweet'),
  ('লাল জাম', 'dessert_sweet'),
  ('আলু বোখরা চাটনি', 'dessert_sweet'),
  ('তেঁতুল ও টমেটো চাটনি', 'dessert_sweet'),
  ('আমের আচার', 'dessert_sweet'),
  ('মিষ্টি আনারস', 'dessert_sweet'),
  ('কলা', 'dessert_sweet'),
  ('ফল (আম, কাঁঠাল)', 'dessert_sweet'),
  ('ফ্রুট বাস্কেট', 'dessert_sweet'),

  -- Salads (সালাদ)
  ('সালাদ: (কাটা পেয়াজ, টমেটো, শশা)', 'salad'),
  ('সালাদ: (কাটা পেয়াজ, টমেটো, পেয়ারা, শশা)', 'salad'),
  ('সালাদ: (কাটা পেয়াজ, আনারস, টমেটো, শশা)', 'salad'),
  ('সালাদ: (কাটা পেয়াজ, টমেটো, পেয়ারা, শশা, চায়না বাদাম)', 'salad'),
  ('সালাদ: (কাটা পেয়াজ, আনারস চাট, টমেটো, শশা, বাদাম)', 'salad'),
  ('ফ্রেস সালাদ', 'salad'),
  ('মিক্সড সালাদ', 'salad'),

  -- Drinks (পানীয়)
  ('ওয়েলকাম ড্রিংকস', 'drink'),
  ('চা (১ কাপ)', 'drink'),
  ('ট্যাংক', 'drink'),
  ('পানি', 'drink'),
  ('মিনারেল পানি', 'drink'),
  ('কোমল পানীয়', 'drink'),
  ('সফট ড্রিংকস', 'drink')
ON CONFLICT (name) DO UPDATE
  SET category = EXCLUDED.category
  WHERE menu_dish_catalog.category IS NULL;

-- Verify
SELECT category, COUNT(*) AS dishes FROM menu_dish_catalog GROUP BY category ORDER BY category;
