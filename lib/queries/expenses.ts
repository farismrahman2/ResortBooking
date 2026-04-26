import { createClient } from '@/lib/supabase/server'
import { toISODate } from '@/lib/formatters/dates'
import type {
  ExpenseRowWithRefs,
  ExpenseCategoryRow,
  ExpensePayeeRow,
  PayeeType,
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
