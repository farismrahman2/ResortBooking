'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { payeeFormSchema, type PayeeFormInput } from '@/lib/validators/expense'
import { createPayee } from '@/lib/actions/expenses'
import { PAYEE_TYPE_OPTIONS } from '@/components/expenses/labels'
import type { ExpensePayeeRow, PayeeType } from '@/lib/supabase/types'

interface QuickAddPayeeModalProps {
  open:      boolean
  onClose:   () => void
  onCreated: (newPayee: ExpensePayeeRow) => void
  /** Optional default — useful if the form context implies a specific type (e.g. groceries → supplier). */
  defaultType?: PayeeType
}

export function QuickAddPayeeModal({ open, onClose, onCreated, defaultType }: QuickAddPayeeModalProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const {
    register, control, handleSubmit, reset,
    formState: { errors },
  } = useForm<PayeeFormInput>({
    resolver: zodResolver(payeeFormSchema),
    defaultValues: {
      name: '', payee_type: defaultType ?? 'other',
      phone: '', notes: '', is_active: true, display_order: 200,
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: '', payee_type: defaultType ?? 'other',
        phone: '', notes: '', is_active: true, display_order: 200,
      })
      setError(null)
    }
  }, [open, reset, defaultType])

  function onSubmit(values: PayeeFormInput) {
    setError(null)
    startTransition(async () => {
      const result = await createPayee(values)
      if (!result.success) { setError(result.error); return }
      onCreated({
        id:            result.data.id,
        name:          values.name,
        payee_type:    values.payee_type as PayeeType,
        phone:         values.phone ?? null,
        notes:         values.notes ?? null,
        is_active:     values.is_active,
        display_order: values.display_order,
        created_at:    new Date().toISOString(),
      })
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Payee" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          label="Name"
          required
          autoFocus
          placeholder="e.g. Karim Tea Stall"
          error={errors.name?.message}
          {...register('name')}
        />
        <Controller
          name="payee_type"
          control={control}
          render={({ field }) => (
            <Select label="Type" required value={field.value} onChange={(e) => field.onChange(e.target.value)}>
              {PAYEE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        />
        <Input
          label="Phone (optional)"
          placeholder="01700000000"
          {...register('phone')}
        />
        <Textarea
          label="Notes (optional)"
          rows={2}
          placeholder="What this payee is paid for…"
          {...register('notes')}
        />

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <p className="text-[10px] text-gray-400 italic">
          Manage display order and other details later from the <a href="/expenses/payees" className="underline">payees page</a>.
        </p>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}
