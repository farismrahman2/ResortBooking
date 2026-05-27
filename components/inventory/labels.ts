import type { InventoryItemType, UnitType } from '@/lib/supabase/types-inventory'

export const ITEM_TYPE_LABELS: Record<InventoryItemType, string> = {
  consumable:          'Consumable',
  operating_equipment: 'Operating Equipment',
}

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  weight: 'Weight',
  volume: 'Volume',
  count:  'Count',
  length: 'Length',
}

/** Format a stock quantity with its unit abbreviation, e.g. "12.5 kg". */
export function formatQty(qty: number, unitAbbr?: string | null): string {
  const n = Number(qty)
  const str = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
  return unitAbbr ? `${str} ${unitAbbr}` : str
}
