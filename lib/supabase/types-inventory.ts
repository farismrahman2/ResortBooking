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

// ─── Movements (Phase 2) ──────────────────────────────────────────────────────

export type MovementType        = 'receipt' | 'issue' | 'transfer' | 'adjustment'
export type MovementStatus      = 'completed' | 'voided'
export type AdjustmentDirection = 'increase' | 'decrease'
export type AdjustmentReason    = 'breakage' | 'expired' | 'theft' | 'loss' | 'recount' | 'damage' | 'other'

export interface InvMovement {
  id:                   string
  movement_number:      string
  movement_type:        MovementType
  movement_date:        string
  store_id:             string
  transfer_to_store_id: string | null
  supplier_id:          string | null
  invoice_number:       string | null
  invoice_date:         string | null
  expense_id:           string | null
  adjustment_reason:    AdjustmentReason | null
  issued_to_department: string | null
  total_value:          number
  notes:                string | null
  status:               MovementStatus
  voided_at:            string | null
  voided_by:            string | null
  void_reason:          string | null
  created_by:           string | null
  created_at:           string
}

export interface InvMovementLine {
  id:                   string
  movement_id:          string
  item_id:              string
  quantity:             number
  unit_price:           number
  line_value:           number    // generated
  adjustment_direction: AdjustmentDirection | null
  notes:                string | null
  display_order:        number
}

/** A movement line joined with the item name/sku/unit for display. */
export interface InvMovementLineWithItem extends InvMovementLine {
  item: Pick<InvItem, 'name' | 'sku_code'> & { unit_abbr: string | null }
}

export interface InvMovementFull extends InvMovement {
  lines:    InvMovementLineWithItem[]
  store:    Pick<InvStore, 'slug' | 'display_name'> | null
  to_store: Pick<InvStore, 'slug' | 'display_name'> | null
  supplier: Pick<InvSupplier, 'id' | 'name'> | null
}

// ─── Counts (Phase 3) ─────────────────────────────────────────────────────────

export type CountStatus = 'in_progress' | 'finalized' | 'cancelled'

export interface InvCount {
  id:                     string
  count_number:           string
  store_id:               string
  category_id:            string | null
  count_date:             string
  status:                 CountStatus
  notes:                  string | null
  adjustment_movement_id: string | null
  created_by:             string | null
  created_at:             string
  finalized_at:           string | null
  finalized_by:           string | null
}

export interface InvCountLine {
  id:          string
  count_id:    string
  item_id:     string
  system_qty:  number
  counted_qty: number | null
  variance:    number   // generated
  notes:       string | null
  counted_at:  string | null
  counted_by:  string | null
}

export interface InvCountLineWithItem extends InvCountLine {
  item: Pick<InvItem, 'name' | 'sku_code'> & { unit_abbr: string | null }
}

export interface InvCountFull extends InvCount {
  lines: InvCountLineWithItem[]
  store: Pick<InvStore, 'slug' | 'display_name'> | null
}
