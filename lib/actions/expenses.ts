'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  expenseFormSchema,
  dailyExpenseBulkSchema,
  categoryFormSchema,
  payeeFormSchema,
  budgetFormSchema,
  recurringTemplateFormSchema,
} from '@/lib/validators/expense'
import type { ActionResult, ActionData } from './types'
import type { PaymentMethod } from '@/lib/supabase/types'

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

// ─── PHASE 3: Receipts ───────────────────────────────────────────────────────

/**
 * Records an attachment row after the browser has already uploaded the file
 * to Supabase Storage. The browser handles the upload because it's a streaming
 * binary transfer; the server action just persists the metadata + audit log.
 */
export async function attachReceipt(input: {
  expense_id:   string
  storage_path: string
  file_name:    string
  mime_type:    'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  size_bytes:   number
}): Promise<ActionData<{ id: string }>> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    // Defensive validation
    if (input.size_bytes <= 0 || input.size_bytes > 10485760) {
      return { success: false, error: 'File size must be 1 byte to 10 MB' }
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(input.mime_type)) {
      return { success: false, error: 'Only JPEG, PNG, WebP, or PDF allowed' }
    }

    const { data, error } = await db
      .from('expense_attachments')
      .insert({
        expense_id:   input.expense_id,
        storage_path: input.storage_path,
        file_name:    input.file_name,
        mime_type:    input.mime_type,
        size_bytes:   input.size_bytes,
        uploaded_by:  userId,
      })
      .select('id')
      .single()

    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(input.expense_id, 'edited', 'receipt_attached', {
      attachment_id: data.id,
      file_name:     input.file_name,
    })

    revalidatePath(`/expenses/${input.expense_id}`)
    revalidatePath(`/expenses/${input.expense_id}/edit`)
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Removes both the storage object and the DB row. FK cascade alone would not
 * remove the storage blob.
 */
export async function removeReceipt(attachmentId: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Look up the row first so we know expense_id + storage_path
    const { data: row, error: fetchErr } = await db
      .from('expense_attachments')
      .select('id, expense_id, storage_path, file_name')
      .eq('id', attachmentId)
      .single()
    if (fetchErr || !row) return { success: false, error: 'Attachment not found' }

    // Best-effort storage deletion. We don't fail the whole action if the
    // object is already gone — the DB row is the source of truth.
    await supabase.storage.from('expense-receipts').remove([row.storage_path])

    const { error: delErr } = await db.from('expense_attachments').delete().eq('id', attachmentId)
    if (delErr) return { success: false, error: delErr.message }

    await logHistory(row.expense_id, 'edited', 'receipt_removed', {
      attachment_id: attachmentId,
      file_name:     row.file_name,
    })

    revalidatePath(`/expenses/${row.expense_id}`)
    revalidatePath(`/expenses/${row.expense_id}/edit`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── PHASE 3: Budgets ────────────────────────────────────────────────────────

export async function upsertBudget(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = budgetFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const categoryId = parsed.category_id ?? null

    // Look up an existing matching budget (the partial unique indexes prevent
    // duplicates at the DB level; we replicate the lookup in JS so we can
    // distinguish create vs update for history logging).
    let existingQuery = db
      .from('expense_budgets')
      .select('id')
      .eq('period_type', parsed.period_type)
      .eq('period_start', parsed.period_start)
    existingQuery = categoryId === null
      ? existingQuery.is('category_id', null)
      : existingQuery.eq('category_id', categoryId)

    const { data: existing } = await existingQuery.maybeSingle()

    if (existing?.id) {
      const { error } = await db
        .from('expense_budgets')
        .update({ amount: parsed.amount, notes: parsed.notes ?? null })
        .eq('id', existing.id)
      if (error) return { success: false, error: error.message }

      await logHistory(existing.id, 'edited', 'budget_upserted', {
        action_type:  'update',
        category_id:  categoryId,
        period_type:  parsed.period_type,
        period_start: parsed.period_start,
        amount:       parsed.amount,
      })
      revalidatePath('/expenses/budgets')
      return { success: true, data: { id: existing.id } }
    }

    const { data, error } = await db
      .from('expense_budgets')
      .insert({
        category_id:  categoryId,
        period_type:  parsed.period_type,
        period_start: parsed.period_start,
        amount:       parsed.amount,
        notes:        parsed.notes ?? null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }

    await logHistory(data.id, 'created', 'budget_upserted', {
      action_type:  'create',
      category_id:  categoryId,
      period_type:  parsed.period_type,
      period_start: parsed.period_start,
      amount:       parsed.amount,
    })

    revalidatePath('/expenses/budgets')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('expense_budgets').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'budget_deleted', {})
    revalidatePath('/expenses/budgets')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── PHASE 3: Recurring templates ────────────────────────────────────────────

export async function createRecurringTemplate(input: unknown): Promise<ActionData<{ id: string }>> {
  try {
    const parsed = recurringTemplateFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error } = await db
      .from('recurring_expense_templates')
      .insert({
        name:                   parsed.name,
        category_id:            parsed.category_id,
        default_payee_id:       parsed.default_payee_id ?? null,
        default_amount:         parsed.default_amount ?? null,
        default_description:    parsed.default_description ?? null,
        default_payment_method: parsed.default_payment_method,
        day_of_month:           parsed.day_of_month,
        is_active:              parsed.is_active,
        notes:                  parsed.notes ?? null,
      })
      .select('id')
      .single()
    if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
    await logHistory(data.id, 'created', 'recurring_template_created', { name: parsed.name })
    revalidatePath('/expenses/recurring')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateRecurringTemplate(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = recurringTemplateFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('recurring_expense_templates')
      .update({
        name:                   parsed.name,
        category_id:            parsed.category_id,
        default_payee_id:       parsed.default_payee_id ?? null,
        default_amount:         parsed.default_amount ?? null,
        default_description:    parsed.default_description ?? null,
        default_payment_method: parsed.default_payment_method,
        day_of_month:           parsed.day_of_month,
        is_active:              parsed.is_active,
        notes:                  parsed.notes ?? null,
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'recurring_template_edited', { name: parsed.name })
    revalidatePath('/expenses/recurring')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function toggleRecurringTemplateActive(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data: cur } = await db
      .from('recurring_expense_templates')
      .select('is_active')
      .eq('id', id)
      .single()
    if (!cur) return { success: false, error: 'Template not found' }
    const next = !cur.is_active
    const { error } = await db
      .from('recurring_expense_templates')
      .update({ is_active: next })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'recurring_template_toggled', { is_active: next })
    revalidatePath('/expenses/recurring')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteRecurringTemplate(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('recurring_expense_templates').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory(id, 'edited', 'recurring_template_deleted', {})
    revalidatePath('/expenses/recurring')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Generates draft expenses for the given month from active templates that
 * haven't yet generated for that month. Idempotent: re-running for the same
 * month creates nothing new (each template's last_generated_for is updated).
 */
export async function generateMonthlyDrafts(
  monthIso: string,   // 'YYYY-MM'
): Promise<ActionData<{ generated: number; skipped: number }>> {
  try {
    const m = monthIso.match(/^(\d{4})-(\d{2})$/)
    if (!m) return { success: false, error: 'monthIso must be YYYY-MM' }
    const periodStart = `${m[1]}-${m[2]}-01`

    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    // Pull active templates not yet generated for this month
    const { data: templates, error: tErr } = await db
      .from('recurring_expense_templates')
      .select('*')
      .eq('is_active', true)
      .or(`last_generated_for.is.null,last_generated_for.lt.${periodStart}`)
    if (tErr) return { success: false, error: tErr.message }

    let generated = 0
    let skipped   = 0

    for (const t of (templates ?? []) as any[]) {
      // The expense_date for the draft = day_of_month within periodStart's month
      const day = String(Math.min(t.day_of_month, 28)).padStart(2, '0')
      const expense_date = `${m[1]}-${m[2]}-${day}`

      // Insert the draft expense
      const { error: insErr } = await db.from('expenses').insert({
        expense_date,
        category_id:           t.category_id,
        payee_id:              t.default_payee_id ?? null,
        description:           t.default_description ?? null,
        amount:                t.default_amount ?? 1,   // 1 BDT placeholder; constraint requires > 0
        payment_method:        t.default_payment_method ?? 'cash',
        is_draft:              true,
        recurring_template_id: t.id,
        created_by:            userId,
      })
      if (insErr) {
        skipped += 1
        continue
      }

      // Mark the template as generated for this period
      await db
        .from('recurring_expense_templates')
        .update({ last_generated_for: periodStart })
        .eq('id', t.id)

      generated += 1
    }

    await logHistory(periodStart, 'created', 'recurring_drafts_generated', {
      month:     monthIso,
      generated, skipped,
      template_count: (templates ?? []).length,
    })

    revalidatePath('/expenses/recurring')
    revalidatePath('/expenses/drafts')
    revalidatePath('/expenses')
    revalidatePath('/')
    return { success: true, data: { generated, skipped } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── PHASE 3: Drafts ─────────────────────────────────────────────────────────

export async function confirmDraftExpense(
  id: string,
  overrides: {
    amount?:          number
    description?:     string | null
    payment_method?:  PaymentMethod
    reference_number?: string | null
  } = {},
): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: cur } = await db.from('expenses').select('is_draft, amount').eq('id', id).single()
    if (!cur) return { success: false, error: 'Draft not found' }
    if (!cur.is_draft) return { success: false, error: 'Already confirmed' }

    const update: Record<string, unknown> = { is_draft: false }
    if (overrides.amount !== undefined) {
      if (overrides.amount <= 0) return { success: false, error: 'Amount must be > 0' }
      update.amount = overrides.amount
    }
    if (overrides.description !== undefined)      update.description      = overrides.description
    if (overrides.payment_method !== undefined)   update.payment_method   = overrides.payment_method
    if (overrides.reference_number !== undefined) update.reference_number = overrides.reference_number

    const { error } = await db.from('expenses').update(update).eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'draft_confirmed', { ...overrides })

    revalidatePath('/expenses/drafts')
    revalidatePath('/expenses')
    revalidatePath(`/expenses/${id}`)
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function discardDraftExpense(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: cur } = await db.from('expenses').select('is_draft').eq('id', id).single()
    if (!cur) return { success: false, error: 'Draft not found' }
    if (!cur.is_draft) return { success: false, error: 'Not a draft — use delete instead' }

    const { error } = await db.from('expenses').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    await logHistory(id, 'edited', 'draft_discarded', {})

    revalidatePath('/expenses/drafts')
    revalidatePath('/expenses')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
