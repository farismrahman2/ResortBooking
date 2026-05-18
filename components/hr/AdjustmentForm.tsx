'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { adjustmentFormSchema, type AdjustmentFormInput } from '@/lib/validators/hr'
import { createAdjustment } from '@/lib/actions/salary-adjustments'
import { SALARY_ADJUSTMENT_OPTIONS } from '@/components/hr/labels'

interface Props {
  employeeId: string
}

function thisMonthFirst(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function AdjustmentForm({ employeeId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const {
    register, handleSubmit, control, reset,
    formState: { errors },
  } = useForm<AdjustmentFormInput>({
    resolver: zodResolver(adjustmentFormSchema),
    defaultValues: {
      employee_id:      employeeId,
      applies_to_month: thisMonthFirst(),
      type:             'bonus',
      amount:           0,
      description:      '',
    },
  })

  function onSubmit(values: AdjustmentFormInput) {
    setError(null)
    startTransition(async () => {
      const r = await createAdjustment({ ...values, employee_id: employeeId })
      if (!r.success) { setError(r.error); return }
      reset({
        employee_id:      employeeId,
        applies_to_month: thisMonthFirst(),
        type:             'bonus',
        amount:           0,
        description:      '',
      })
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>+ Add Adjustment</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Salary Adjustment">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Input
            label="Applies to Month (1st of month)"
            type="date"
            required
            error={errors.applies_to_month?.message}
            {...register('applies_to_month')}
          />
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <Select
                label="Type"
                required
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
              >
                {SALARY_ADJUSTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          />
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <NumberInput label="Amount" prefix="৳" value={field.value} onChange={field.onChange} error={errors.amount?.message} />
            )}
          />
          <Textarea label="Description (optional)" rows={2} {...register('description')} />
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="md" loading={pending}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
