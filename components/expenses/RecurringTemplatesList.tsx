'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2, Play } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  recurringTemplateFormSchema,
  type RecurringTemplateFormInput,
} from '@/lib/validators/expense'
import {
  createRecurringTemplate,
  updateRecurringTemplate,
  toggleRecurringTemplateActive,
  deleteRecurringTemplate,
  generateMonthlyDrafts,
} from '@/lib/actions/expenses'
import { formatBDT } from '@/lib/formatters/currency'
import { PAYMENT_METHOD_OPTIONS } from '@/components/expenses/labels'
import type {
  ExpenseCategoryRow,
  ExpensePayeeRow,
  RecurringExpenseTemplateRow,
} from '@/lib/supabase/types'

interface Props {
  templates:  RecurringExpenseTemplateRow[]
  categories: ExpenseCategoryRow[]
  payees:     ExpensePayeeRow[]
  defaultMonth: string   // YYYY-MM
}

export function RecurringTemplatesList({ templates, categories, payees, defaultMonth }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen]            = useState(false)
  const [editing, setEditing]      = useState<RecurringExpenseTemplateRow | null>(null)
  const [error,   setError]        = useState<string | null>(null)
  const [genMonth, setGenMonth]    = useState(defaultMonth)
  const [genResult, setGenResult]  = useState<string | null>(null)

  function openNew() { setEditing(null); setError(null); setOpen(true) }
  function openEdit(t: RecurringExpenseTemplateRow) { setEditing(t); setError(null); setOpen(true) }

  function handleToggle(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await toggleRecurringTemplateActive(id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this template? Existing draft expenses generated from it remain.')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteRecurringTemplate(id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  function handleGenerate() {
    setError(null)
    setGenResult(null)
    startTransition(async () => {
      const result = await generateMonthlyDrafts(genMonth)
      if (!result.success) {
        setError(result.error)
        return
      }
      setGenResult(`Generated ${result.data.generated} draft${result.data.generated !== 1 ? 's' : ''} (skipped ${result.data.skipped})`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Generate drafts banner */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-indigo-900">Generate Monthly Drafts</h3>
            <p className="mt-1 text-xs text-indigo-700">
              Creates draft expenses from every active template that hasn't yet generated for the chosen month.
              Drafts won't count toward totals until you confirm them on the <a href="/expenses/drafts" className="underline">drafts page</a>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={genMonth}
              onChange={(e) => setGenMonth(e.target.value)}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <Button variant="primary" size="sm" loading={pending} onClick={handleGenerate} className="gap-1.5">
              <Play size={12} />
              Generate
            </Button>
          </div>
        </div>
        {genResult && (
          <p className="mt-2 text-xs font-medium text-emerald-700">{genResult}</p>
        )}
      </div>

      {/* Templates table */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Recurring monthly expenses (salary, wifi, electricity, etc.). Auto-generated as drafts on the day-of-month you specify.
        </p>
        <Button variant="primary" size="sm" onClick={openNew} className="gap-1.5">
          <Plus size={14} />
          New Template
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Payee</th>
              <th className="px-4 py-2.5 font-medium">Day</th>
              <th className="px-4 py-2.5 text-right font-medium">Default Amount</th>
              <th className="px-4 py-2.5 font-medium">Last Generated</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {templates.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                  No templates yet. Add one to start auto-generating recurring drafts.
                </td>
              </tr>
            )}
            {templates.map((t) => {
              const cat   = categories.find((c) => c.id === t.category_id)
              const payee = t.default_payee_id ? payees.find((p) => p.id === t.default_payee_id) : null
              return (
                <tr key={t.id} className={t.is_active ? '' : 'bg-gray-50/60 text-gray-400'}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{t.name}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{cat?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{payee?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.day_of_month}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-800">
                    {t.default_amount === null ? <span className="text-gray-400">manual</span> : formatBDT(t.default_amount)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums">
                    {t.last_generated_for ?? <span className="text-gray-400 italic">never</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.is_active
                      ? <span className="inline-flex rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px] font-semibold">Active</span>
                      : <span className="inline-flex rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold">Paused</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => openEdit(t)}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleToggle(t.id)}
                        disabled={pending}
                        className="rounded px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                      >
                        {t.is_active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={pending}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <RecurringTemplateFormModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        categories={categories}
        payees={payees}
      />
    </div>
  )
}

function RecurringTemplateFormModal({
  open, onClose, editing, categories, payees,
}: {
  open: boolean
  onClose: () => void
  editing: RecurringExpenseTemplateRow | null
  categories: ExpenseCategoryRow[]
  payees:     ExpensePayeeRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!editing

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<RecurringTemplateFormInput>({
    resolver: zodResolver(recurringTemplateFormSchema),
    values: editing
      ? {
          name:                   editing.name,
          category_id:            editing.category_id,
          default_payee_id:       editing.default_payee_id ?? undefined,
          default_amount:         editing.default_amount ?? undefined,
          default_description:    editing.default_description ?? '',
          default_payment_method: editing.default_payment_method,
          day_of_month:           editing.day_of_month,
          is_active:              editing.is_active,
          notes:                  editing.notes ?? '',
        }
      : {
          name: '', category_id: '', default_payee_id: undefined,
          default_amount: undefined, default_description: '',
          default_payment_method: 'cash',
          day_of_month: 1, is_active: true, notes: '',
        },
  })

  function onSubmit(values: RecurringTemplateFormInput) {
    setError(null)
    startTransition(async () => {
      const result = isEdit
        ? await updateRecurringTemplate(editing!.id, values)
        : await createRecurringTemplate(values)
      if (!result.success) { setError(result.error); return }
      onClose(); reset(); router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Template' : 'New Template'} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Template name" required placeholder="Monthly Wifi Bill" error={errors.name?.message} {...register('name')} />

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="category_id"
            control={control}
            render={({ field }) => (
              <Select label="Category" required value={field.value} onChange={(e) => field.onChange(e.target.value)} error={errors.category_id?.message}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            )}
          />
          <Controller
            name="default_payee_id"
            control={control}
            render={({ field }) => (
              <Select label="Default payee (optional)" value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)}>
                <option value="">No payee</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Controller
            name="day_of_month"
            control={control}
            render={({ field }) => (
              <NumberInput label="Day of month" value={field.value} onChange={(v) => field.onChange(Math.max(1, Math.min(28, v)))} />
            )}
          />
          <Controller
            name="default_amount"
            control={control}
            render={({ field }) => (
              <NumberInput
                label="Default amount (BDT)"
                prefix="৳"
                value={field.value ?? 0}
                onChange={(v) => field.onChange(v > 0 ? v : null)}
                hint="Leave 0 if it varies each month"
              />
            )}
          />
          <Controller
            name="default_payment_method"
            control={control}
            render={({ field }) => (
              <Select label="Payment method" value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                {PAYMENT_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          />
        </div>

        <Input label="Default description" placeholder="Monthly wifi bill" {...register('default_description')} />

        <Textarea label="Notes (internal)" rows={2} {...register('notes')} />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" {...register('is_active')} className="rounded border-gray-300 text-forest-600" />
          Active (will generate drafts each month)
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
