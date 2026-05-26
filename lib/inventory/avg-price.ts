/**
 * Quantity-weighted average purchase price over the most recent receipts.
 * Pure function — Phase 2 actions fetch the last N receipts for an item and
 * pass them here. Defaults to the last 5 receipts.
 */
export function computeAvgPurchasePrice(
  receipts: { qty: number; price: number }[],
  window = 5,
): number | null {
  const recent = receipts.slice(0, window).filter((r) => r.qty > 0)
  if (recent.length === 0) return null
  const totalQty   = recent.reduce((s, r) => s + r.qty, 0)
  const totalValue = recent.reduce((s, r) => s + r.qty * r.price, 0)
  if (totalQty === 0) return null
  return Math.round((totalValue / totalQty) * 100) / 100
}
