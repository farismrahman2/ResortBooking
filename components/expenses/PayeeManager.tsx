'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { payeeFormSchema, type PayeeFormInput } from '@/lib/validators/expense'
import { createPayee, updatePayee, togglePayeeActive } from '@/lib/actions/expenses'
import { PAYEE_TYPE_OPTIONS, PAYEE_TYPE_LABELS } from '@/components/expenses/labels'
import type { ExpensePayeeRow, PayeeType } from '@/lib/supabase/types'

interface PayeeManagerProps {
  payees: ExpensePayeeRow[]
}

export function PayeeManager({ payees }: PayeeManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter,  setFilter]       = useState<PayeeType | 'all'>('all')
  const [open, setOpen]            = useState(false)
  const [editing, setEditing]      = useState<ExpensePayeeRow | null>(null)
  const [error,   setError]        = useState<string | null>(null)

  const filtered = filter === 'all' ? payees : payees.filter((p) => p.payee_type === filter)

  function openNew() { setEditing(null); setError(null); setOpen(true) }
  function openEdit(p: ExpensePayeeRow) { setEditing(p); setError(null); setOpen(true) }

  function handleToggleActive(id: string) {
    startTransition(async () => {
      const result = await togglePayeeActive(id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Payees are vendors, contractors, staff, and utilities you pay. Deactivate (don't delete) to retire.
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as PayeeType | 'all')}
            className="min-w-[140px]"
          >
            <option value="all">All types</option>
            {PAYEE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Button variant="primary" size="sm" onClick={openNew} className="gap-1.5">
            <Plus size={14} />
            Add Payee
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Notes</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                  No payees match this filter.
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'bg-gray-50/60 text-gray-400'}>
                <td className="px-4 py-2.5 font-mono text-xs">{p.display_order}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600">{PAYEE_TYPE_LABELS[p.payee_type]}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600">{p.phone ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[300px] truncate">{p.notes ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs">
                  {p.is_active
                    ? <span className="inline-flex rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px] font-semibold">Active</span>
                    : <span className="inline-flex rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold">Inactive</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(p.id)}
                      disabled={pending}
                      className="rounded px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {p.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <PayeeFormModal open={open} onClose={() => setOpen(false)} editing={editing} />
    </div>
  )
}

function PayeeFormModal({
  open, onClose, editing,
}: {
  open: boolean
  onClose: () => void
  editing: ExpensePayeeRow | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const isEdit = !!editing

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<PayeeFormInput>({
    resolver: zodResolver(payeeFormSchema),
    values: editing
      ? {
          name:          editing.name,
          payee_type:    editing.payee_type,
          phone:         editing.phone ?? '',
          notes:         editing.notes ?? '',
          is_active:     editing.is_active,
          display_order: editing.display_order,
        }
      : {
          name: '', payee_type: 'supplier', phone: '', notes: '',
          is_active: true, display_order: 100,
        },
  })

  function onSubmit(values: PayeeFormInput) {
    setError(null)
    startTransition(async () => {
      const result = isEdit ? await updatePayee(editing!.id, values) : await createPayee(values)
      if (!result.success) { setError(result.error); return }
      onClose(); reset(); router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Payee' : 'New Payee'} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" required placeholder="Al Amin" error={errors.name?.message} {...register('name')} />
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" placeholder="01700000000" {...register('phone')} />
          <Controller
            name="display_order"
            control={control}
            render={({ field }) => (
              <NumberInput label="Display order" value={field.value} onChange={(v) => field.onChange(v)} />
            )}
          />
        </div>
        <Textarea label="Notes" rows={2} placeholder="What this payee is paid for…" {...register('notes')} />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" {...register('is_active')} className="rounded border-gray-300 text-forest-600" />
          Active
        </label>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
