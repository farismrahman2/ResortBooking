'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { categoryFormSchema, type CategoryFormInput } from '@/lib/validators/expense'
import { createCategory } from '@/lib/actions/expenses'
import { CATEGORY_GROUP_OPTIONS } from '@/components/expenses/labels'
import type { ExpenseCategoryRow, ExpenseCategoryGroup } from '@/lib/supabase/types'

interface QuickAddCategoryModalProps {
  open:      boolean
  onClose:   () => void
  /** Called with the freshly-created category so the parent can append it to its dropdown and select it. */
  onCreated: (newCategory: ExpenseCategoryRow) => void
}

/** Auto-generate a slug from a name. Must match the validator: 2-60 chars, lowercase + digits + underscore. */
function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60)
}

export function QuickAddCategoryModal({ open, onClose, onCreated }: QuickAddCategoryModalProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const {
    register, control, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '', slug: '', category_group: 'miscellaneous',
      requires_description: false, requires_payee: false,
      is_active: true, display_order: 200,
    },
  })

  // Reset every time we open
  useEffect(() => {
    if (open) {
      reset({
        name: '', slug: '', category_group: 'miscellaneous',
        requires_description: false, requires_payee: false,
        is_active: true, display_order: 200,
      })
      setError(null)
    }
  }, [open, reset])

  // Auto-fill slug as the user types the name
  const watchedName = watch('name')
  useEffect(() => {
    if (watchedName) setValue('slug', slugify(watchedName))
  }, [watchedName, setValue])

  function onSubmit(values: CategoryFormInput) {
    setError(null)
    startTransition(async () => {
      const result = await createCategory(values)
      if (!result.success) { setError(result.error); return }
      // Pass back a row shaped like ExpenseCategoryRow so the parent can append it.
      onCreated({
        id:                   result.data.id,
        name:                 values.name,
        slug:                 values.slug,
        category_group:       values.category_group as ExpenseCategoryGroup,
        requires_description: values.requires_description,
        requires_payee:       values.requires_payee,
        is_active:            values.is_active,
        display_order:        values.display_order,
        created_at:           new Date().toISOString(),
      })
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Category" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <Input
          label="Name"
          required
          autoFocus
          placeholder="e.g. Office Supplies"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Slug"
          required
          placeholder="auto-generated"
          hint="Auto-fills from the name. Edit if you want a different code."
          error={errors.slug?.message}
          {...register('slug')}
        />
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
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...register('requires_description')} className="rounded border-gray-300 text-forest-600" />
            Requires description
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...register('requires_payee')} className="rounded border-gray-300 text-forest-600" />
            Requires payee
          </label>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <p className="text-[10px] text-gray-400 italic">
          You can fine-tune display order, group, and requirements later in the <a href="/expenses/categories" className="underline">categories admin page</a>.
        </p>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}
