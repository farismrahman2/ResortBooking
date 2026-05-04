/**
 * Row types for the Coffee Shop POS module. Kept separate from
 * lib/supabase/types.ts so the core types file doesn't grow further.
 */

export type CoffeeShopSaleStatus  = 'completed' | 'voided'
export type CoffeeShopPaymentMethod = 'cash' | 'bkash' | 'nagad' | 'rocket' | 'card' | 'bank_transfer' | 'other'

export interface CoffeeShopSaleRow {
  id:              string
  sale_number:     string
  sale_date:       string                   // YYYY-MM-DD
  status:          CoffeeShopSaleStatus
  subtotal:        number
  comp_value:      number
  discount_type:   'percent' | 'fixed' | null
  discount_value:  number | null
  discount_amount: number
  discount_reason: string | null
  net_amount:      number
  customer_label:  string | null
  notes:           string | null
  created_by:      string | null
  created_at:      string
  updated_at:      string
  voided_at:       string | null
  voided_by:       string | null
  void_reason:     string | null
}

export interface CoffeeShopSaleItemRow {
  id:                 string
  sale_id:            string
  charge_item_id:     string | null
  category_id:        string
  description:        string
  quantity:           number
  unit_price:         number
  amount:             number          // generated
  is_complimentary:   boolean
  comp_authorized_by: string | null
  comp_reason:        string | null
  notes:              string | null
  display_order:      number
}

export interface CoffeeShopSalePaymentRow {
  id:            string
  sale_id:       string
  amount:        number
  method:        CoffeeShopPaymentMethod
  reference:     string | null
  display_order: number
}

export interface CoffeeShopSaleFull extends CoffeeShopSaleRow {
  items:    CoffeeShopSaleItemRow[]
  payments: CoffeeShopSalePaymentRow[]
}
