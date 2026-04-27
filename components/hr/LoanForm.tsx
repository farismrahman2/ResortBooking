'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { loanFormSchema, type LoanFormInput } from '@/lib/validators/hr'
import { createLoan } from '@/lib/actions/loans'
import { toISODate } from '@/lib/formatters/dates'
import type { EmployeeWithCurrentSalary } from '@/lib/supabase/types'

interface Props {
  employees: Pick<EmployeeWithCurrentSalary, 'id' | 'employee_code' | 'full_name'>[]
}

export function LoanForm({ employees }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = toISODate(new Date())
  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1)

  const {
    register, handleSubmit, control,
    formState: { errors },
  } = useForm<LoanFormInput>({
    resolver: zodResolver(loanFormSchema),
    defaultValues: {
      employee_id:         '',
      principal:           0,
      monthly_installment: 0,
      taken_on:            today,
      repayment_starts:    toISODate(nextMonth),
      notes:               '',
    },
  })

  function onSubmit(values: LoanFormInput) {
    setError(null)
    startTransition(async () => {
      const r = await createLoan(values)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Record New Loan</h3>
      <Controller
        name="employee_id"
        control={control}
        render={({ field }) => (
          <Select
            label="Employee"
            required
            value={field.value ?? ''}
            onChange={(e) => field.onChange(e.target.value)}
            error={errors.employee_id?.message}
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employee_code} · {e.full_name}</option>
            ))}
          </Select>
        )}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Controller name="principal" control={control} render={({ field }) => (
          <NumberInput label="Principal" prefix="৳" value={field.value} onChange={field.onChange} error={errors.principal?.message} />
        )} />
        <Controller name="monthly_installment" control={control} render={({ field }) => (
          <NumberInput label="Monthly Installment" prefix="৳" value={field.value} onChange={field.onChange} error={errors.monthly_installment?.message} />
        )} />
        <Input label="Taken On" type="date" required {...register('taken_on')} />
        <Input label="Repayment Starts" type="date" required {...register('repayment_starts')} hint="First payroll month to deduct from." />
      </div>
      <Textarea label="Notes" rows={2} {...register('notes')} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" loading={pending}>Save Loan</Button>
      </div>
    </form>
  )
}
