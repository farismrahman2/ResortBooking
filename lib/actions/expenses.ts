'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  expenseFormSchema,
  dailyExpenseBulkSchema,
  categoryFormSchema,
  payeeFormSchema,
} from '@/lib/validators/expense'
import type { ActionResult, ActionData } from './types'

/**
 * EXPENSE SERVER ACTIONS — Phase 1
 *
 * Each action validates input via Zod, mutates via Supabase, logs to history_log,
 * and revalidates the affected paths. Mirrors the conventions used in
 * `lib/actions/bookings.ts` and `lib/actions/quotes.ts`.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function logHistory(
  entityId: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  await db.from('history_log').insert({
    entity_type: 'expense',
    entity_id:   entityId,
    event,
    actor:       'system',
    payload:     { action, ...payload },
  })
}

async function currentUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ─── Expense CRUD ────────────────────────────────────────────────────────────

export async function createExpense(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = expenseFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    const { data, error } = await db
      .from('expenses')
      .insert({
        expense_date:     parsed.expense_date,
        category_id:      parsed.category_id,
        payee_id:         parsed.payee_id ?? null,
        description:      parsed.description ?? null,
        amount:           parsed.amount,
        payment_method:   parsed.payment_method,
        reference_number: parsed.reference_number ?? null,
        notes:            parsed.notes ?? null,
        is_draft:         false,
        created_by:       userId,
      })
      .select('id')
      .single()

    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(data.id, 'created', 'expense_created', {
      amount: parsed.amount,
      category_id: parsed.category_id,
      expense_date: parsed.expense_date,
    })

    revalidatePath('/expenses')
    revalidatePath('/')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateExpense(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = expenseFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db
      .from('expenses')
      .update({
        expense_date:     parsed.expense_date,
        category_id:      parsed.category_id,
        payee_id:         parsed.payee_id ?? null,
        description:      parsed.description ?? null,
        amount:           parsed.amount,
        payment_method:   parsed.payment_method,
        reference_number: parsed.reference_number ?? null,
        notes:            parsed.notes ?? null,
      })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'expense_edited', {
      amount: parsed.amount,
      expense_date: parsed.expense_date,
    })

    revalidatePath('/expenses')
    revalidatePath(`/expenses/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Phase 3 will delete storage objects too. For now, attachments cascade-delete via FK.
    const { error } = await db.from('expenses').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'expense_deleted', {})

    revalidatePath('/expenses')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Bulk daily entry ────────────────────────────────────────────────────────

export async function createDailyExpenses(
  input: unknown,
): Promise<ActionData<{ inserted: number }>> {
  try {
    const parsed = dailyExpenseBulkSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    if (parsed.lines.length === 0) {
      return { success: false, error: 'No lines to insert' }
    }

    const rows = parsed.lines.map((line) => ({
      expense_date:   parsed.expense_date,
      category_id:    line.category_id,
      payee_id:       line.payee_id ?? null,
      description:    line.description ?? null,
      amount:         line.amount,
      payment_method: parsed.payment_method,
      notes:          parsed.notes ?? null,
      is_draft:       false,
      created_by:     userId,
    }))

    const { data, error } = await db.from('expenses').insert(rows).select('id')
    if (error) return { success: false, error: error.message }

    // Single batch history log entry — keeps the audit trail tidy.
    if (data && data.length > 0) {
      await logHistory(data[0].id, 'created', 'daily_bulk_created', {
        expense_date: parsed.expense_date,
        line_count:   data.length,
        ids:          data.map((r: any) => r.id),
      })
    }

    revalidatePath('/expenses')
    revalidatePath('/')
    return { success: true, data: { inserted: data?.length ?? 0 } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = categoryFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('expense_categories')
      .insert(parsed)
      .select('id')
      .single()

    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(data.id, 'created', 'category_created', { slug: parsed.slug })
    revalidatePath('/expenses/categories')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = categoryFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db.from('expense_categories').update(parsed).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'category_edited', { slug: parsed.slug })
    revalidatePath('/expenses/categories')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function toggleCategoryActive(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: cur } = await db
      .from('expense_categories')
      .select('is_active')
      .eq('id', id)
      .single()
    if (!cur) return { success: false, error: 'Category not found' }

    const next = !cur.is_active
    const { error } = await db
      .from('expense_categories')
      .update({ is_active: next })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'category_toggled', { is_active: next })
    revalidatePath('/expenses/categories')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Payees ──────────────────────────────────────────────────────────────────

export async function createPayee(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = payeeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data, error } = await db
      .from('expense_payees')
      .insert(parsed)
      .select('id')
      .single()

    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(data.id, 'created', 'payee_created', { name: parsed.name })
    revalidatePath('/expenses/payees')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updatePayee(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = payeeFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { error } = await db.from('expense_payees').update(parsed).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'payee_edited', { name: parsed.name })
    revalidatePath('/expenses/payees')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function togglePayeeActive(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: cur } = await db
      .from('expense_payees')
      .select('is_active')
      .eq('id', id)
      .single()
    if (!cur) return { success: false, error: 'Payee not found' }

    const next = !cur.is_active
    const { error } = await db
      .from('expense_payees')
      .update({ is_active: next })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'payee_toggled', { is_active: next })
    revalidatePath('/expenses/payees')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
