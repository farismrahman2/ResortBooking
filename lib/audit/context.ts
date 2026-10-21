import { createServiceClient } from '@/lib/supabase/server'
import { buildBusinessContext } from '@/lib/queries/exports/business-context'
import { addDaysIso } from '@/lib/dates'
import type { Finding } from './types'

/**
 * What the weekly and monthly agents read: totals and trends only — no guest
 * names or phone numbers. Every extra slice is optional, so a module the
 * resort doesn't use yet just comes back empty.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const round = (n: number) => Math.round(n)
const month = (iso: string) => String(iso).slice(0, 7)

/** An optional slice: empty when unavailable, but logged — a query that fails
 *  quietly reads to the model as "nothing recorded". */
async function soft(p: PromiseLike<{ data: Row[] | null; error?: { message: string } | null }>): Promise<Row[]> {
  try {
    const { data, error } = await p
    if (error) console.warn('[ai-audit] context query failed:', error.message)
    return data ?? []
  } catch (e) {
    console.warn('[ai-audit] context query failed:', e instanceof Error ? e.message : String(e))
    return []
  }
}

function sumBy(rows: Row[], key: (r: Row) => string, val: (r: Row) => number) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r))
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, round(v)]))
}

/** Costs, stock, sales pipeline, enquiries and guest feedback for a period. */
async function operations(from: string, to: string) {
  const db = createServiceClient({ fresh: true })
  const [payroll, deliveries, receipts, items, opps, enquiries, qa] = await Promise.all([
    soft(db.from('payroll_runs').select('period, status, total_gross, total_net').gte('period', `${from.slice(0, 7)}-01`).lte('period', to)),   // period is a date
    soft(db.from('kitchen_deliveries').select('delivery_date, status, total_amount, kitchen_vendors (display_name)').gte('delivery_date', from).lte('delivery_date', to).eq('status', 'confirmed')),
    soft(db.from('inv_movements').select('movement_date, movement_type, total_value, status').gte('movement_date', from).lte('movement_date', to).eq('status', 'completed')),
    soft(db.from('inv_items').select('current_stock, avg_purchase_price, reorder_point, is_active').eq('is_active', true)),
    soft(db.from('crm_opportunities').select('stage, est_value, actual_value, won_at, lost_at, lost_reason, is_active').eq('is_active', true)),
    soft(db.from('enquiries').select('type, status, submitted_at, created_at').gte('created_at', from)),
    soft(db.from('qa_reviews').select('created_at, room_service_rating, food_rating, overall_rating, would_return').gte('created_at', from)),
  ])
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)
  const rated = (k: string) => qa.map((r) => Number(r[k])).filter((x) => x > 0)
  return {
    payroll_by_month: payroll.map((p) => ({ month: month(p.period), status: p.status, gross: round(Number(p.total_gross ?? 0)), net: round(Number(p.total_net ?? 0)) })),
    kitchen_purchases: {
      by_month:  sumBy(deliveries, (d) => month(d.delivery_date), (d) => Number(d.total_amount ?? 0)),
      by_vendor: sumBy(deliveries, (d) => (Array.isArray(d.kitchen_vendors) ? d.kitchen_vendors[0] : d.kitchen_vendors)?.display_name ?? 'other', (d) => Number(d.total_amount ?? 0)),
    },
    store_movements: {
      note: 'Issues to the kitchen are recorded without a value (Tk 0), so count them rather than sum them.',
      receipts_value_by_month: sumBy(receipts.filter((m) => m.movement_type === 'receipt'), (m) => month(m.movement_date), (m) => Number(m.total_value ?? 0)),
      receipts_count_by_month: sumBy(receipts.filter((m) => m.movement_type === 'receipt'), (m) => month(m.movement_date), () => 1),
      issues_count_by_month:   sumBy(receipts.filter((m) => m.movement_type === 'issue'), (m) => month(m.movement_date), () => 1),
      adjustments_count_by_month: sumBy(receipts.filter((m) => m.movement_type === 'adjustment'), (m) => month(m.movement_date), () => 1),
    },
    stock_now: {
      active_items: items.length,
      value_at_avg_cost: round(items.reduce((s, i) => s + Math.max(0, Number(i.current_stock ?? 0)) * Number(i.avg_purchase_price ?? 0), 0)),
      at_or_below_reorder: items.filter((i) => Number(i.reorder_point ?? 0) > 0 && Number(i.current_stock ?? 0) <= Number(i.reorder_point)).length,
    },
    corporate_pipeline: {
      open_by_stage: sumBy(opps.filter((o) => !o.won_at && !o.lost_at), (o) => o.stage ?? 'unknown', () => 1),
      open_est_value: round(opps.filter((o) => !o.won_at && !o.lost_at).reduce((s, o) => s + Number(o.est_value ?? 0), 0)),
      won_in_period:  opps.filter((o) => o.won_at && o.won_at >= from).length,
      won_value_in_period: round(opps.filter((o) => o.won_at && o.won_at >= from).reduce((s, o) => s + Number(o.actual_value ?? o.est_value ?? 0), 0)),
      lost_reasons_in_period: sumBy(opps.filter((o) => o.lost_at && o.lost_at >= from), (o) => o.lost_reason ?? 'unspecified', () => 1),
    },
    enquiries: {
      by_month:  sumBy(enquiries, (e) => month(e.submitted_at ?? e.created_at), () => 1),
      by_status: sumBy(enquiries, (e) => e.status ?? 'unknown', () => 1),
      by_type:   sumBy(enquiries, (e) => e.type ?? 'unknown', () => 1),
    },
    guest_feedback: {
      reviews: qa.length,
      avg_overall: avg(rated('overall_rating')), avg_food: avg(rated('food_rating')), avg_room_service: avg(rated('room_service_rating')),
      would_return_pct: qa.length ? Math.round((qa.filter((r) => r.would_return === true).length / qa.length) * 100) : null,
    },
  }
}

/** Findings without guest details: titles, counts and ৳ at stake. */
export const findingsSummary = (findings: Finding[]) =>
  findings.map((f) => ({ area: f.area, severity: f.severity, issue: f.title, count: f.count, ...(f.amount ? { taka_at_stake: f.amount } : {}) }))

/** This week against the week before, plus the month so far. */
export async function weeklyContext(today: string, findings: Finding[]) {
  const thisFrom = addDaysIso(today, -6), lastFrom = addDaysIso(today, -13), lastTo = addDaysIso(today, -7)
  const [thisWeek, lastWeek, ops] = await Promise.all([
    buildBusinessContext({ from: thisFrom, to: today, detail: 'summary' }),
    buildBusinessContext({ from: lastFrom, to: lastTo, detail: 'summary' }),
    operations(`${today.slice(0, 7)}-01` < lastFrom ? `${today.slice(0, 7)}-01` : lastFrom, today),
  ])
  return {
    today, this_week: { from: thisFrom, to: today, ...thisWeek }, last_week: { from: lastFrom, to: lastTo, ...lastWeek },
    operations_month_to_date: ops, open_issues_from_daily_checks: findingsSummary(findings),
  }
}

/** The last 12 full months plus this month so far, and the next 90 days on the books. */
export async function monthlyContext(today: string, findings: Finding[]) {
  const [y, m] = today.split('-').map(Number)
  const from = new Date(Date.UTC(y - 1, m - 1, 1)).toISOString().slice(0, 10)
  const [year, ahead, ops] = await Promise.all([
    buildBusinessContext({ from, to: today, detail: 'summary' }),
    buildBusinessContext({ from: addDaysIso(today, 1), to: addDaysIso(today, 90), detail: 'summary' }),
    operations(from, today),
  ])
  return {
    today, last_12_months: { from, to: today, ...year }, on_the_books_next_90_days: ahead,
    operations: ops, open_issues_from_daily_checks: findingsSummary(findings),
  }
}
