import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { listKitchenVendors, getUnitLabels } from './kitchen'
import { getMealsForBookingOnDate } from '@/lib/engine/meals'
import type {
  DeliveryWithLines, DeliveryListRow, KitchenDelivery,
  PaymentWithAllocations, KitchenPayment, VendorLedgerRow,
} from '@/lib/supabase/types-kitchen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

// ─── Deliveries ─────────────────────────────────────────────────────────────

export const getDeliveryById = cache(async (id: string): Promise<DeliveryWithLines | null> => {
  const { data, error } = await db()
    .from('kitchen_deliveries')
    .select('*, lines:kitchen_delivery_lines(*)')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(`[kitchen.delivery] ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = ((data.lines ?? []) as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({
      ...l,
      qty_ordered:   l.qty_ordered === null ? null : Number(l.qty_ordered),
      qty_delivered: Number(l.qty_delivered),
      rejected_qty:  l.rejected_qty === null ? null : Number(l.rejected_qty),
      piece_count:   l.piece_count === null ? null : Number(l.piece_count),
      unit_price:    Number(l.unit_price),
      line_total:    Number(l.line_total),
    }))
  return {
    ...data,
    total_amount: Number(data.total_amount),
    supplier_memo_total: data.supplier_memo_total === null || data.supplier_memo_total === undefined
      ? null : Number(data.supplier_memo_total),
    lines,
  } as DeliveryWithLines
})

/**
 * Deliveries with what has been paid against each.
 *
 * `paid_amount` comes from the allocation rows rather than a column on the
 * delivery: a cheque can be recorded, cancelled and re-recorded, and a stored
 * running total drifts out of step the first time that happens. Summing the
 * allocations cannot drift, and there are never many of them per delivery.
 */
export async function listDeliveries(filters: {
  from?: string; to?: string; vendorId?: string; status?: string
  unpaidOnly?: boolean
} = {}): Promise<DeliveryListRow[]> {
  let q = db().from('kitchen_deliveries')
    .select('*, requisition:kitchen_requisitions(requisition_no), allocations:kitchen_payment_allocations(amount_allocated, payment:kitchen_vendor_payments(status))')
    .order('delivery_date', { ascending: false })
    // 200 rows, each with its allocations and their payments embedded, is a
    // lot of JSON for a list nobody scrolls past the first screen of.
    .order('created_at', { ascending: false })
    .limit(80)

  if (filters.status)   q = q.eq('status', filters.status)
  else                  q = q.neq('status', 'cancelled')
  if (filters.vendorId) q = q.eq('kitchen_vendor_id', filters.vendorId)
  if (filters.from)     q = q.gte('delivery_date', filters.from)
  if (filters.to)       q = q.lte('delivery_date', filters.to)

  const [{ data, error }, vendors] = await Promise.all([q, listKitchenVendors()])
  if (error) throw new Error(`[kitchen.deliveries] ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const vendorName = new Map(vendors.map((v) => [v.id, v.display_name]))
  const empIds = [...new Set(rows.map((r) => r.received_by_employee_id).filter(Boolean))] as string[]
  const { data: emps } = empIds.length
    ? await db().from('employees').select('id, full_name').in('id', empIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empName = new Map(((emps ?? []) as any[]).map((e) => [e.id, e.full_name]))

  const out = rows.map((r) => {
    const total = Number(r.total_amount ?? 0)
    // A cancelled payment settles nothing — its allocations must not count.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paid = ((r.allocations ?? []) as any[])
      .filter((a) => a.payment?.status !== 'cancelled')
      .reduce((n, a) => n + Number(a.amount_allocated ?? 0), 0)
    return {
      ...r,
      total_amount:   total,
      vendor_name:    vendorName.get(r.kitchen_vendor_id) ?? 'Unknown vendor',
      requisition_no: r.requisition?.requisition_no ?? null,
      receiver_name:  r.received_by_employee_id ? (empName.get(r.received_by_employee_id) ?? null) : null,
      paid_amount:    paid,
      outstanding:    Math.max(0, total - paid),
    }
  }) as DeliveryListRow[]

  // Only confirmed deliveries are debts; a draft hasn't been agreed yet.
  return filters.unpaidOnly
    ? out.filter((d) => d.status === 'confirmed' && d.outstanding > 0.009)
    : out
}

/**
 * Build the lines for a delivery against an approved requisition.
 *
 * Pre-fills the ordered quantity as the delivered quantity, because the
 * common case by a long way is "everything arrived". The storekeeper corrects
 * the exceptions rather than typing forty numbers that were already on the
 * sheet in their hand. Rates come from the item's standing rate.
 */
export async function buildDeliveryLinesFromRequisition(
  requisitionId: string, vendorId: string,
): Promise<Array<{
  requisition_line_id: string; item_id: string | null; item_name: string
  qty_ordered: number; qty_delivered: number
  piece_count: number | null; unit_id: string | null; unit_label: string | null
  unit_price: number
}>> {
  const [{ data: lines }, unitLabels] = await Promise.all([
    db().from('kitchen_requisition_lines')
      .select('id, item_id, item_name, qty, piece_count, unit_id, sort_order')
      .eq('requisition_id', requisitionId)
      .eq('kitchen_vendor_id', vendorId)
      .order('sort_order'),
    getUnitLabels(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (lines ?? []) as any[]
  if (rows.length === 0) return []

  const itemIds = [...new Set(rows.map((l) => l.item_id).filter(Boolean))] as string[]
  const { data: items } = itemIds.length
    ? await db().from('inv_items').select('id, default_unit_price').in('id', itemIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rate = new Map(((items ?? []) as any[]).map((i) => [i.id, Number(i.default_unit_price ?? 0)]))

  return rows.map((l) => ({
    requisition_line_id: l.id,
    item_id:      l.item_id ?? null,
    item_name:    l.item_name,
    qty_ordered:  Number(l.qty),
    qty_delivered: Number(l.qty),
    piece_count:  l.piece_count === null ? null : Number(l.piece_count),
    unit_id:      l.unit_id ?? null,
    unit_label:   l.unit_id ? (unitLabels[l.unit_id] ?? null) : null,
    unit_price:   l.item_id ? (rate.get(l.item_id) ?? 0) : 0,
  }))
}

/**
 * Approved requisitions that still have something undelivered.
 *
 * Vendor pairs already received are removed, not just the fully-received
 * requisitions: the beef supplier delivering doesn't mean the vegetable
 * supplier has. Without this the prompt at the top of the deliveries screen
 * accumulated every approved order ever raised, and a list that never clears
 * is a list nobody reads.
 */
export async function listRequisitionsAwaitingDelivery(vendorId?: string): Promise<Array<{
  id: string; requisition_no: string; event_date: string
  vendors: string[]
}>> {
  const { data } = await db()
    .from('kitchen_requisitions')
    .select('id, requisition_no, event_date, lines:kitchen_requisition_lines(kitchen_vendor_id)')
    .eq('status', 'approved')
    .order('event_date', { ascending: false })
    .limit(30)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  // A cancelled delivery doesn't count as received — the goods still haven't
  // arrived, and the prompt has to come back.
  const { data: done } = await db()
    .from('kitchen_deliveries')
    .select('requisition_id, kitchen_vendor_id')
    .in('requisition_id', rows.map((r) => r.id))
    .neq('status', 'cancelled')
  const received = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((done ?? []) as any[]).map((d) => `${d.requisition_id}:${d.kitchen_vendor_id}`),
  )

  return rows
    .map((r) => ({
      id: r.id, requisition_no: r.requisition_no, event_date: r.event_date,
      vendors: [...new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((r.lines ?? []) as any[]).map((l) => l.kitchen_vendor_id).filter(Boolean),
      )].filter((v) => !received.has(`${r.id}:${v}`)) as string[],
    }))
    .filter((r) => (vendorId ? r.vendors.includes(vendorId) : r.vendors.length > 0))
}

// ─── Payments ───────────────────────────────────────────────────────────────

export async function getPaymentById(id: string): Promise<PaymentWithAllocations | null> {
  const { data, error } = await db()
    .from('kitchen_vendor_payments')
    .select('*, allocations:kitchen_payment_allocations(*, delivery:kitchen_deliveries(delivery_no, delivery_date, total_amount))')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(`[kitchen.payment] ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allocations = ((data.allocations ?? []) as any[]).map((a) => ({
    id: a.id, payment_id: a.payment_id, delivery_id: a.delivery_id,
    amount_allocated: Number(a.amount_allocated),
    delivery_no:   a.delivery?.delivery_no ?? '—',
    delivery_date: a.delivery?.delivery_date ?? '',
    total_amount:  Number(a.delivery?.total_amount ?? 0),
  }))
  return { ...data, amount: Number(data.amount), allocations } as PaymentWithAllocations
}

export async function listPayments(filters: {
  from?: string; to?: string; vendorId?: string
} = {}): Promise<Array<KitchenPayment & { vendor_name: string; allocated: number }>> {
  let q = db().from('kitchen_vendor_payments')
    .select('*, allocations:kitchen_payment_allocations(amount_allocated)')
    .order('payment_date', { ascending: false })
    .limit(80)
  if (filters.vendorId) q = q.eq('kitchen_vendor_id', filters.vendorId)
  if (filters.from)     q = q.gte('payment_date', filters.from)
  if (filters.to)       q = q.lte('payment_date', filters.to)

  const [{ data, error }, vendors] = await Promise.all([q, listKitchenVendors()])
  if (error) throw new Error(`[kitchen.payments] ${error.message}`)
  const vendorName = new Map(vendors.map((v) => [v.id, v.display_name]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((p) => ({
    ...p,
    amount: Number(p.amount),
    vendor_name: vendorName.get(p.kitchen_vendor_id) ?? 'Unknown vendor',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allocated: ((p.allocations ?? []) as any[]).reduce((n, a) => n + Number(a.amount_allocated ?? 0), 0),
  }))
}

// ─── The ledger ─────────────────────────────────────────────────────────────

/**
 * What each supplier is owed.
 *
 * The question the whole billing half exists to answer, and the reason
 * payments allocate to deliveries rather than just accumulating: without the
 * join you can total what you bought and total what you paid, but you can
 * never say WHICH bills are still open — and "we've paid you 40,000 this
 * month" settles no argument about a particular delivery.
 *
 * Cancelled rows are excluded on both sides. Draft deliveries are excluded
 * too: nothing is owed until both parties agree the amount.
 */
export async function getVendorLedger(range?: { from?: string; to?: string }): Promise<VendorLedgerRow[]> {
  let dq = db().from('kitchen_deliveries')
    .select('kitchen_vendor_id, delivery_date, total_amount, allocations:kitchen_payment_allocations(amount_allocated, payment:kitchen_vendor_payments(status))')
    .eq('status', 'confirmed')
  let pq = db().from('kitchen_vendor_payments')
    .select('kitchen_vendor_id, payment_date, amount')
    .eq('status', 'recorded')
  if (range?.from) { dq = dq.gte('delivery_date', range.from); pq = pq.gte('payment_date', range.from) }
  if (range?.to)   { dq = dq.lte('delivery_date', range.to);   pq = pq.lte('payment_date', range.to) }

  const [vendors, { data: dels }, { data: pays }] = await Promise.all([
    listKitchenVendors(), dq, pq,
  ])

  const acc = new Map<string, { delivered: number; paid: number; open: number
    lastD: string | null; lastP: string | null }>()
  const slot = (id: string) => {
    const cur = acc.get(id) ?? { delivered: 0, paid: 0, open: 0, lastD: null, lastP: null }
    acc.set(id, cur)
    return cur
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of ((dels ?? []) as any[])) {
    const s = slot(d.kitchen_vendor_id)
    const total = Number(d.total_amount ?? 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allocated = ((d.allocations ?? []) as any[])
      .filter((a) => a.payment?.status !== 'cancelled')
      .reduce((n, a) => n + Number(a.amount_allocated ?? 0), 0)
    s.delivered += total
    if (total - allocated > 0.009) s.open += 1
    if (!s.lastD || d.delivery_date > s.lastD) s.lastD = d.delivery_date
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((pays ?? []) as any[])) {
    const s = slot(p.kitchen_vendor_id)
    s.paid += Number(p.amount ?? 0)
    if (!s.lastP || p.payment_date > s.lastP) s.lastP = p.payment_date
  }

  return vendors.map((v) => {
    const s = acc.get(v.id) ?? { delivered: 0, paid: 0, open: 0, lastD: null, lastP: null }
    return {
      vendor: v,
      delivered: s.delivered,
      paid: s.paid,
      // Can go negative — an advance. Showing it rather than clamping to zero
      // is the point: money paid ahead of delivery is worth knowing about.
      outstanding: s.delivered - s.paid,
      open_bills: s.open,
      last_delivery_date: s.lastD,
      last_payment_date:  s.lastP,
    }
  })
}

/** Delivery totals for a period, for cost-per-cover and spend reporting. */
export async function getDeliverySpend(from: string, to: string): Promise<{
  total: number
  byVendor: Record<string, number>
  byDate:   Record<string, number>
}> {
  const { data } = await db().from('kitchen_deliveries')
    .select('kitchen_vendor_id, delivery_date, total_amount')
    .eq('status', 'confirmed')
    .gte('delivery_date', from).lte('delivery_date', to)
  const byVendor: Record<string, number> = {}
  const byDate:   Record<string, number> = {}
  let total = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of ((data ?? []) as any[])) {
    const amt = Number(d.total_amount ?? 0)
    total += amt
    byVendor[d.kitchen_vendor_id] = (byVendor[d.kitchen_vendor_id] ?? 0) + amt
    byDate[d.delivery_date]       = (byDate[d.delivery_date] ?? 0) + amt
  }
  return { total, byVendor, byDate }
}

export type { KitchenDelivery }

/**
 * Covers per day across a range, in ONE query.
 *
 * The ledger previously called getDayMealHeadcounts once per day — thirty
 * round trips for a thirty-day window, each pulling every booking on or before
 * that date with no lower bound. That single loop was most of why the page
 * took seconds to appear.
 *
 * Same meal engine, so the numbers still agree with the menus module and the
 * daily report; the difference is that the bookings are fetched once, bounded
 * to those that actually overlap the window, and the days are walked in memory.
 *
 * A cover is one person at one main meal, and the day's figure is its busiest
 * sitting — which is how the kitchen itself counts.
 */
export async function getCoversInRange(from: string, to: string): Promise<{
  total: number
  byDate: Record<string, number>
}> {
  const { data, error } = await db()
    .from('bookings')
    .select('package_type, visit_date, check_out_date, adults, children_paid, children_free, drivers, package_snapshot')
    .neq('status', 'cancelled')
    .neq('status', 'no_show')
    // Overlap, not "everything up to `to`": a booking that checked out before
    // the window started contributes nothing and should not be fetched.
    .lte('visit_date', to)
    .or(`check_out_date.gte.${from},check_out_date.is.null`)
  if (error) return { total: 0, byDate: {} }

  const days: string[] = []
  for (const d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }

  const byDate: Record<string, number> = {}
  for (const day of days) {
    let breakfast = 0, lunch = 0, dinner = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of ((data ?? []) as any[])) {
      const snap = b.package_snapshot ?? {}
      const meals = getMealsForBookingOnDate({
        package_type:       b.package_type,
        visit_date:         b.visit_date,
        check_out_date:     b.check_out_date,
        adults:             b.adults ?? 0,
        children_paid:      b.children_paid ?? 0,
        children_free:      b.children_free ?? 0,
        includes_breakfast: snap.includes_breakfast,
        includes_lunch:     snap.includes_lunch,
        includes_dinner:    snap.includes_dinner,
        includes_snacks:    snap.includes_snacks,
      }, day)
      // Drivers ride along with whichever meals their booking participates in.
      const drivers = Number(b.drivers ?? 0)
      if (meals.breakfast > 0) breakfast += meals.breakfast + drivers
      if (meals.lunch     > 0) lunch     += meals.lunch + drivers
      if (meals.dinner    > 0) dinner    += meals.dinner + drivers
    }
    byDate[day] = Math.max(breakfast, lunch, dinner)
  }

  return { total: Object.values(byDate).reduce((n, v) => n + v, 0), byDate }
}

/**
 * What has been paid against ONE delivery.
 *
 * The detail page used to call listDeliveries and scan the result for its own
 * row — up to 200 deliveries, each with its allocations and their payments
 * embedded, to produce two numbers about a single record. This is the same
 * arithmetic over the only rows that matter.
 */
export async function getDeliveryPaid(deliveryId: string): Promise<number> {
  const { data, error } = await db()
    .from('kitchen_payment_allocations')
    .select('amount_allocated, payment:kitchen_vendor_payments(status)')
    .eq('delivery_id', deliveryId)
  if (error) return 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((a) => a.payment?.status !== 'cancelled')
    .reduce((n, a) => n + Number(a.amount_allocated ?? 0), 0)
}
