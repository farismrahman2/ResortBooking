/**
 * Maps an inventory store to the expense category its receipts post into.
 * Kitchen groceries roll up under 'bazar' (the BD wet-market spend line);
 * housekeeping under 'materials'. The categories themselves are seeded in
 * migrations/inventory-module/001_create_movements.sql.
 *
 * Keep this a pure lookup so future stores (maintenance → 'maintenance',
 * bar → 'beverages', etc.) just add a line.
 */
export interface ExpenseCategoryMapping {
  categorySlug:  string   // expense_categories.slug to look up
  categoryGroup: string   // for reference / fallback creation
}

const STORE_TO_EXPENSE_CATEGORY: Record<string, ExpenseCategoryMapping> = {
  kitchen:      { categorySlug: 'inventory_kitchen',      categoryGroup: 'bazar' },
  housekeeping: { categorySlug: 'inventory_housekeeping', categoryGroup: 'materials' },
}

/** Fallback maps any unmapped store to the housekeeping/materials bucket. */
export function expenseCategoryForStore(storeSlug: string): ExpenseCategoryMapping {
  return STORE_TO_EXPENSE_CATEGORY[storeSlug] ?? { categorySlug: 'inventory_housekeeping', categoryGroup: 'materials' }
}
