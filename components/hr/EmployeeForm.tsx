'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import {
  employeeFormSchema,
  type EmployeeFormInput,
} from '@/lib/validators/employees'
import { createEmployee, updateEmployee } from '@/lib/actions/employees'
import {
  DEPARTMENT_OPTIONS,
  GENDER_OPTIONS,
} from '@/components/hr/labels'
import { toISODate } from '@/lib/formatters/dates'
import type { EmployeeRow } from '@/lib/supabase/types'

interface EmployeeFormProps {
  /** When provided → edit mode. */
  existing?: EmployeeRow
  /** Auto-suggested code shown as placeholder when creating a new employee. */
  suggestedCode?: string
}

export function EmployeeForm({ existing, suggestedCode }: EmployeeFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const isEdit = !!existing

  const {
    register, handleSubmit, control,
    formState: { errors },
  } = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: existing
      ? {
          employee_code:    existing.employee_code,
          full_name:        existing.full_name,
          photo_url:        existing.photo_url ?? '',
          designation:      existing.designation,
          department:       existing.department,
          nid_number:       existing.nid_number ?? '',
          date_of_birth:    existing.date_of_birth ?? '',
          gender:           existing.gender ?? '',
          blood_group:      existing.blood_group ?? '',
          phone:            existing.phone,
          email:            existing.email ?? '',
          present_address:  existing.present_address ?? '',
          permanent_address:existing.permanent_address ?? '',
          emergency_contact_name:     existing.emergency_contact_name ?? '',
          emergency_contact_phone:    existing.emergency_contact_phone ?? '',
          emergency_contact_relation: existing.emergency_contact_relation ?? '',
          joining_date:     existing.joining_date,
          is_live_in:       existing.is_live_in,
          meal_allowance_in_kind: existing.meal_allowance_in_kind,
          notes:            existing.notes ?? '',
        }
      : {
          employee_code:    '',
          full_name:        '',
          photo_url:        '',
          designation:      '',
          department:       'frontdesk',
          nid_number:       '',
          date_of_birth:    '',
          gender:           '',
          blood_group:      '',
          phone:            '',
          email:            '',
          present_address:  '',
          permanent_address:'',
          emergency_contact_name:     '',
          emergency_contact_phone:    '',
          emergency_contact_relation: '',
          joining_date:     toISODate(new Date()),
          is_live_in:       false,
          meal_allowance_in_kind: false,
          notes:            '',
        },
  })

  function onSubmit(values: EmployeeFormInput) {
    setError(null)
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateEmployee(existing!.id, values)
          : await createEmployee(values)
        if (!result.success) { setError(result.error); return }
        const newId = isEdit ? existing!.id : (result as { success: true; data: { id: string } }).data.id
        router.push(`/hr/employees/${newId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Identity */}
      <Section title="Identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Employee Code"
            placeholder={suggestedCode ?? 'GCR-001'}
            hint={isEdit ? 'Editing — leave blank to keep current.' : 'Leave blank to auto-generate.'}
            error={errors.employee_code?.message}
            {...register('employee_code')}
          />
          <Input
            label="Full Name"
            required
            placeholder="Md. Karim Hossain"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Designation"
            required
            placeholder="Front Desk Officer"
            error={errors.designation?.message}
            {...register('designation')}
          />
          <Controller
            name="department"
            control={control}
            render={({ field }) => (
              <Select
                label="Department"
                required
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                error={errors.department?.message}
              >
                {DEPARTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          />
        </div>
      </Section>

      {/* Personal */}
      <Section title="Personal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="NID Number"
            placeholder="10 / 13 / 17 digit NID"
            {...register('nid_number')}
          />
          <Input
            label="Date of Birth"
            type="date"
            {...register('date_of_birth')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Controller
            name="gender"
            control={control}
            render={({ field }) => (
              <Select
                label="Gender"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || '')}
              >
                <option value="">—</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          />
          <Input
            label="Blood Group"
            placeholder="A+ / O- / etc."
            {...register('blood_group')}
          />
        </div>
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Phone"
            required
            placeholder="01XXXXXXXXX"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Email"
            type="email"
            placeholder="optional"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <Textarea
          label="Present Address"
          rows={2}
          {...register('present_address')}
        />
        <Textarea
          label="Permanent Address"
          rows={2}
          {...register('permanent_address')}
        />
      </Section>

      {/* Emergency */}
      <Section title="Emergency Contact">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Name" {...register('emergency_contact_name')} />
          <Input label="Phone" {...register('emergency_contact_phone')} />
          <Input label="Relation" placeholder="Father, Spouse, …" {...register('emergency_contact_relation')} />
        </div>
      </Section>

      {/* Employment */}
      <Section title="Employment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Joining Date"
            type="date"
            required
            error={errors.joining_date?.message}
            {...register('joining_date')}
          />
          <div className="flex flex-col gap-2 pt-6">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                {...register('is_live_in')}
              />
              Live-in staff (stays on premises)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                {...register('meal_allowance_in_kind')}
              />
              Meal allowance is in-kind (food provided, no cash)
            </label>
          </div>
        </div>
        <Textarea
          label="Internal Notes"
          rows={3}
          placeholder="Any internal notes about this employee…"
          {...register('notes')}
        />
      </Section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={pending}>
          {isEdit ? 'Save Changes' : 'Add Employee'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-sky-700">{title}</legend>
      {children}
    </fieldset>
  )
}
