import { createServiceClient } from '@/lib/supabase/server'
import { addDaysIso } from '@/lib/dates'
import { checkBookings, type AuditBooking, type AuditQuote, type AuditPackagePrice } from './checks/bookings'
import { checkExpenses, type AuditExpense, type AuditBudget, type AuditTemplate } from './checks/expenses'
import { checkInventory, type AuditItem, type AuditCountLine, type AuditReceiptLine, type AuditRequisition, type AuditDelivery, type AuditSale } from './checks/inventory'
import type { Finding } from './types'

/**
 * Reads what the checks need with the service-role client — the cron has no
 * signed-in user — and runs them. Read-only.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** PostgREST caps a response at 1000 rows. */
async function all<T>(build: () => Db): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build().range(offset, offset + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) return out
  }
}

const num = (v: unknown) => Number(v ?? 0)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countOf = (v: any) => num(Array.isArray(v) ? v[0]?.count : v?.count)

async function bookingInputs(db: Db, today: string) {
  const since = addDaysIso(today, -180)
  const cols = `id, booking_number, customer_name, customer_phone, package_type, visit_date, check_out_date, status,
                subtotal, discount, total, advance_paid, remaining, line_items, created_at,
                booking_rooms (room_type, qty, room_numbers, evening_rooms)`
  const [recent, oldOpen, quotes, prices] = await Promise.all([
    all<Db>(() => db.from('bookings').select(cols).gte('visit_date', since).order('visit_date')),
    all<Db>(() => db.from('bookings').select(cols).lt('visit_date', since).eq('status', 'confirmed').order('visit_date')),
    all<Db>(() => db.from('quotes').select('id, quote_number, customer_name, visit_date, status, converted_to_booking_id')
      .gte('visit_date', addDaysIso(today, -60)).eq('status', 'confirmed')),
    all<Db>(() => db.from('package_room_prices').select('package_id, room_type, price, packages!inner (name, type, is_active)').eq('packages.is_active', true)),
  ])
  const bookings: AuditBooking[] = [...recent, ...oldOpen].map((b) => ({
    id: b.id, booking_number: b.booking_number, customer_name: b.customer_name ?? '', customer_phone: b.customer_phone,
    package_type: b.package_type, visit_date: b.visit_date, check_out_date: b.check_out_date, status: b.status,
    subtotal: num(b.subtotal), discount: num(b.discount), total: num(b.total), advance_paid: num(b.advance_paid), remaining: num(b.remaining),
    line_items: Array.isArray(b.line_items) ? b.line_items : null, created_at: b.created_at,
    rooms: (b.booking_rooms ?? []).map((r: Db) => ({ room_type: r.room_type, qty: num(r.qty), room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [] })),
  }))
  const pkgPrices: AuditPackagePrice[] = prices.map((p) => {
    const pkg = one(p.packages)
    return { package_id: p.package_id, package_name: pkg?.name ?? 'Package', package_type: pkg?.type ?? '', room_type: p.room_type, price: num(p.price) }
  })
  return { bookings, quotes: quotes as AuditQuote[], prices: pkgPrices }
}

async function expenseInputs(db: Db, today: string) {
  const [rows, drafts, budgets, templates] = await Promise.all([
    all<Db>(() => db.from('expenses')
      .select('id, expense_date, amount, payment_method, category_id, payee_id, description, is_draft, created_at, expense_categories (name), expense_payees (name), expense_attachments (count)')
      .gte('expense_date', addDaysIso(today, -90)).eq('is_draft', false)),
    all<Db>(() => db.from('expenses')
      .select('id, expense_date, amount, payment_method, category_id, payee_id, description, is_draft, created_at, expense_categories (name), expense_payees (name), expense_attachments (count)')
      .eq('is_draft', true)),
    all<Db>(() => db.from('expense_budgets').select('category_id, period_type, period_start, amount, expense_categories (name)')
      .eq('period_type', 'monthly').lte('period_start', today).order('period_start', { ascending: false })),
    all<Db>(() => db.from('recurring_expense_templates').select('id, name, day_of_month, is_active, last_generated_for')),
  ])
  const expenses: AuditExpense[] = [...rows, ...drafts].map((e) => ({
    id: e.id, expense_date: e.expense_date, amount: num(e.amount), payment_method: e.payment_method,
    category_id: e.category_id, category_name: one(e.expense_categories)?.name ?? null,
    payee_id: e.payee_id, payee_name: one(e.expense_payees)?.name ?? null,
    description: e.description, is_draft: !!e.is_draft, created_at: e.created_at, attachments: countOf(e.expense_attachments),
  }))
  // The latest monthly budget per category applies.
  const latest = new Map<string, AuditBudget>()
  for (const b of budgets) if (!latest.has(b.category_id)) {
    latest.set(b.category_id, { category_id: b.category_id, category_name: one(b.expense_categories)?.name ?? 'Category', amount: num(b.amount) })
  }
  return { expenses, budgets: [...latest.values()], templates: templates as AuditTemplate[] }
}

async function inventoryInputs(db: Db, today: string) {
  const [items, counts, receipts, reqs, deliveries, sales] = await Promise.all([
    all<Db>(() => db.from('inv_items').select('id, name, current_stock, reorder_point, avg_purchase_price, allow_negative_stock, is_active')),
    all<Db>(() => db.from('inv_count_lines')
      .select('system_qty, counted_qty, inv_counts!inner (id, count_number, count_date, finalized_at), inv_items (name, avg_purchase_price)')
      .gte('inv_counts.count_date', addDaysIso(today, -60)).not('inv_counts.finalized_at', 'is', null)),
    all<Db>(() => db.from('inv_movement_lines')
      .select('item_id, unit_price, inv_items (name), inv_movements!inner (id, movement_date, movement_type, status, inv_suppliers (name))')
      .eq('inv_movements.movement_type', 'receipt').eq('inv_movements.status', 'completed')
      .gte('inv_movements.movement_date', addDaysIso(today, -180))),
    all<Db>(() => db.from('kitchen_requisitions').select('id, requisition_no, event_date, status, kitchen_deliveries (count)')
      .gte('event_date', addDaysIso(today, -30))),
    all<Db>(() => db.from('kitchen_deliveries')
      .select('id, delivery_no, delivery_date, status, requisition_id, total_amount, supplier_memo_total, kitchen_vendors (display_name), inv_suppliers (name), kitchen_payment_allocations (amount_allocated)')
      .gte('delivery_date', addDaysIso(today, -365))),
    all<Db>(() => db.from('coffee_shop_sales').select('sale_number, sale_date, subtotal, discount_amount, voided_at')
      .gte('sale_date', addDaysIso(today, -7))),
  ])
  const countLines: AuditCountLine[] = counts.map((l) => {
    const c = one(l.inv_counts), it = one(l.inv_items)
    return { count_number: c?.count_number ?? '', count_id: c?.id ?? '', count_date: c?.count_date ?? today, item_name: it?.name ?? 'Item',
      system_qty: num(l.system_qty), counted_qty: num(l.counted_qty), unit_value: num(it?.avg_purchase_price) }
  })
  const receiptLines: AuditReceiptLine[] = receipts.map((r) => {
    const m = one(r.inv_movements)
    return { item_id: r.item_id, item_name: one(r.inv_items)?.name ?? 'Item', movement_date: m?.movement_date ?? today,
      unit_price: num(r.unit_price), supplier: one(m?.inv_suppliers)?.name ?? null, movement_id: m?.id ?? '' }
  })
  const auditDeliveries: AuditDelivery[] = deliveries.map((d) => ({
    id: d.id, delivery_no: d.delivery_no, delivery_date: d.delivery_date, status: d.status, requisition_id: d.requisition_id,
    vendor: one(d.inv_suppliers)?.name ?? one(d.kitchen_vendors)?.display_name ?? null,
    total_amount: num(d.total_amount), supplier_memo_total: d.supplier_memo_total == null ? null : num(d.supplier_memo_total),
    allocated: (d.kitchen_payment_allocations ?? []).reduce((s: number, a: Db) => s + num(a.amount_allocated), 0),
  }))
  return {
    items: items.map((i) => ({ ...i, current_stock: num(i.current_stock), reorder_point: i.reorder_point == null ? null : num(i.reorder_point),
      avg_purchase_price: i.avg_purchase_price == null ? null : num(i.avg_purchase_price) })) as AuditItem[],
    countLines, receipts: receiptLines,
    requisitions: reqs.map((r) => ({ id: r.id, requisition_no: r.requisition_no, event_date: r.event_date, status: r.status, deliveries: countOf(r.kitchen_deliveries) })) as AuditRequisition[],
    deliveries: auditDeliveries,
    sales: sales.map((s) => ({ ...s, subtotal: num(s.subtotal), discount_amount: num(s.discount_amount) })) as AuditSale[],
  }
}

/** Runs every rule check for `today` (Dhaka date). An area whose data can't
 *  be read reports that, instead of failing the whole run. */
export async function runChecks(today: string): Promise<{ findings: Finding[]; errors: string[] }> {
  const db = createServiceClient()
  const errors: string[] = []
  const safe = async (area: string, f: () => Promise<Finding[]>) => {
    try { return await f() } catch (e) { errors.push(`${area}: ${e instanceof Error ? e.message : String(e)}`); return [] }
  }
  const groups = await Promise.all([
    safe('bookings',  async () => checkBookings({ ...(await bookingInputs(db, today)), today })),
    safe('expenses',  async () => checkExpenses({ ...(await expenseInputs(db, today)), today })),
    safe('inventory', async () => checkInventory({ ...(await inventoryInputs(db, today)), today })),
  ])
  const rank = { high: 0, medium: 1, low: 2 } as const
  return { findings: groups.flat().sort((a, b) => rank[a.severity] - rank[b.severity]), errors }
}
