import { createServiceClient } from '@/lib/supabase/server'
import { bookingRevenue, occupiesRoom } from '@/lib/reports/booking-revenue'
import { todayDhaka } from '@/lib/dates'
import { isComposite } from '@/lib/config/rooms'

/**
 * One JSON pack with everything needed to reason about the business —
 * built to be copied into an AI chat and discussed.
 *
 * Two shapes on purpose:
 *   summary — the aggregates only, a few dozen KB, quick to paste.
 *   full    — the same aggregates plus every booking and every expense as
 *             columns + rows (not objects): repeating 18 key names across a
 *             thousand bookings would roughly double the size for nothing.
 *
 * Money is BDT, dates are Asia/Dhaka calendar dates. Revenue follows the
 * house rule in lib/reports/booking-revenue: a no-show contributes only the
 * non-refundable advance, a cancellation nothing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any

export type ExportDetail = 'summary' | 'full'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const weekdayOf = (iso: string) => DOW[new Date(iso + 'T12:00:00Z').getUTCDay()]
const monthOf   = (iso: string) => iso.slice(0, 7)
const round     = (n: number) => Math.round(n * 100) / 100
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400_000)

/** An optional slice of context — a module the resort may not use yet must
 *  not take the whole export down with it. */
async function soft<T>(p: PromiseLike<{ data: T | null }>): Promise<T[]> {
  try {
    const { data } = await p
    return (data ?? []) as unknown as T[]
  } catch {
    return []
  }
}

/** PostgREST caps a response at 1000 rows; all-time exports run past that. */
async function fetchAll<T>(build: () => any): Promise<T[]> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = []
  const size = 1000
  for (let offset = 0; ; offset += size) {
    const { data, error } = await build().range(offset, offset + size - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length < size) return out
  }
}

interface Bucket { n: number; guests: number; revenue: number; discount: number; units: number }
const emptyBucket = (): Bucket => ({ n: 0, guests: 0, revenue: 0, discount: 0, units: 0 })

function bucketOut(b: Bucket) {
  return {
    bookings:            b.n,
    guests:              b.guests,
    revenue:             round(b.revenue),
    discount_given:      round(b.discount),
    room_units_sold:     b.units,
    avg_revenue_per_booking: b.n ? round(b.revenue / b.n) : 0,
    avg_party_size:          b.n ? round(b.guests / b.n) : 0,
  }
}

export interface BusinessContextOptions {
  from:   string
  to:     string
  detail: ExportDetail
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildBusinessContext(opts: BusinessContextOptions): Promise<Record<string, any>> {
  const { from, to, detail } = opts

  const [bookingRows, expenseRows, inv, pkgs, pkgPrices, holidayRows, settingsRows, coffeeRows, charges] =
    await Promise.all([
      fetchAll<any>(() => db().from('bookings')  // eslint-disable-line @typescript-eslint/no-explicit-any
        .select(`booking_number, package_type, visit_date, check_out_date, nights, adults,
                 children_paid, children_free, drivers, extra_beds, subtotal, discount, discount_pct,
                 service_charge_pct, total, advance_paid, status, is_corporate, company_name,
                 customer_phone, source_module, created_at, package_snapshot, extra_items,
                 booking_rooms (room_type, qty, unit_price)`)
        .gte('visit_date', from).lte('visit_date', to)
        .order('visit_date', { ascending: true })),
      fetchAll<any>(() => db().from('expenses')  // eslint-disable-line @typescript-eslint/no-explicit-any
        .select(`expense_date, amount, description, payment_method, is_draft,
                 category:expense_categories (name, category_group),
                 payee:expense_payees (name, payee_type)`)
        .gte('expense_date', from).lte('expense_date', to)
        .eq('is_draft', false)
        .order('expense_date', { ascending: true })),
      soft<any>(db().from('room_inventory').select('*').order('display_order')),         // eslint-disable-line @typescript-eslint/no-explicit-any
      soft<any>(db().from('packages').select('*').order('display_order')),                // eslint-disable-line @typescript-eslint/no-explicit-any
      soft<any>(db().from('package_room_prices').select('*')),                            // eslint-disable-line @typescript-eslint/no-explicit-any
      soft<any>(db().from('holiday_dates').select('date').gte('date', from).lte('date', to)),  // eslint-disable-line @typescript-eslint/no-explicit-any
      soft<any>(db().from('settings').select('key, value')),                              // eslint-disable-line @typescript-eslint/no-explicit-any
      soft<any>(db().from('coffee_shop_sales').select('sale_date, net_amount, status')    // eslint-disable-line @typescript-eslint/no-explicit-any
        .gte('sale_date', from).lte('sale_date', to)),
      soft<any>(db().from('checkout_charges').select('amount')),                          // eslint-disable-line @typescript-eslint/no-explicit-any
    ])

  const settings   = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
  // A composite (the villa) stands on rooms already counted.
  const totalUnits = inv.filter((r) => !isComposite(r.room_type)).reduce((s, r) => s + Number(r.total_units ?? 0), 0)
  const holidaySet = new Set(holidayRows.map((h) => h.date))

  // ── Per-booking facts ─────────────────────────────────────────────────────
  const facts = bookingRows.map((b) => {
    const rooms   = (b.booking_rooms ?? []) as Array<{ room_type: string; qty: number; unit_price: number }>
    const units   = rooms.reduce((s, r) => s + Number(r.qty ?? 0), 0)
    const guests  = Number(b.adults ?? 0) + Number(b.children_paid ?? 0) + Number(b.children_free ?? 0)
    const bookedOn = String(b.created_at ?? '').slice(0, 10)
    const extras  = ((b.extra_items ?? []) as Array<{ qty: number; unit_price: number }>)
      .reduce((s, x) => s + Number(x.qty ?? 0) * Number(x.unit_price ?? 0), 0)
    return {
      ref:        b.booking_number as string,
      date:       b.visit_date as string,
      weekday:    weekdayOf(b.visit_date),
      month:      monthOf(b.visit_date),
      holiday:    holidaySet.has(b.visit_date),
      type:       b.package_type as string,
      package:    String(b.package_snapshot?.name ?? '').trim() || null,
      status:     b.status as string,
      nights:     b.nights ?? null,
      adults:     Number(b.adults ?? 0),
      children:   Number(b.children_paid ?? 0) + Number(b.children_free ?? 0),
      drivers:    Number(b.drivers ?? 0),
      guests,
      rooms:      rooms.map((r) => `${r.room_type}x${r.qty}`).join(' ') || null,
      room_units: units,
      subtotal:   Number(b.subtotal ?? 0),
      discount:   Number(b.discount ?? 0),
      discount_pct: Number(b.discount_pct ?? 0),
      extras,
      total:      Number(b.total ?? 0),
      revenue:    bookingRevenue(b),
      advance_paid: Number(b.advance_paid ?? 0),
      corporate:  Boolean(b.is_corporate),
      company:    b.is_corporate ? (b.company_name ?? null) : null,
      source:     b.source_module ?? null,
      booked_on:  bookedOn || null,
      lead_days:  bookedOn ? Math.max(0, daysBetween(bookedOn, b.visit_date)) : null,
      phone:      b.customer_phone ?? null,
      occupies:   occupiesRoom(b.status),
    }
  })

  const earning = facts.filter((f) => f.revenue > 0 || f.occupies)

  // ── Slices ────────────────────────────────────────────────────────────────
  function group<K extends string>(keyOf: (f: typeof facts[number]) => K | null) {
    const m = new Map<K, Bucket>()
    for (const f of earning) {
      const k = keyOf(f)
      if (k === null) continue
      const b = m.get(k) ?? emptyBucket()
      b.n += 1
      b.guests += f.guests
      b.revenue += f.revenue
      b.discount += f.discount
      b.units += f.room_units
      m.set(k, b)
    }
    return m
  }

  const byMonth   = group((f) => f.month)
  const byWeekday = group((f) => f.weekday)
  const byType    = group((f) => f.type)
  const byPackage = group((f) => f.package)

  // Room-nights sold per calendar date, so weekday demand is measurable
  // against capacity rather than guessed from booking counts.
  const soldByDate = new Map<string, number>()
  for (const f of facts) {
    if (!f.occupies || f.room_units === 0) continue
    if (f.type === 'night' && f.date && f.nights) {
      for (let i = 0; i < Number(f.nights); i++) {
        const d = new Date(Date.parse(f.date + 'T12:00:00Z') + i * 86400_000).toISOString().slice(0, 10)
        soldByDate.set(d, (soldByDate.get(d) ?? 0) + f.room_units)
      }
    } else {
      soldByDate.set(f.date, (soldByDate.get(f.date) ?? 0) + f.room_units)
    }
  }
  const occByWeekday = new Map<string, { days: Set<string>; units: number }>()
  for (const [date, units] of soldByDate) {
    const w = weekdayOf(date)
    const cur = occByWeekday.get(w) ?? { days: new Set<string>(), units: 0 }
    cur.days.add(date)
    cur.units += units
    occByWeekday.set(w, cur)
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  const expenses = expenseRows.map((e) => ({
    date:     e.expense_date as string,
    month:    monthOf(e.expense_date),
    amount:   Number(e.amount ?? 0),
    category: e.category?.name ?? null,
    group:    e.category?.category_group ?? null,
    payee:    e.payee?.name ?? null,
    method:   e.payment_method ?? null,
    note:     (e.description ?? '').slice(0, 120) || null,
  }))
  const expenseTotal = round(expenses.reduce((s, e) => s + e.amount, 0))

  function sumBy<T>(rows: T[], keyOf: (r: T) => string | null, amountOf: (r: T) => number) {
    const m = new Map<string, { total: number; count: number }>()
    for (const r of rows) {
      const k = keyOf(r)
      if (k === null) continue
      const cur = m.get(k) ?? { total: 0, count: 0 }
      cur.total += amountOf(r)
      cur.count += 1
      m.set(k, cur)
    }
    return [...m.entries()]
      .map(([key, v]) => ({ key, total: round(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total)
  }

  const expByMonth    = sumBy(expenses, (e) => e.month,    (e) => e.amount)
  const expByCategory = sumBy(expenses, (e) => e.category, (e) => e.amount)
  const expByGroup    = sumBy(expenses, (e) => e.group,    (e) => e.amount)
  const expByPayee    = sumBy(expenses, (e) => e.payee,    (e) => e.amount).slice(0, 25)

  // ── Repeat guests, discounting, lead time ─────────────────────────────────
  const byPhone = new Map<string, number>()
  for (const f of earning) if (f.phone) byPhone.set(f.phone, (byPhone.get(f.phone) ?? 0) + 1)
  const repeatGuests = [...byPhone.values()].filter((n) => n > 1).length

  const discounted = earning.filter((f) => f.discount > 0)
  const leadDays   = earning.map((f) => f.lead_days).filter((n): n is number => n !== null)
  const leadBucket = (d: number) =>
    d === 0 ? 'same day' : d <= 2 ? '1-2 days' : d <= 7 ? '3-7 days' : d <= 14 ? '8-14 days' : d <= 30 ? '15-30 days' : '30+ days'
  const partyBucket = (g: number) =>
    g <= 2 ? '1-2' : g <= 4 ? '3-4' : g <= 10 ? '5-10' : g <= 25 ? '11-25' : g <= 50 ? '26-50' : '50+'

  const countBy = (keys: string[]) => {
    const m = new Map<string, number>()
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
    return Object.fromEntries(m)
  }

  const coffee = coffeeRows.filter((s) => s.status !== 'void')

  const monthRows = [...byMonth.keys()].sort().map((m) => {
    const rev = byMonth.get(m)!
    const exp = expByMonth.find((e) => e.key === m)?.total ?? 0
    return {
      month: m,
      ...bucketOut(rev),
      expenses: exp,
      net:      round(rev.revenue - exp),
    }
  })

  const pack: Record<string, any> = {  // eslint-disable-line @typescript-eslint/no-explicit-any
    meta: {
      business:   settings['resort_name'] ?? 'Garden Centre Resort',
      location:   settings['resort_address'] ?? 'Kaliganj, Gazipur, Bangladesh',
      currency:   'BDT',
      timezone:   'Asia/Dhaka',
      generated_on: todayDhaka(),
      covers:     { from, to },
      detail,
      how_to_read: [
        'A resort selling two products: DAYLONG day visits (09:00-18:00) and NIGHT stays. GROUP is a multi-day itinerary billed as one booking.',
        'Revenue counts confirmed and checked-out bookings at their total; a no-show counts only its non-refundable advance; cancellations count zero.',
        'Weekday demand is the open question: see revenue.by_weekday and occupancy.by_weekday, where room_units_sold is against capacity_units_per_day.',
        'Prices are per adult and vary by day class: weekday_adult, friday_adult, holiday_adult. Rooms are charged on top, per room.',
        'discount_given is money already conceded off the rack price — read it before proposing further discounting.',
        'Every slice (by_weekday, by_month, by_package) covers bookings that stood: confirmed, checked out or no-show. Cancellations are counted in totals.cancelled and nowhere else.',
      ],
    },

    capacity: {
      room_types: inv.map((r) => ({
        type: r.room_type, name: r.display_name, units: r.total_units, daylong_only: r.daylong_only,
      })),
      capacity_units_per_day: totalUnits,
      settings_total_rooms: settings['total_rooms'] ? Number(settings['total_rooms']) : null,
    },

    price_list: pkgs.map((p) => ({
      name: p.name?.trim(), type: p.type, active: p.is_active,
      adult_weekday: p.weekday_adult, adult_friday: p.friday_adult, adult_holiday: p.holiday_adult,
      child_meal: p.child_meal, driver: p.driver_price, extra_person: p.extra_person, extra_bed: p.extra_bed,
      check_in: p.check_in, check_out: p.check_out,
      meals: { breakfast: p.includes_breakfast, lunch: p.includes_lunch, dinner: p.includes_dinner, snacks: p.includes_snacks },
      room_prices: Object.fromEntries(pkgPrices.filter((x) => x.package_id === p.id).map((x) => [x.room_type, x.price])),
    })),

    totals: {
      bookings_in_range: facts.length,
      earning_bookings:  earning.length,
      ...bucketOut([...byMonth.values()].reduce((a, b) => ({
        n: a.n + b.n, guests: a.guests + b.guests, revenue: a.revenue + b.revenue,
        discount: a.discount + b.discount, units: a.units + b.units,
      }), emptyBucket())),
      expenses:  expenseTotal,
      net:       round(monthRows.reduce((s, m) => s + m.net, 0)),
      coffee_shop_sales: round(coffee.reduce((s, r) => s + Number(r.net_amount ?? 0), 0)),
      on_property_extras_charged: round(charges.reduce((s, c) => s + Number(c.amount ?? 0), 0)),
      cancelled:  facts.filter((f) => f.status === 'cancelled').length,
      no_shows:   facts.filter((f) => f.status === 'no_show').length,
      repeat_guests: repeatGuests,
      distinct_guests: byPhone.size,
    },

    revenue: {
      by_month:   monthRows,
      by_weekday: DOW.map((w) => {
        const b = byWeekday.get(w) ?? emptyBucket()
        const occ = occByWeekday.get(w)
        return {
          weekday: w,
          ...bucketOut(b),
          days_with_business: occ?.days.size ?? 0,
          avg_room_units_sold_per_day: occ && occ.days.size ? round(occ.units / occ.days.size) : 0,
        }
      }),
      by_product: [...byType.entries()].map(([k, b]) => ({ product: k, ...bucketOut(b) })),
      by_package: [...byPackage.entries()].map(([k, b]) => ({ package: k, ...bucketOut(b) }))
        .sort((a, b) => b.revenue - a.revenue),
      corporate_vs_retail: ['corporate', 'retail'].map((seg) => {
        const rows = earning.filter((f) => (seg === 'corporate') === f.corporate)
        return {
          segment: seg,
          bookings: rows.length,
          guests:   rows.reduce((s, f) => s + f.guests, 0),
          revenue:  round(rows.reduce((s, f) => s + f.revenue, 0)),
        }
      }),
      top_companies: sumBy(earning.filter((f) => f.company), (f) => f.company, (f) => f.revenue).slice(0, 20),
    },

    demand: {
      party_size:  countBy(earning.map((f) => partyBucket(f.guests))),
      lead_time:   countBy(leadDays.map(leadBucket)),
      avg_lead_days: leadDays.length ? round(leadDays.reduce((s, d) => s + d, 0) / leadDays.length) : null,
      booking_source: countBy(earning.map((f) => f.source ?? 'unknown')),
      holiday_vs_ordinary: ['holiday', 'ordinary'].map((k) => {
        const rows = earning.filter((f) => (k === 'holiday') === f.holiday)
        return { day: k, bookings: rows.length, revenue: round(rows.reduce((s, f) => s + f.revenue, 0)) }
      }),
    },

    discounting: {
      bookings_discounted: discounted.length,
      share_of_bookings:   earning.length ? round(discounted.length / earning.length * 100) : 0,
      total_given:         round(discounted.reduce((s, f) => s + f.discount, 0)),
      avg_pct_when_given:  discounted.length
        ? round(discounted.reduce((s, f) => s + (f.subtotal ? f.discount / f.subtotal * 100 : 0), 0) / discounted.length)
        : 0,
      by_weekday: DOW.map((w) => {
        const rows = earning.filter((f) => f.weekday === w)
        const given = rows.reduce((s, f) => s + f.discount, 0)
        return { weekday: w, discount_given: round(given) }
      }),
    },

    occupancy: {
      note: 'room_units_sold counts rooms held per calendar day; a night stay counts on each night it covers.',
      capacity_units_per_day: totalUnits,
      by_weekday: DOW.map((w) => {
        const occ = occByWeekday.get(w)
        const days = occ?.days.size ?? 0
        return {
          weekday: w,
          days_sold_on: days,
          avg_units_sold: days ? round(occ!.units / days) : 0,
          avg_occupancy_pct: days && totalUnits ? round(occ!.units / days / totalUnits * 100) : 0,
        }
      }),
      busiest_dates: [...soldByDate.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([date, units]) => ({ date, weekday: weekdayOf(date), units_sold: units })),
      empty_dates_sample: (() => {
        const out: string[] = []
        for (let d = Date.parse(from + 'T12:00:00Z'); d <= Date.parse(to + 'T12:00:00Z'); d += 86400_000) {
          const iso = new Date(d).toISOString().slice(0, 10)
          if (!soldByDate.has(iso) && iso <= todayDhaka()) out.push(iso)
        }
        return out.slice(0, 60)
      })(),
    },

    expenses: {
      total:       expenseTotal,
      by_month:    expByMonth,
      by_group:    expByGroup,
      by_category: expByCategory,
      top_payees:  expByPayee,
    },
  }

  if (detail === 'full') {
    // Columns + rows: the key names would otherwise repeat a thousand times.
    const bookingColumns = [
      'ref', 'date', 'weekday', 'type', 'package', 'status', 'nights', 'adults', 'children',
      'drivers', 'rooms', 'room_units', 'subtotal', 'discount', 'extras', 'total', 'revenue',
      'advance_paid', 'corporate', 'company', 'source', 'booked_on', 'lead_days',
    ] as const
    pack.bookings = {
      columns: bookingColumns,
      rows: facts.map((f) => bookingColumns.map((c) => (f as Record<string, unknown>)[c] ?? null)),
    }
    const expenseColumns = ['date', 'amount', 'group', 'category', 'payee', 'method', 'note'] as const
    pack.expense_rows = {
      columns: expenseColumns,
      rows: expenses.map((e) => expenseColumns.map((c) => (e as Record<string, unknown>)[c] ?? null)),
    }
  }

  return pack
}
