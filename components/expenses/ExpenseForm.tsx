'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { expenseFormSchema, type ExpenseFormInput } from '@/lib/validators/expense'
import { createExpense, updateExpense } from '@/lib/actions/expenses'
import { PAYMENT_METHOD_OPTIONS } from '@/components/expenses/labels'
import { toISODate } from '@/lib/formatters/dates'
import type { ExpenseCategoryRow, ExpensePayeeRow, ExpenseRowWithRefs } from '@/lib/supabase/types'

interface ExpenseFormProps {
  categories: ExpenseCategoryRow[]
  payees:     ExpensePayeeRow[]
  existing?:  ExpenseRowWithRefs   // edit mode when provided
}

export function ExpenseForm({ categories, payees, existing }: ExpenseFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

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
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  )

  const showPayeeField       = selectedCategory?.requires_payee ?? true   // default: show
  const showDescriptionField = selectedCategory?.requires_description ?? true
  const showReferenceField   = paymentMethod !== 'cash'

  function onSubmit(values: ExpenseFormInput) {
    setError(null)
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateExpense(existing!.id, values)
          : await createExpense(values)
        if (!result.success) {
          setError(result.error)
          return
        }
        if (isEdit) router.push(`/expenses/${existing!.id}`)
        else        router.push(`/expenses/${(result as any).data.id}`)
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        />
      </div>

      {showPayeeField && (
        <Controller
          name="payee_id"
          control={control}
          render={({ field }) => (
            <Select
              label={selectedCategory?.requires_payee ? 'Payee (required)' : 'Payee (optional)'}
              required={selectedCategory?.requires_payee}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            >
              <option value="">No payee</option>
              {payees.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          )}
        />
      )}

      {showDescriptionField && (
        <Input
          label={selectedCategory?.requires_description ? 'Description (required)' : 'Description (optional)'}
          required={selectedCategory?.requires_description}
          placeholder={selectedCategory?.requires_description
            ? 'What was purchased?'
            : 'Optional details…'}
          error={errors.description?.message}
          {...register('description')}
        />
      )}

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
    </form>
  )
}
