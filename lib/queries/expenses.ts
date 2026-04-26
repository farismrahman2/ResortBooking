import { createClient } from '@/lib/supabase/server'
import { toISODate } from '@/lib/formatters/dates'
import type {
  ExpenseRowWithRefs,
  ExpenseCategoryRow,
  ExpensePayeeRow,
  ExpenseAttachmentRow,
  ExpenseBudgetRow,
  ExpenseCategoryGroup,
  RecurringExpenseTemplateRow,
  PayeeType,
  BudgetPeriodType,
} from '@/lib/supabase/types'

/**
 * EXPENSE QUERIES (server-only)
 *
 * Phase 1 queries: list/detail + reference data + small monthly summary.
 * Phase 2 adds analytics + monthly pivot. Phase 3 adds budgets + receipts.
 */

// ─── List & detail ───────────────────────────────────────────────────────────

interface GetExpensesParams {
  from?: string
  to?: string
  categoryId?: string
  payeeId?: string
  paymentMethod?: string
  search?: string
  includeDrafts?: boolean
  limit?: number
  offset?: number
}

export async function getExpenses(params: GetExpensesParams = {}): Promise<{
  rows: ExpenseRowWithRefs[]
  total: number
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const limit  = params.limit ?? 50
  const offset = params.offset ?? 0

  let query = db
    .from('expenses')
    .select(`
      *,
      category:expense_categories!inner (id, name, slug, category_group),
      payee:expense_payees (id, name, payee_type),
      attachments:expense_attachments (*)
    `, { count: 'exact' })
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!params.includeDrafts) query = query.eq('is_draft', false)
  if (params.from) query = query.gte('expense_date', params.from)
  if (params.to)   query = query.lte('expense_date', params.to)
  if (params.categoryId)    query = query.eq('category_id', params.categoryId)
  if (params.payeeId)       query = query.eq('payee_id', params.payeeId)
  if (params.paymentMethod) query = query.eq('payment_method', params.paymentMethod)
  if (params.search) {
    // Match description directly. Payee name is searched via a separate path because
    // Supabase's PostgREST .or() across joined tables is fragile.
    query = query.or(`description.ilike.%${params.search}%,reference_number.ilike.%${params.search}%`)
  }

  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) throw new Error(`getExpenses: ${error.message}`)

  // Coerce numeric strings → numbers (Postgres NUMERIC arrives as string from PostgREST)
  const rows: ExpenseRowWithRefs[] = (data ?? []).map((r: any) => ({
    ...r,
    amount: Number(r.amount),
    attachments: (r.attachments ?? []).map((a: any) => ({ ...a, size_bytes: Number(a.size_bytes) })),
  }))

  return { rows, total: count ?? rows.length }
}

export async function getExpenseById(id: string): Promise<ExpenseRowWithRefs | null> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data, error } = await db
    .from('expenses')
    .select(`
      *,
      category:expense_categories!inner (id, name, slug, category_group),
      payee:expense_payees (id, name, payee_type),
      attachments:expense_attachments (*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null

  return {
    ...data,
    amount: Number(data.amount),
    attachments: (data.attachments ?? []).map((a: any) => ({ ...a, size_bytes: Number(a.size_bytes) })),
  } as ExpenseRowWithRefs
}

// ─── Reference data ──────────────────────────────────────────────────────────

export async function getActiveCategories(): Promise<ExpenseCategoryRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getActiveCategories: ${error.message}`)
  return data ?? []
}

export async function getAllCategories(): Promise<ExpenseCategoryRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getAllCategories: ${error.message}`)
  return data ?? []
}

export async function getCategoryBySlug(slug: string): Promise<ExpenseCategoryRow | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('slug', slug)
    .single()
  return data ?? null
}

export async function getActivePayees(): Promise<ExpensePayeeRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_payees')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getActivePayees: ${error.message}`)
  return data ?? []
}

export async function getAllPayees(): Promise<ExpensePayeeRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_payees')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getAllPayees: ${error.message}`)
  return data ?? []
}

export async function getPayeesByType(type: PayeeType): Promise<ExpensePayeeRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_payees')
    .select('*')
    .eq('is_active', true)
    .eq('payee_type', type)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getPayeesByType: ${error.message}`)
  return data ?? []
}

// ─── Lightweight summary used by the dashboard widget ────────────────────────

/**
 * Returns total expense for the calendar month containing `date`,
 * a delta vs the same window of the previous month, and the count of
 * pending recurring drafts. Cheap aggregate — fine for dashboard rendering.
 */
export async function getExpensesThisMonthSummary(date: Date = new Date()): Promise<{
  this_month_total: number
  last_month_total: number
  delta:            number
  draft_count:      number
}> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const thisStart = toISODate(new Date(date.getFullYear(), date.getMonth(), 1))
  const thisEnd   = toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  const lastStart = toISODate(new Date(date.getFullYear(), date.getMonth() - 1, 1))
  const lastEnd   = toISODate(new Date(date.getFullYear(), date.getMonth(), 0))

  const [thisMonth, lastMonth, drafts] = await Promise.all([
    db.from('expenses').select('amount')
      .eq('is_draft', false).gte('expense_date', thisStart).lte('expense_date', thisEnd),
    db.from('expenses').select('amount')
      .eq('is_draft', false).gte('expense_date', lastStart).lte('expense_date', lastEnd),
    db.from('expenses').select('id', { count: 'exact', head: true }).eq('is_draft', true),
  ])

  const thisTotal = (thisMonth.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
  const lastTotal = (lastMonth.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)

  return {
    this_month_total: thisTotal,
    last_month_total: lastTotal,
    delta:            thisTotal - lastTotal,
    draft_count:      drafts.count ?? 0,
  }
}

// ─── PHASE 2: Analytics & reporting ──────────────────────────────────────────

/** Range helpers shared by Phase 2 queries */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function daysInRangeInclusive(from: string, to: string): number {
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to   + 'T00:00:00')
  return Math.max(1, Math.round((t.getTime() - f.getTime()) / 86400000) + 1)
}

// ─── KPI summary ─────────────────────────────────────────────────────────────

export interface ExpenseTotalsSummary {
  total:        number
  txn_count:    number
  avg_per_day:  number
  top_category: { name: string; amount: number } | null
  top_payee:    { name: string; amount: number } | null
}

export async function getExpenseTotalsSummary(
  from: string, to: string,
): Promise<ExpenseTotalsSummary> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data } = await db
    .from('expenses')
    .select(`
      amount,
      category:expense_categories!inner (name),
      payee:expense_payees (name)
    `)
    .eq('is_draft', false)
    .gte('expense_date', from)
    .lte('expense_date', to)

  const rows = (data ?? []) as { amount: any; category: { name: string }; payee: { name: string } | null }[]

  let total      = 0
  const byCat    = new Map<string, number>()
  const byPayee  = new Map<string, number>()

  for (const r of rows) {
    const amt = Number(r.amount ?? 0)
    total += amt
    if (r.category?.name) byCat.set(r.category.name, (byCat.get(r.category.name) ?? 0) + amt)
    if (r.payee?.name)    byPayee.set(r.payee.name,  (byPayee.get(r.payee.name)  ?? 0) + amt)
  }

  function topOf(map: Map<string, number>): { name: string; amount: number } | null {
    let best: { name: string; amount: number } | null = null
    for (const [name, amount] of map) {
      if (!best || amount > best.amount) best = { name, amount }
    }
    return best
  }

  const days = daysInRangeInclusive(from, to)
  return {
    total,
    txn_count:    rows.length,
    avg_per_day:  days > 0 ? Math.round(total / days) : 0,
    top_category: topOf(byCat),
    top_payee:    topOf(byPayee),
  }
}

// ─── Daily expense trend (zero-filled across the range) ──────────────────────

export interface DailyExpenseTrendRow {
  date:  string
  total: number
}

export async function getDailyExpenseTrend(
  from: string, to: string,
): Promise<DailyExpenseTrendRow[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('expenses')
    .select('expense_date, amount')
    .eq('is_draft', false)
    .gte('expense_date', from)
    .lte('expense_date', to)

  const map = new Map<string, number>()
  for (const r of (data ?? []) as { expense_date: string; amount: any }[]) {
    map.set(r.expense_date, (map.get(r.expense_date) ?? 0) + Number(r.amount ?? 0))
  }

  // Continuous fill so charts stay smooth
  const result: DailyExpenseTrendRow[] = []
  const cursor = new Date(from + 'T00:00:00')
  const end    = new Date(to   + 'T00:00:00')
  while (cursor <= end) {
    const d = isoDate(cursor)
    result.push({ date: d, total: map.get(d) ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

// ─── Category breakdown ──────────────────────────────────────────────────────

export interface CategoryBreakdownRow {
  category_id:    string
  category_name:  string
  category_group: ExpenseCategoryGroup
  total:          number
  txn_count:      number
  pct_of_total:   number
}

export async function getCategoryBreakdown(
  from: string, to: string,
): Promise<CategoryBreakdownRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data } = await db
    .from('expenses')
    .select(`
      amount,
      category:expense_categories!inner (id, name, category_group)
    `)
    .eq('is_draft', false)
    .gte('expense_date', from)
    .lte('expense_date', to)

  const map = new Map<string, CategoryBreakdownRow>()
  let grand = 0
  for (const r of (data ?? []) as any[]) {
    const c = r.category
    if (!c) continue
    const amt = Number(r.amount ?? 0)
    grand += amt
    const cur = map.get(c.id) ?? {
      category_id:    c.id,
      category_name:  c.name,
      category_group: c.category_group,
      total:          0,
      txn_count:      0,
      pct_of_total:   0,
    }
    cur.total     += amt
    cur.txn_count += 1
    map.set(c.id, cur)
  }

  const result = Array.from(map.values())
  for (const row of result) {
    row.pct_of_total = grand > 0 ? Math.round((row.total / grand) * 1000) / 10 : 0
  }
  result.sort((a, b) => b.total - a.total)
  return result
}

// ─── Payee breakdown ─────────────────────────────────────────────────────────

export interface PayeeBreakdownRow {
  payee_id:       string
  payee_name:     string
  payee_type:     PayeeType
  total:          number
  txn_count:      number
  last_paid_date: string
}

export async function getPayeeBreakdown(
  from: string, to: string, payeeType?: PayeeType,
): Promise<PayeeBreakdownRow[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db
    .from('expenses')
    .select(`
      amount, expense_date,
      payee:expense_payees!inner (id, name, payee_type)
    `)
    .eq('is_draft', false)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .not('payee_id', 'is', null)

  if (payeeType) query = query.eq('expense_payees.payee_type', payeeType)

  const { data } = await query
  const map = new Map<string, PayeeBreakdownRow>()
  for (const r of (data ?? []) as any[]) {
    const p = r.payee
    if (!p) continue
    const amt = Number(r.amount ?? 0)
    const cur = map.get(p.id) ?? {
      payee_id:       p.id,
      payee_name:     p.name,
      payee_type:     p.payee_type,
      total:          0,
      txn_count:      0,
      last_paid_date: r.expense_date,
    }
    cur.total     += amt
    cur.txn_count += 1
    if (r.expense_date > cur.last_paid_date) cur.last_paid_date = r.expense_date
    map.set(p.id, cur)
  }

  const result = Array.from(map.values())
  result.sort((a, b) => b.total - a.total)
  return result
}

// ─── Monthly Excel-style pivot ───────────────────────────────────────────────

export interface MonthlyExpenseSummary {
  month:           string                                  // YYYY-MM
  from:            string
  to:              string
  categories:      ExpenseCategoryRow[]                    // active categories (column order)
  days: {
    date:        string
    cells:       Record<string /* category_slug */, number>
    day_total:   number
  }[]
  category_totals: Record<string /* slug */, number>       // column totals
  grand_total:     number
}

export async function getMonthlyExpenseSummary(
  monthIso: string,   // 'YYYY-MM'
): Promise<MonthlyExpenseSummary> {
  const [y, m] = monthIso.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) throw new Error(`getMonthlyExpenseSummary: invalid month ${monthIso}`)

  const from = isoDate(new Date(y, m - 1, 1))
  const to   = isoDate(new Date(y, m, 0))     // last day of month

  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // 1) Active categories — column order is stable month-to-month
  const { data: categories } = await db
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  // 2) Long-form pivot via RPC
  const { data: pivot, error } = await db.rpc('get_expense_daily_pivot', { p_from: from, p_to: to })
  if (error) throw new Error(`get_expense_daily_pivot: ${error.message}`)

  // 3) Index by date → slug → amount
  const byDate = new Map<string, Record<string, number>>()
  const catTotals: Record<string, number> = {}
  let grandTotal = 0

  for (const row of (pivot ?? []) as { expense_date: string; category_slug: string; daily_total: any }[]) {
    const amt = Number(row.daily_total ?? 0)
    grandTotal += amt
    catTotals[row.category_slug] = (catTotals[row.category_slug] ?? 0) + amt

    const cells = byDate.get(row.expense_date) ?? {}
    cells[row.category_slug] = (cells[row.category_slug] ?? 0) + amt
    byDate.set(row.expense_date, cells)
  }

  // 4) Walk every day of the month so the row layout is stable even on zero-spend days
  const days: MonthlyExpenseSummary['days'] = []
  const cursor = new Date(from + 'T00:00:00')
  const end    = new Date(to   + 'T00:00:00')
  while (cursor <= end) {
    const d = isoDate(cursor)
    const cells = byDate.get(d) ?? {}
    const day_total = Object.values(cells).reduce((s, v) => s + v, 0)
    days.push({ date: d, cells, day_total })
    cursor.setDate(cursor.getDate() + 1)
  }

  return {
    month: monthIso,
    from,
    to,
    categories:      categories ?? [],
    days,
    category_totals: catTotals,
    grand_total:     grandTotal,
  }
}

// ─── Profit & Loss (joins bookings + expenses) ───────────────────────────────

export interface ProfitAndLoss {
  revenue: {
    booking_revenue:     number   // sum of bookings.total in range, status != 'cancelled'
    booking_collected:   number   // advance_paid same scope
    booking_outstanding: number   // remaining same scope
  }
  expenses: {
    total:    number              // is_draft = false
    by_group: Record<ExpenseCategoryGroup, number>
  }
  profit: {
    gross:    number              // revenue.booking_revenue - expenses.total
    cash_net: number              // revenue.booking_collected - expenses.total
  }
}

export async function getProfitAndLoss(from: string, to: string): Promise<ProfitAndLoss> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [bookingsRes, expensesRes] = await Promise.all([
    db.from('bookings')
      .select('total, advance_paid, remaining')
      .neq('status', 'cancelled')
      .gte('visit_date', from)
      .lte('visit_date', to),
    db.from('expenses')
      .select('amount, category:expense_categories!inner (category_group)')
      .eq('is_draft', false)
      .gte('expense_date', from)
      .lte('expense_date', to),
  ])

  const bookings = (bookingsRes.data ?? []) as { total: number; advance_paid: number; remaining: number }[]
  const booking_revenue     = bookings.reduce((s, b) => s + Number(b.total ?? 0), 0)
  const booking_collected   = bookings.reduce((s, b) => s + Number(b.advance_paid ?? 0), 0)
  const booking_outstanding = bookings.reduce((s, b) => s + Number(b.remaining ?? 0), 0)

  const byGroup: Record<ExpenseCategoryGroup, number> = {
    bazar: 0, beverages: 0, utilities: 0, maintenance: 0,
    salary: 0, services: 0, materials: 0, miscellaneous: 0,
  }
  let expensesTotal = 0
  for (const r of (expensesRes.data ?? []) as any[]) {
    const amt = Number(r.amount ?? 0)
    const grp = r.category?.category_group as ExpenseCategoryGroup | undefined
    expensesTotal += amt
    if (grp && grp in byGroup) byGroup[grp] += amt
  }

  return {
    revenue: { booking_revenue, booking_collected, booking_outstanding },
    expenses: { total: expensesTotal, by_group: byGroup },
    profit: {
      gross:    booking_revenue   - expensesTotal,
      cash_net: booking_collected - expensesTotal,
    },
  }
}

// ─── PHASE 3: Receipts, Budgets, Recurring Templates ─────────────────────────

// ─── Receipts (attachments) ──────────────────────────────────────────────────

export async function getExpenseAttachments(expenseId: string): Promise<ExpenseAttachmentRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_attachments')
    .select('*')
    .eq('expense_id', expenseId)
    .order('uploaded_at', { ascending: false })
  if (error) throw new Error(`getExpenseAttachments: ${error.message}`)
  return (data ?? []).map((a: any) => ({ ...a, size_bytes: Number(a.size_bytes) }))
}

/**
 * Returns a short-lived signed URL for a private-bucket attachment.
 * The bucket is private; we mint URLs server-side for each detail-page render.
 */
export async function getSignedAttachmentUrl(
  storagePath: string,
  expirySec = 60 * 60,   // 1 hour default — enough for a detail page session
): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase
    .storage
    .from('expense-receipts')
    .createSignedUrl(storagePath, expirySec)
  if (error || !data?.signedUrl) {
    throw new Error(`getSignedAttachmentUrl: ${error?.message ?? 'no url returned'}`)
  }
  return data.signedUrl
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export async function getBudgets(
  period: BudgetPeriodType,
  periodStart: string,   // YYYY-MM-DD (first day of period)
): Promise<ExpenseBudgetRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('expense_budgets')
    .select('*')
    .eq('period_type', period)
    .eq('period_start', periodStart)
  if (error) throw new Error(`getBudgets: ${error.message}`)
  return (data ?? []).map((b: any) => ({ ...b, amount: Number(b.amount) }))
}

export interface BudgetVsActualRow {
  budget_id:     string             // id of the expense_budgets row (used by UI for delete)
  category_id:   string | null
  category_name: string             // 'Overall' if category_id is null
  budget:        number
  actual:        number
  variance:      number              // actual - budget (negative = under budget)
  pct_consumed:  number              // 0..1+
}

export async function getBudgetVsActual(
  period: BudgetPeriodType,
  periodStart: string,
): Promise<BudgetVsActualRow[]> {
  // Compute the period range
  const start = new Date(periodStart + 'T00:00:00')
  let endDate: Date
  if (period === 'monthly') {
    endDate = new Date(start.getFullYear(), start.getMonth() + 1, 0)   // last day of month
  } else {
    endDate = new Date(start.getFullYear(), 11, 31)                    // Dec 31 of year
  }
  const periodEnd = toISODate(endDate)

  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // 1. Budgets for the period (includes id so the UI can delete)
  const { data: budgets } = await db
    .from('expense_budgets')
    .select('id, category_id, amount, category:expense_categories (id, name)')
    .eq('period_type', period)
    .eq('period_start', periodStart)

  // 2. All non-draft expenses in the period — per category + grand total
  const { data: expenses } = await db
    .from('expenses')
    .select('amount, category_id')
    .eq('is_draft', false)
    .gte('expense_date', periodStart)
    .lte('expense_date', periodEnd)

  const actualPerCat = new Map<string, number>()
  let actualOverall = 0
  for (const r of (expenses ?? []) as any[]) {
    const amt = Number(r.amount ?? 0)
    actualOverall += amt
    actualPerCat.set(r.category_id, (actualPerCat.get(r.category_id) ?? 0) + amt)
  }

  const result: BudgetVsActualRow[] = []
  for (const b of (budgets ?? []) as any[]) {
    const isOverall = b.category_id === null
    const budget = Number(b.amount ?? 0)
    const actual = isOverall ? actualOverall : (actualPerCat.get(b.category_id) ?? 0)
    result.push({
      budget_id:     b.id,
      category_id:   b.category_id,
      category_name: isOverall ? 'Overall' : (b.category?.name ?? '—'),
      budget,
      actual,
      variance:      actual - budget,
      pct_consumed:  budget > 0 ? actual / budget : 0,
    })
  }

  // Sort: overall first, then by pct_consumed descending so overruns surface
  result.sort((a, b) => {
    if (a.category_id === null) return -1
    if (b.category_id === null) return 1
    return b.pct_consumed - a.pct_consumed
  })
  return result
}

// ─── Recurring templates ─────────────────────────────────────────────────────

export async function getRecurringTemplates(activeOnly = false): Promise<RecurringExpenseTemplateRow[]> {
  const supabase = createClient()
  let query = supabase
    .from('recurring_expense_templates')
    .select('*')
    .order('day_of_month', { ascending: true })
  if (activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) throw new Error(`getRecurringTemplates: ${error.message}`)
  return (data ?? []).map((t: any) => ({
    ...t,
    default_amount: t.default_amount === null ? null : Number(t.default_amount),
  }))
}

export async function getRecurringTemplateById(id: string): Promise<RecurringExpenseTemplateRow | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('recurring_expense_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (!data) return null
  return {
    ...data,
    default_amount: data.default_amount === null ? null : Number(data.default_amount),
  } as RecurringExpenseTemplateRow
}

/**
 * Templates that haven't generated a draft for the given month yet.
 * (last_generated_for IS NULL OR < first day of given month)
 */
export async function getTemplatesPendingForMonth(
  monthIso: string,   // 'YYYY-MM'
): Promise<RecurringExpenseTemplateRow[]> {
  const [y, m] = monthIso.split('-').map(Number)
  const periodStart = toISODate(new Date(y, m - 1, 1))
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('recurring_expense_templates')
    .select('*')
    .eq('is_active', true)
    .or(`last_generated_for.is.null,last_generated_for.lt.${periodStart}`)
    .order('day_of_month', { ascending: true })
  if (error) throw new Error(`getTemplatesPendingForMonth: ${error.message}`)
  return (data ?? []).map((t: any) => ({
    ...t,
    default_amount: t.default_amount === null ? null : Number(t.default_amount),
  }))
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

/** Pending recurring drafts — used by the /expenses/drafts page. */
export async function getDrafts(): Promise<ExpenseRowWithRefs[]> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data, error } = await db
    .from('expenses')
    .select(`
      *,
      category:expense_categories!inner (id, name, slug, category_group),
      payee:expense_payees (id, name, payee_type),
      attachments:expense_attachments (*)
    `)
    .eq('is_draft', true)
    .order('expense_date', { ascending: true })

  if (error) throw new Error(`getDrafts: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    ...r,
    amount: Number(r.amount),
    attachments: (r.attachments ?? []).map((a: any) => ({ ...a, size_bytes: Number(a.size_bytes) })),
  })) as ExpenseRowWithRefs[]
}
