-- ─────────────────────────────────────────────────────────────────────────────
-- Coffee shop · 002 — stock tracking behind the counter
--
-- A Coffee Shop store joins the inventory module. Menu items (charge_items)
-- can link to a stock item; every completed sale then writes an inventory
-- ISSUE movement and deducts stock automatically — complimentary items
-- included, since they leave the shelf all the same. Receipts, counts and
-- variance (the leakage number) come from the existing inventory machinery.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. The store itself
INSERT INTO inv_stores (slug, display_name, description, display_order) VALUES
  ('coffee_shop', 'Coffee Shop Store', 'Bottled drinks, snacks, coffee supplies sold over the counter', 3)
ON CONFLICT (slug) DO NOTHING;

-- 2. Menu item → stock item link
ALTER TABLE charge_items
  ADD COLUMN IF NOT EXISTS inv_item_id UUID REFERENCES inv_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_charge_items_inv_item ON charge_items(inv_item_id);

-- 3. Sale → the stock movement it produced (for edit/void reversal)
ALTER TABLE coffee_shop_sales
  ADD COLUMN IF NOT EXISTS inv_movement_id UUID REFERENCES inv_movements(id) ON DELETE SET NULL;

-- 4. Expense category for coffee-shop stock purchases (receipts auto-post here)
INSERT INTO expense_categories (name, slug, category_group, requires_description, requires_payee, display_order)
VALUES ('Inventory — Coffee Shop', 'inventory_coffee_shop', 'beverages', false, false, 35)
ON CONFLICT (slug) DO NOTHING;
