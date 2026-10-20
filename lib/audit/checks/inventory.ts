import { daysBetween, finding, type Finding } from '../types'

export interface AuditItem {
  id: string; name: string; current_stock: number; reorder_point: number | null
  avg_purchase_price: number | null; allow_negative_stock: boolean; is_active: boolean
}
export interface AuditCountLine { count_number: string; count_id: string; count_date: string; item_name: string; system_qty: number; counted_qty: number; unit_value: number }
export interface AuditReceiptLine { item_id: string; item_name: string; movement_date: string; unit_price: number; supplier: string | null; movement_id: string }
export interface AuditRequisition { id: string; requisition_no: string; event_date: string; status: string; deliveries: number }
export interface AuditDelivery {
  id: string; delivery_no: string; delivery_date: string; status: string; requisition_id: string | null
  vendor: string | null; total_amount: number; supplier_memo_total: number | null; allocated: number
}
export interface AuditSale { sale_number: string; sale_date: string; subtotal: number; discount_amount: number; voided_at: string | null }

const taka = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`

/** A count is "off" beyond this share of the system quantity… */
export const VARIANCE_PCT = 0.1
/** …and only when the stock value at stake is at least this much. */
export const VARIANCE_MIN_VALUE = 500
/** Supplier price creep worth a look. */
export const PRICE_JUMP = 0.15

export function checkInventory(input: {
  items: AuditItem[]; countLines: AuditCountLine[]; receipts: AuditReceiptLine[]
  requisitions: AuditRequisition[]; deliveries: AuditDelivery[]; sales: AuditSale[]; today: string
}): Finding[] {
  const { items, countLines, receipts, requisitions, deliveries, sales, today } = input
  const active = items.filter((i) => i.is_active)
  const out: Array<Finding | null> = []

  out.push(finding({ id: 'inv-negative-stock', area: 'inventory', severity: 'high', title: 'Items showing negative stock (a receipt was missed or an issue entered twice)' },
    active.filter((i) => !i.allow_negative_stock && i.current_stock < 0).map((i) => ({ ref: i.name, detail: `stock ${i.current_stock}`, link: '/inventory/low-stock' }))))

  out.push(finding({ id: 'inv-below-reorder', area: 'inventory', severity: 'medium', title: 'Items at or below their reorder level' },
    active.filter((i) => (i.reorder_point ?? 0) > 0 && i.current_stock >= 0 && i.current_stock <= (i.reorder_point ?? 0))
      .map((i) => ({ ref: i.name, detail: `${i.current_stock} left (reorder at ${i.reorder_point})`, link: '/inventory/low-stock' }))))

  // Stock-count shortfalls: counted less than the system says — possible leakage.
  const short = countLines.filter((l) => {
    if (daysBetween(l.count_date, today) > 60 || l.system_qty <= 0) return false
    const diff = l.system_qty - l.counted_qty
    return diff / l.system_qty > VARIANCE_PCT && diff * l.unit_value >= VARIANCE_MIN_VALUE
  })
  out.push(finding({ id: 'inv-count-shortfall', area: 'inventory', severity: 'high', title: `Stock counts short by more than ${VARIANCE_PCT * 100}% — possible leakage (last 60 days)` },
    short.map((l) => ({ ref: l.item_name, detail: `${l.count_number}: counted ${l.counted_qty} of ${l.system_qty} (−${taka((l.system_qty - l.counted_qty) * l.unit_value)})`, link: `/inventory/counts/${l.count_id}` })),
    short.reduce((s, l) => s + (l.system_qty - l.counted_qty) * l.unit_value, 0)))

  // Price creep: the latest receipt vs the one before, per item.
  const byItem = new Map<string, AuditReceiptLine[]>()
  for (const r of [...receipts].sort((a, b) => a.movement_date.localeCompare(b.movement_date))) {
    if (r.unit_price > 0) byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), r])
  }
  const jumps: Array<{ cur: AuditReceiptLine; prev: AuditReceiptLine }> = []
  for (const list of byItem.values()) {
    if (list.length < 2) continue
    const cur = list[list.length - 1], prev = list[list.length - 2]
    if (daysBetween(cur.movement_date, today) <= 30 && cur.unit_price > prev.unit_price * (1 + PRICE_JUMP)) jumps.push({ cur, prev })
  }
  out.push(finding({ id: 'inv-price-jump', area: 'inventory', severity: 'medium', title: `Purchase price up more than ${PRICE_JUMP * 100}% since the last purchase (last 30 days)` },
    jumps.map(({ cur, prev }) => ({ ref: cur.item_name, detail: `${taka(prev.unit_price)} → ${taka(cur.unit_price)}${cur.supplier ? ` · ${cur.supplier}` : ''}`, link: `/inventory/movements/${cur.movement_id}` }))))

  // Kitchen: orders that passed their date with nothing delivered.
  out.push(finding({ id: 'kitchen-undelivered', area: 'inventory', severity: 'medium', title: 'Approved kitchen orders whose date passed with no delivery recorded' },
    requisitions.filter((r) => r.status === 'approved' && r.deliveries === 0 && r.event_date < today && daysBetween(r.event_date, today) <= 30)
      .map((r) => ({ ref: r.requisition_no, detail: `for ${r.event_date}`, link: `/kitchen/requisitions/${r.id}` }))))

  out.push(finding({ id: 'kitchen-delivery-no-order', area: 'inventory', severity: 'low', title: 'Kitchen deliveries without a matching order' },
    deliveries.filter((d) => d.status === 'confirmed' && !d.requisition_id && daysBetween(d.delivery_date, today) <= 60)
      .map((d) => ({ ref: d.delivery_no, detail: `${d.vendor ?? 'supplier'} · ${taka(d.total_amount)}`, link: `/kitchen/deliveries/${d.id}` }))))

  const memoOff = deliveries.filter((d) => d.status === 'confirmed' && d.supplier_memo_total != null && Math.abs(d.supplier_memo_total - d.total_amount) > 1)
  out.push(finding({ id: 'kitchen-memo-mismatch', area: 'inventory', severity: 'medium', title: 'Supplier memo total differs from what was received' },
    memoOff.map((d) => ({ ref: d.delivery_no, detail: `memo ${taka(d.supplier_memo_total!)} vs received ${taka(d.total_amount)}`, link: `/kitchen/deliveries/${d.id}` })),
    memoOff.reduce((s, d) => s + Math.abs((d.supplier_memo_total ?? 0) - d.total_amount), 0)))

  out.push(finding({ id: 'kitchen-draft-delivery', area: 'inventory', severity: 'low', title: 'Kitchen deliveries left as draft for more than 3 days' },
    deliveries.filter((d) => d.status === 'draft' && daysBetween(d.delivery_date, today) > 3)
      .map((d) => ({ ref: d.delivery_no, detail: `${d.delivery_date} · ${d.vendor ?? 'supplier'}`, link: `/kitchen/deliveries/${d.id}` }))))

  const unpaid = deliveries.filter((d) => d.status === 'confirmed' && d.total_amount - d.allocated > 1 && daysBetween(d.delivery_date, today) > 30)
  out.push(finding({ id: 'kitchen-unpaid-30', area: 'inventory', severity: 'medium', title: 'Supplier bills unpaid for more than 30 days' },
    unpaid.map((d) => ({ ref: d.delivery_no, detail: `${d.vendor ?? 'supplier'} · ${taka(d.total_amount - d.allocated)} open since ${d.delivery_date}`, link: '/kitchen/ledger' })),
    unpaid.reduce((s, d) => s + d.total_amount - d.allocated, 0)))

  // Coffee shop: voids and big discounts this week.
  const week = sales.filter((s) => daysBetween(s.sale_date, today) <= 7)
  const voids = week.filter((s) => s.voided_at)
  out.push(finding({ id: 'coffee-voids', area: 'inventory', severity: 'low', title: 'Coffee shop sales voided in the last 7 days' },
    voids.length >= 3 ? voids.map((s) => ({ ref: s.sale_number, detail: `${s.sale_date} · ${taka(s.subtotal)}`, link: '/coffee-shop' })) : [],
    voids.reduce((n, s) => n + s.subtotal, 0)))
  out.push(finding({ id: 'coffee-big-discount', area: 'inventory', severity: 'low', title: 'Coffee shop sales discounted by more than 30% (last 7 days)' },
    week.filter((s) => !s.voided_at && s.subtotal > 0 && s.discount_amount / s.subtotal > 0.3)
      .map((s) => ({ ref: s.sale_number, detail: `${Math.round((s.discount_amount / s.subtotal) * 100)}% off`, link: '/coffee-shop' }))))

  return out.filter((f): f is Finding => f !== null)
}
