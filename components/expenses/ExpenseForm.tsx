'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Paperclip, X, FileText } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { expenseFormSchema, type ExpenseFormInput } from '@/lib/validators/expense'
import { createExpense, updateExpense, attachReceipt } from '@/lib/actions/expenses'
import { createClient } from '@/lib/supabase/client'
import { PAYMENT_METHOD_OPTIONS } from '@/components/expenses/labels'
import { QuickAddCategoryModal } from '@/components/expenses/QuickAddCategoryModal'
import { QuickAddPayeeModal } from '@/components/expenses/QuickAddPayeeModal'
import { toISODate } from '@/lib/formatters/dates'
import type { ExpenseCategoryRow, ExpensePayeeRow, ExpenseRowWithRefs } from '@/lib/supabase/types'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
const MAX_BYTES    = 10 * 1024 * 1024  // 10 MB

interface ExpenseFormProps {
  categories: ExpenseCategoryRow[]
  payees:     ExpensePayeeRow[]
  existing?:  ExpenseRowWithRefs   // edit mode when provided
}

export function ExpenseForm({ categories, payees, existing }: ExpenseFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  // Local state so quick-add can append new categories/payees without a page refresh.
  // Initialised from props; the server `router.refresh()` keeps server data in sync after creation.
  const [localCategories, setLocalCategories] = useState<ExpenseCategoryRow[]>(categories)
  const [localPayees,     setLocalPayees]     = useState<ExpensePayeeRow[]>(payees)
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false)
  const [quickPayeeOpen,    setQuickPayeeOpen]    = useState(false)

  // Pending receipt files (create-mode only — we can only upload after we know the expense id)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!existing

  const {
    register, handleSubmit, control, watch, setValue,
    formState: { errors },
  } = useForm<ExpenseFormInput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: existing
      ? {
          expense_date:     existing.expense_date,
          category_id:      existing.category_id,
          payee_id:         existing.payee_id ?? undefined,
          description:      existing.description ?? '',
          amount:           Number(existing.amount),
          payment_method:   existing.payment_method,
          reference_number: existing.reference_number ?? '',
          notes:            existing.notes ?? '',
        }
      : {
          expense_date:    toISODate(new Date()),
          category_id:     '',
          payee_id:        undefined,
          description:     '',
          amount:          0,
          payment_method:  'cash',
          reference_number:'',
          notes:           '',
        },
  })

  const selectedCategoryId = watch('category_id')
  const paymentMethod      = watch('payment_method')

  const selectedCategory = useMemo(
    () => localCategories.find((c) => c.id === selectedCategoryId) ?? null,
    [localCategories, selectedCategoryId],
  )

  function handleCategoryCreated(newCat: ExpenseCategoryRow) {
    setLocalCategories((prev) => {
      const next = [...prev, newCat]
      next.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      return next
    })
    setValue('category_id', newCat.id)
  }

  function handlePayeeCreated(newPayee: ExpensePayeeRow) {
    setLocalPayees((prev) => {
      const next = [...prev, newPayee]
      next.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      return next
    })
    setValue('payee_id', newPayee.id)
  }

  // Description and payee fields are ALWAYS shown — only the label and required-flag change.
  // (Hiding them prevented users from adding optional notes/payees, which is a frequent need.)
  const payeeRequired       = selectedCategory?.requires_payee ?? false
  const descriptionRequired = selectedCategory?.requires_description ?? false
  const showReferenceField  = paymentMethod !== 'cash'

  function addPendingFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return
    const errors: string[] = []
    const accepted: File[] = []
    for (const f of Array.from(filesList)) {
      if (!ALLOWED_MIME.includes(f.type as typeof ALLOWED_MIME[number])) {
        errors.push(`${f.name}: only JPEG, PNG, WebP, or PDF accepted`)
        continue
      }
      if (f.size > MAX_BYTES) {
        errors.push(`${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB exceeds 10 MB limit`)
        continue
      }
      if (f.size === 0) {
        errors.push(`${f.name}: empty file`)
        continue
      }
      accepted.push(f)
    }
    if (errors.length > 0) setError(errors.join('\n'))
    if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  /**
   * Uploads all pending files to Storage under the new expense's folder, then
   * records each via attachReceipt. Returns the count of failures (0 = all ok).
   */
  async function uploadPendingReceipts(expenseId: string, expenseDate: string): Promise<number> {
    if (pendingFiles.length === 0) return 0
    const supabase = createClient()
    const [y, m] = expenseDate.split('-')
    let failures = 0
    for (let i = 0; i < pendingFiles.length; i++) {
      const f = pendingFiles[i]
      setUploadProgress(`Uploading ${i + 1} of ${pendingFiles.length}: ${f.name}`)
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${y}/${m}/${expenseId}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase
        .storage
        .from('expense-receipts')
        .upload(storagePath, f, { contentType: f.type, upsert: false })
      if (upErr) { failures += 1; continue }
      const result = await attachReceipt({
        expense_id:   expenseId,
        storage_path: storagePath,
        file_name:    f.name,
        mime_type:    f.type as typeof ALLOWED_MIME[number],
        size_bytes:   f.size,
      })
      if (!result.success) {
        // Clean up the storage object — its DB row didn't get recorded
        await supabase.storage.from('expense-receipts').remove([storagePath])
        failures += 1
      }
    }
    setUploadProgress(null)
    return failures
  }

  function onSubmit(values: ExpenseFormInput) {
    setError(null)
    setUploadProgress(null)

    // Per-category requirements aren't in the Zod schema (they depend on the
    // selected category which is dynamic). Enforce them here.
    if (payeeRequired && !values.payee_id) {
      setError(`A payee is required for ${selectedCategory?.name ?? 'this category'}.`)
      return
    }
    if (descriptionRequired && !values.description?.trim()) {
      setError(`A description is required for ${selectedCategory?.name ?? 'this category'}.`)
      return
    }

    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateExpense(existing!.id, values)
          : await createExpense(values)
        if (!result.success) {
          setError(result.error)
          return
        }

        const newExpenseId = isEdit ? existing!.id : (result as any).data.id

        // Upload any pending receipts (create-mode only). Edit-mode users use the
        // ReceiptUploader on the edit page.
        if (!isEdit && pendingFiles.length > 0) {
          const failures = await uploadPendingReceipts(newExpenseId, values.expense_date)
          if (failures > 0) {
            setError(`Expense saved, but ${failures} of ${pendingFiles.length} receipt${pendingFiles.length !== 1 ? 's' : ''} failed to upload. You can retry from the detail page.`)
            // Still navigate — the expense exists and partial uploads are recorded
            setTimeout(() => router.push(`/expenses/${newExpenseId}`), 1500)
            return
          }
        }

        router.push(`/expenses/${newExpenseId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Expense Date"
          type="date"
          required
          error={errors.expense_date?.message}
          {...register('expense_date')}
        />

        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Controller
              name="category_id"
              control={control}
              render={({ field }) => (
                <Select
                  label="Category"
                  required
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  error={errors.category_id?.message}
                >
                  <option value="">Select a category…</option>
                  {localCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              )}
            />
          </div>
          <button
            type="button"
            onClick={() => setQuickCategoryOpen(true)}
            title="Add new category"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Controller
            name="payee_id"
            control={control}
            render={({ field }) => (
              <Select
                label={payeeRequired ? 'Payee (required)' : 'Payee (optional)'}
                required={payeeRequired}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
              >
                <option value="">No payee</option>
                {localPayees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
          />
        </div>
        <button
          type="button"
          onClick={() => setQuickPayeeOpen(true)}
          title="Add new payee"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <Input
        label={descriptionRequired ? 'Description (required)' : 'Description (optional)'}
        required={descriptionRequired}
        placeholder={descriptionRequired ? 'What was purchased?' : 'Optional details…'}
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Controller
          name="amount"
          control={control}
          render={({ field }) => (
            <NumberInput
              label="Amount"
              prefix="৳"
              value={field.value}
              onChange={(v) => field.onChange(v)}
              error={errors.amount?.message}
            />
          )}
        />

        <Controller
          name="payment_method"
          control={control}
          render={({ field }) => (
            <Select
              label="Payment Method"
              value={field.value}
              onChange={(e) => {
                field.onChange(e.target.value)
                if (e.target.value === 'cash') setValue('reference_number', '')
              }}
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        />
      </div>

      {showReferenceField && (
        <Input
          label="Reference / Transaction ID"
          placeholder="bKash trxID, cheque number, etc."
          {...register('reference_number')}
        />
      )}

      <Textarea
        label="Notes (optional)"
        rows={2}
        placeholder="Internal notes…"
        {...register('notes')}
      />

      {/* Receipt attach — create mode only. Edit page has a separate full uploader. */}
      {!isEdit && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 inline-flex items-center gap-1.5">
              <Paperclip size={12} />
              Receipts (optional)
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-forest-300 bg-white px-2.5 py-1 text-xs font-medium text-forest-700 hover:bg-forest-50 transition-colors disabled:opacity-50"
            >
              <Plus size={12} />
              Add files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              onChange={(e) => addPendingFiles(e.target.files)}
              disabled={pending}
              className="hidden"
            />
          </div>
          {pendingFiles.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              JPEG / PNG / WebP / PDF · max 10 MB each. Files upload after you save.
            </p>
          ) : (
            <ul className="space-y-1">
              {pendingFiles.map((f, idx) => (
                <li key={idx} className="flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 text-gray-700 min-w-0">
                    <FileText size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="truncate" title={f.name}>{f.name}</span>
                    <span className="text-gray-400 tabular-nums flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    disabled={pending}
                    className="ml-2 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {uploadProgress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {uploadProgress}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          variant="outline"
          size="md"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={pending}>
          {isEdit ? 'Save Changes' : 'Save Expense'}
        </Button>
      </div>

      <QuickAddCategoryModal
        open={quickCategoryOpen}
        onClose={() => setQuickCategoryOpen(false)}
        onCreated={handleCategoryCreated}
      />
      <QuickAddPayeeModal
        open={quickPayeeOpen}
        onClose={() => setQuickPayeeOpen(false)}
        onCreated={handlePayeeCreated}
      />
    </form>
  )
}
