import { createClient } from '@/lib/supabase/server'
import { getHolidayDateStrings } from '@/lib/queries/settings'
import { hashGuestId } from '@/lib/data-export/csv'

const PAGE = 1000

/** One row per booking, AI-ready. Excludes draft/sent (configurable list at
 *  call site). PII sanitized: customer_name dropped, customer_phone hashed
 *  into a stable guest_id so the AI can group rows by guest without ever
 *  seeing the actual phone. */
export interface BookingExportRow {
  booking_number:              string
  guest_id:                    string
  // Timing
  created_at:                  string
  visit_date:                  string
  check_out_date:              string
  lead_time_days:              number       // visit_date − created_at (calendar days)
  nights:                      number       // 0 for daylong
  day_of_week:                 string       // Mon..Sun (of visit_date)
  is_friday:                   0 | 1
  is_holiday:                  0 | 1
  month_of_visit:              string       // YYYY-MM
  month_of_booking:            string       // YYYY-MM
  // Composition
  package_type:                string
  package_name:                string
  room_types:                  string       // comma-separated unique room types
  room_count:                  number
  adults:                      number
  children_paid:               number
  children_free:               number
  drivers:                     number
  extra_beds:                  number
  total_guests:                number
  // Money
  subtotal:                    number
  discount:                    number
  service_charge_pct:          number
  total:                       number
  advance_paid:                number
  checkout_charges_total:      number
  checkout_payments_total:     number
  checkout_discount:           number
  refund_amount:               number
  net_revenue:                 number       // what the resort actually earned (incl. retained advance on no-show)
  outstanding:                 number       // what's still owed (0 for terminal statuses)
  // Outcome
  status:                      string
  cancelled_at:                string       // ISO or ''
  days_before_visit_cancelled: number | ''  // visit_date − cancelled_at (positive = notice given)
  no_show_at:                  string       // ISO or ''
  source_module:               string
  sales_rep_name:              string
}

export interface ExpenseExportRow {
  expense_date:    string
  category_slug:   string
  category_group:  string
  payee_name:      string
  payee_type:      string
  amount:          number
  payment_method:  string
  source_module:   string
  reference:       string
  notes:           string
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function daysBetween(later: string, earlier: string): number {
  // Both args YYYY-MM-DD or ISO. Strip to date-only.
  const a = new Date(later.slice(0, 10) + 'T00:00:00Z').getTime()
  const b = new Date(earlier.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((a - b) / 86_400_000)
}

function ym(iso: string): string {
  return iso.slice(0, 7)  // YYYY-MM
}

/** Fetch bookings (paginated past the 1000-row cap) + all decorations needed
 *  for the CSV: booking_rooms for room composition, checkouts for actual
 *  collected revenue, user_profiles for sales rep names, history_log for
 *  cancellation timestamps (cancelled_at isn't a column), holidays for the
 *  is_holiday flag. */
export async function getBookingsForExport(params: {
  from: string                  // YYYY-MM-DD (filter by created_at >=)
  to:   string                  // YYYY-MM-DD (filter by created_at <)
  excludeStatuses?: string[]    // default ['draft','sent']
}): Promise<BookingExportRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const exclude = params.excludeStatuses ?? ['draft', 'sent']

  // 1. Paginate bookings
  const bookings: any[] = []  // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += PAGE) {
    let q = db.from('bookings')
      .select('id, booking_number, customer_phone, customer_name, package_type, package_snapshot, visit_date, check_out_date, nights, adults, children_paid, children_free, drivers, extra_beds, subtotal, discount, service_charge_pct, total, advance_paid, remaining, status, source_module, no_show_at, sales_employee_id, created_at, created_by')
      .gte('created_at', `${params.from}T00:00:00+06:00`)
      .lt('created_at', `${params.to}T23:59:59+06:00`)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    for (const status of exclude) q = q.neq('status', status)
    const { data, error } = await q
    if (error) throw new Error(`[export.bookings] ${error.message}`)
    bookings.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  if (bookings.length === 0) return []

  const bookingIds = bookings.map((b) => b.id)

  // 2. Decorations — all in parallel
  const [
    roomsRes,
    checkoutsRes,
    holidayDates,
    salesRepsRes,
    cancelHistoryRes,
  ] = await Promise.all([
    db.from('booking_rooms').select('booking_id, room_type, qty').in('booking_id', bookingIds),
    db.from('checkouts').select('booking_id, charges_total, payments_total, discount_amount, refund_amount, status').in('booking_id', bookingIds),
    getHolidayDateStrings(),
    db.from('employees').select('id, full_name'),
    // Cancellation timestamps live in history_log (status_changed → cancelled)
    db.from('history_log').select('entity_id, created_at, payload')
      .eq('entity_type', 'booking')
      .eq('event', 'status_changed')
      .in('entity_id', bookingIds),
  ])

  // 3. Build lookup maps
  const roomsByBooking = new Map<string, { types: Set<string>; count: number }>()
  for (const r of (roomsRes.data ?? []) as any[]) {
    const cur = roomsByBooking.get(r.booking_id) ?? { types: new Set<string>(), count: 0 }
    cur.types.add(r.room_type)
    cur.count += r.qty
    roomsByBooking.set(r.booking_id, cur)
  }

  const checkoutByBooking = new Map<string, any>()
  for (const c of (checkoutsRes.data ?? []) as any[]) checkoutByBooking.set(c.booking_id, c)

  const holidaySet = new Set<string>(holidayDates ?? [])

  const repNameById = new Map<string, string>()
  for (const u of (salesRepsRes.data ?? []) as any[]) repNameById.set(u.id, u.full_name)

  // For each booking, take the latest history event whose payload.to === 'cancelled'
  const cancelledAtByBooking = new Map<string, string>()
  for (const h of (cancelHistoryRes.data ?? []) as any[]) {
    if (h.payload?.to !== 'cancelled') continue
    const prev = cancelledAtByBooking.get(h.entity_id)
    if (!prev || h.created_at > prev) cancelledAtByBooking.set(h.entity_id, h.created_at)
  }

  // 4. Project rows
  const rows: BookingExportRow[] = []
  for (const b of bookings) {
    const rooms = roomsByBooking.get(b.id)
    const checkout = checkoutByBooking.get(b.id)
    const cancelledAt = cancelledAtByBooking.get(b.id) ?? ''
    const visit = b.visit_date as string
    const created = (b.created_at as string).slice(0, 10)
    const dow = DOW[new Date(visit + 'T00:00:00Z').getUTCDay()]

    const chargesTotal  = Number(checkout?.charges_total ?? 0)
    const paymentsTotal = Number(checkout?.payments_total ?? 0)
    const coDiscount    = Number(checkout?.discount_amount ?? 0)
    const refund        = Number(checkout?.refund_amount ?? 0)
    const advance       = Number(b.advance_paid ?? 0)
    const total         = Number(b.total ?? 0)

    // net_revenue mirrors the get_booking_stats RPC logic:
    //   - no_show: only the non-refundable advance counts
    //   - cancelled: nothing (advances refunded)
    //   - else: total + extra charges − discounts − refunds
    let netRevenue: number
    if (b.status === 'no_show')        netRevenue = advance
    else if (b.status === 'cancelled') netRevenue = 0
    else netRevenue = total + chargesTotal - coDiscount - refund

    const outstanding = ['cancelled', 'checked_out', 'no_show'].includes(b.status)
      ? 0
      : Math.max(0, total + chargesTotal - coDiscount - advance - paymentsTotal)

    rows.push({
      booking_number:              b.booking_number ?? '',
      guest_id:                    hashGuestId(b.customer_phone, b.customer_name),
      created_at:                  b.created_at ?? '',
      visit_date:                  visit ?? '',
      check_out_date:              b.check_out_date ?? '',
      lead_time_days:              daysBetween(visit, created),
      nights:                      Number(b.nights ?? 0),
      day_of_week:                 dow,
      is_friday:                   dow === 'Fri' ? 1 : 0,
      is_holiday:                  holidaySet.has(visit) ? 1 : 0,
      month_of_visit:              ym(visit ?? ''),
      month_of_booking:            ym(b.created_at ?? ''),
      package_type:                b.package_type ?? '',
      package_name:                b.package_snapshot?.name ?? b.package_snapshot?.title ?? '',
      room_types:                  rooms ? [...rooms.types].sort().join('|') : '',
      room_count:                  rooms?.count ?? 0,
      adults:                      Number(b.adults ?? 0),
      children_paid:               Number(b.children_paid ?? 0),
      children_free:               Number(b.children_free ?? 0),
      drivers:                     Number(b.drivers ?? 0),
      extra_beds:                  Number(b.extra_beds ?? 0),
      total_guests:                Number(b.adults ?? 0) + Number(b.children_paid ?? 0) + Number(b.children_free ?? 0) + Number(b.drivers ?? 0),
      subtotal:                    Number(b.subtotal ?? 0),
      discount:                    Number(b.discount ?? 0),
      service_charge_pct:          Number(b.service_charge_pct ?? 0),
      total,
      advance_paid:                advance,
      checkout_charges_total:      chargesTotal,
      checkout_payments_total:     paymentsTotal,
      checkout_discount:           coDiscount,
      refund_amount:               refund,
      net_revenue:                 Math.round(netRevenue * 100) / 100,
      outstanding:                 Math.round(outstanding * 100) / 100,
      status:                      b.status ?? '',
      cancelled_at:                cancelledAt,
      days_before_visit_cancelled: cancelledAt ? daysBetween(visit, cancelledAt) : '',
      no_show_at:                  b.no_show_at ?? '',
      source_module:               b.source_module ?? 'manual',
      sales_rep_name:              repNameById.get(b.sales_employee_id) ?? '',
    })
  }
  return rows
}

/** One row per expense — for P&L analysis. Paginated past 1000-row cap. */
export async function getExpensesForExport(params: {
  from: string  // YYYY-MM-DD (expense_date >=)
  to:   string  // YYYY-MM-DD (expense_date <=)
}): Promise<ExpenseExportRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const expenses: any[] = []  // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('expenses')
      .select('expense_date, amount, payment_method, source_module, reference_number, notes, category:expense_categories(slug, category_group), payee:expense_payees(name, payee_type)')
      .gte('expense_date', params.from)
      .lte('expense_date', params.to)
      .eq('is_draft', false)
      .order('expense_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[export.expenses] ${error.message}`)
    expenses.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  return expenses.map((e) => ({
    expense_date:   e.expense_date ?? '',
    category_slug:  e.category?.slug ?? '',
    category_group: e.category?.category_group ?? '',
    payee_name:     e.payee?.name ?? '',
    payee_type:     e.payee?.payee_type ?? '',
    amount:         Number(e.amount ?? 0),
    payment_method: e.payment_method ?? '',
    source_module:  e.source_module ?? 'manual',
    reference:      e.reference_number ?? '',
    notes:          e.notes ?? '',
  }))
}
