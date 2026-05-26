'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createItem, updateItem } from '@/lib/actions/inventory'
import type { ItemFormInput } from '@/lib/validators/inventory'
import type { InvCategory, InvUnit, InvSupplier, InvItem } from '@/lib/supabase/types-inventory'

interface Props {
  storeId:    string
  storeSlug:  string
  categories: InvCategory[]
  units:      InvUnit[]
  suppliers:  InvSupplier[]
  item?:      InvItem        // present in edit mode
}

export function ItemForm({ storeId, storeSlug, categories, units, suppliers, item }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    sku_code:             item?.sku_code ?? '',
    name:                 item?.name ?? '',
    description:          item?.description ?? '',
    category_id:          item?.category_id ?? categories[0]?.id ?? '',
    unit_id:              item?.unit_id ?? units[0]?.id ?? '',
    item_type:            item?.item_type ?? 'consumable',
    par_level:            item?.par_level != null ? String(item.par_level) : '',
    reorder_point:        item?.reorder_point != null ? String(item.reorder_point) : '',
    default_supplier_id:  item?.default_supplier_id ?? '',
    allow_negative_stock: item?.allow_negative_stock ?? false,
    notes:                item?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function submit() {
    setError(null)
    const payload: ItemFormInput = {
      sku_code:             form.sku_code.trim() || null,
      name:                 form.name.trim(),
      description:          form.description.trim() || null,
      store_id:             storeId,
      category_id:          form.category_id,
      unit_id:              form.unit_id,
      item_type:            form.item_type as 'consumable' | 'operating_equipment',
      par_level:            form.par_level === '' ? null : Number(form.par_level),
      reorder_point:        form.reorder_point === '' ? null : Number(form.reorder_point),
      default_supplier_id:  form.default_supplier_id || null,
      allow_negative_stock: form.allow_negative_stock,
      notes:                form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = item ? await updateItem(item.id, payload) : await createItem(payload)
      if (!res.success) { setError(res.error); return }
      router.push(`/inventory/${storeSlug}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Input label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Category" required value={form.category_id}
          onChange={(e) => set('category_id', e.target.value)}
          options={categories.map((c) => ({ value: c.id, label: c.display_name }))}
        />
        <Select
          label="Unit" required value={form.unit_id}
          onChange={(e) => set('unit_id', e.target.value)}
          options={units.map((u) => ({ value: u.id, label: `${u.display_name} (${u.abbreviation})` }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Type" value={form.item_type}
          onChange={(e) => set('item_type', e.target.value as 'consumable' | 'operating_equipment')}
          options={[
            { value: 'consumable', label: 'Consumable' },
            { value: 'operating_equipment', label: 'Operating Equipment' },
          ]}
        />
        <Select
          label="Default supplier" value={form.default_supplier_id}
          onChange={(e) => set('default_supplier_id', e.target.value)}
        >
          <option value="">— None —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Par level" type="number" step="0.001" min="0"
          value={form.par_level} onChange={(e) => set('par_level', e.target.value)}
          hint="Target stock to keep on hand"
        />
        <Input
          label="Reorder point" type="number" step="0.001" min="0"
          value={form.reorder_point} onChange={(e) => set('reorder_point', e.target.value)}
          hint="Flag as low when stock falls to this"
        />
      </div>

      <Input
        label="SKU code" value={form.sku_code} onChange={(e) => set('sku_code', e.target.value)}
        hint="Leave blank to auto-generate (e.g. HK-LIN-001)"
      />

      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox" checked={form.allow_negative_stock}
          onChange={(e) => set('allow_negative_stock', e.target.checked)}
          className="accent-teal-600"
        />
        Allow negative stock (issues can drive this item below zero)
      </label>

      <div className="flex gap-2 pt-2">
        <Button onClick={submit} loading={pending} disabled={!form.name.trim() || !form.category_id || !form.unit_id}>
          {item ? 'Save changes' : 'Create item'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
