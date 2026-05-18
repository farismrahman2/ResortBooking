'use client'

import { useState, useTransition, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import {
  salaryStructureFormSchema,
  type SalaryStructureFormInput,
} from '@/lib/validators/employees'
import { setSalaryStructure } from '@/lib/actions/employees'
import { formatBDT } from '@/lib/formatters/currency'
import { toISODate } from '@/lib/formatters/dates'
import type { SalaryStructureRow } from '@/lib/supabase/types'

interface Props {
  employeeId: string
  current?: SalaryStructureRow | null
  onSaved?: () => void
}

export function SalaryStructureForm({ employeeId, current, onSaved }: Props) {
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)
  const [savedAt, setSavedAt]      = useState<string | null>(null)

  const {
    register, handleSubmit, control, watch,
    formState: { errors },
  } = useForm<SalaryStructureFormInput>({
    resolver: zodResolver(salaryStructureFormSchema),
    defaultValues: {
      effective_from:  toISODate(new Date()),
      basic:           current ? Number(current.basic) : 0,
      house_rent:      current ? Number(current.house_rent) : 0,
      medical:         current ? Number(current.medical) : 0,
      transport:       current ? Number(current.transport) : 0,
      mobile:          current ? Number(current.mobile) : 0,
      other_allowance: current ? Number(current.other_allowance) : 0,
      notes:           '',
    },
  })

  const basic           = Number(watch('basic') ?? 0)
  const house_rent      = Number(watch('house_rent') ?? 0)
  const medical         = Number(watch('medical') ?? 0)
  const transport       = Number(watch('transport') ?? 0)
  const mobile          = Number(watch('mobile') ?? 0)
  const other_allowance = Number(watch('other_allowance') ?? 0)

  const gross = useMemo(
    () => basic + house_rent + medical + transport + mobile + other_allowance,
    [basic, house_rent, medical, transport, mobile, other_allowance],
  )

  function onSubmit(values: SalaryStructureFormInput) {
    setError(null)
    startTransition(async () => {
      const result = await setSalaryStructure(employeeId, values)
      if (!result.success) { setError(result.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      onSaved?.()
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {current ? 'Update Salary Structure' : 'Set Initial Salary'}
        </h3>
        {current && (
          <span className="text-xs text-gray-500">
            Current effective from {current.effective_from}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 -mt-2">
        Saving creates a new effective-dated row. The previous structure is closed
        on the day before <em>Effective From</em>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Effective From"
          type="date"
          required
          error={errors.effective_from?.message}
          {...register('effective_from')}
        />
        <div className="flex items-end">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 w-full">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-sky-700">Gross (auto)</p>
            <p className="font-mono text-lg font-bold text-sky-900 tabular-nums">{formatBDT(gross)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Controller name="basic" control={control} render={({ field }) => (
          <NumberInput label="Basic" prefix="৳" value={field.value} onChange={field.onChange} error={errors.basic?.message} />
        )} />
        <Controller name="house_rent" control={control} render={({ field }) => (
          <NumberInput label="House Rent" prefix="৳" value={field.value} onChange={field.onChange} />
        )} />
        <Controller name="medical" control={control} render={({ field }) => (
          <NumberInput label="Medical" prefix="৳" value={field.value} onChange={field.onChange} />
        )} />
        <Controller name="transport" control={control} render={({ field }) => (
          <NumberInput label="Transport" prefix="৳" value={field.value} onChange={field.onChange} />
        )} />
        <Controller name="mobile" control={control} render={({ field }) => (
          <NumberInput label="Mobile" prefix="৳" value={field.value} onChange={field.onChange} />
        )} />
        <Controller name="other_allowance" control={control} render={({ field }) => (
          <NumberInput label="Other Allowance" prefix="৳" value={field.value} onChange={field.onChange} />
        )} />
      </div>

      <Textarea label="Notes (optional)" rows={2} {...register('notes')} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Saved at {savedAt}.
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" loading={pending}>
          {current ? 'Save New Structure' : 'Set Salary'}
        </Button>
      </div>
    </form>
  )
}
