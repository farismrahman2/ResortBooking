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
import { Button } from '@/components/ui/Button'
import { categoryFormSchema, type CategoryFormInput } from '@/lib/validators/expense'
import { createCategory, updateCategory, toggleCategoryActive } from '@/lib/actions/expenses'
import { CATEGORY_GROUP_OPTIONS, CATEGORY_GROUP_BADGE } from '@/components/expenses/labels'
import type { ExpenseCategoryRow } from '@/lib/supabase/types'

interface CategoryManagerProps {
  categories: ExpenseCategoryRow[]
}

export function CategoryManager({ categories }: CategoryManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen]            = useState(false)
  const [editing, setEditing]      = useState<ExpenseCategoryRow | null>(null)
  const [error, setError]          = useState<string | null>(null)

  function openNew() {
    setEditing(null); setError(null); setOpen(true)
  }

  function openEdit(cat: ExpenseCategoryRow) {
    setEditing(cat); setError(null); setOpen(true)
  }

  function handleToggleActive(id: string) {
    startTransition(async () => {
      const result = await toggleCategoryActive(id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Categories drive both data entry and reporting. Use deactivate (not delete) to retire a category — there may be expenses referencing it.
        </p>
        <Button variant="primary" size="sm" onClick={openNew} className="gap-1.5">
          <Plus size={14} />
          Add Category
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 font-medium">Group</th>
              <th className="px-4 py-2.5 font-medium">Required</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((c) => (
              <tr key={c.id} className={c.is_active ? '' : 'bg-gray-50/60 text-gray-400'}>
                <td className="px-4 py-2.5 font-mono text-xs">{c.display_order}</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{c.slug}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_GROUP_BADGE[c.category_group]}`}>
                    {c.category_group.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {[c.requires_description && 'description', c.requires_payee && 'payee'].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {c.is_active
                    ? <span className="inline-flex rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[10px] font-semibold">Active</span>
                    : <span className="inline-flex rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold">Inactive</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(c.id)}
                      disabled={pending}
                      className="rounded px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {c.is_active ? 'Deactivate' : 'Reactivate'}
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

      <CategoryFormModal
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
      />
    </div>
  )
}

function CategoryFormModal({
  open, onClose, editing,
}: {
  open: boolean
  onClose: () => void
  editing: ExpenseCategoryRow | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!editing
  const slugLocked = isEdit   // Don't let slug change once a category exists

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    values: editing
      ? {
          name:                 editing.name,
          slug:                 editing.slug,
          category_group:       editing.category_group,
          requires_description: editing.requires_description,
          requires_payee:       editing.requires_payee,
          is_active:            editing.is_active,
          display_order:        editing.display_order,
        }
      : {
          name: '', slug: '', category_group: 'miscellaneous',
          requires_description: false, requires_payee: false, is_active: true,
          display_order: 100,
        },
  })

  function onSubmit(values: CategoryFormInput) {
    setError(null)
    startTransition(async () => {
      const result = isEdit ? await updateCategory(editing!.id, values) : await createCategory(values)
      if (!result.success) { setError(result.error); return }
      onClose(); reset(); router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Category' : 'New Category'} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" required placeholder="Groceries (Daily Bazar)" error={errors.name?.message} {...register('name')} />
          <Input
            label="Slug"
            required
            placeholder="groceries"
            disabled={slugLocked}
            hint={slugLocked ? 'Locked once category has been used' : 'lowercase, underscore-separated'}
            error={errors.slug?.message}
            {...register('slug')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="category_group"
            control={control}
            render={({ field }) => (
              <Select label="Group" required value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                {CATEGORY_GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          />
          <Controller
            name="display_order"
            control={control}
            render={({ field }) => (
              <NumberInput label="Display order" value={field.value} onChange={(v) => field.onChange(v)} />
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...register('requires_description')} className="rounded border-gray-300 text-forest-600" />
            Require description
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...register('requires_payee')} className="rounded border-gray-300 text-forest-600" />
            Require payee
          </label>
        </div>
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
