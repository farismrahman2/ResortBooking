/**
 * Row types for the Inventory module. Kept separate from
 * lib/supabase/types.ts so the core types file doesn't grow further.
 */

export type InventoryItemType = 'consumable' | 'operating_equipment'
export type UnitType          = 'weight' | 'volume' | 'count' | 'length'

export interface InvStore {
  id:            string
  slug:          string
  display_name:  string
  description:   string | null
  is_active:     boolean
  display_order: number
  created_at:    string
}

export interface InvCategory {
  id:            string
  store_id:      string
  slug:          string
  display_name:  string
  display_order: number
  is_active:     boolean
}

export interface InvUnit {
  id:            string
  slug:          string
  display_name:  string
  abbreviation:  string
  unit_type:     UnitType
  display_order: number
}

export interface InvSupplier {
  id:               string
  name:             string
  expense_payee_id: string | null
  contact_phone:    string | null
  contact_email:    string | null
  contact_address:  string | null
  notes:            string | null
  is_active:        boolean
  created_at:       string
  updated_at:       string
}

export interface InvItem {
  id:                   string
  sku_code:             string
  store_id:             string
  category_id:          string
  name:                 string
  description:          string | null
  unit_id:              string
  item_type:            InventoryItemType
  par_level:            number | null
  reorder_point:        number | null
  current_stock:        number
  last_purchase_price:  number | null
  avg_purchase_price:   number | null
  default_supplier_id:  string | null
  allow_negative_stock: boolean
  is_active:            boolean
  notes:                string | null
  created_at:           string
  updated_at:           string
  created_by:           string | null
}

/** Item joined with its unit, category, store, and supplier for display. */
export interface InvItemWithRefs extends InvItem {
  unit:     Pick<InvUnit, 'slug' | 'display_name' | 'abbreviation' | 'unit_type'> | null
  category: Pick<InvCategory, 'slug' | 'display_name'> | null
  store:    Pick<InvStore, 'slug' | 'display_name'> | null
  supplier: Pick<InvSupplier, 'id' | 'name'> | null
}

/** Item plus derived stock-status flags for low-stock surfacing. */
export interface InvItemWithStock extends InvItemWithRefs {
  isBelowReorder: boolean
  isBelowPar:     boolean
}
