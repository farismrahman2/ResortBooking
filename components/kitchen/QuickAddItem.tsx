'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { createKitchenItem } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import { joinItemName } from '@/lib/kitchen/item-name'
import type { KitchenVendor } from '@/lib/supabase/types-kitchen'

/**
 * Add a kitchen item with its vendor, unit and standing rate set at creation.
 *
 * The full inventory item form also works and carries more fields (par level,
 * reorder point, default supplier), but adding a new vegetable mid-requisition
 * shouldn't mean a trip into Inventory and back. This covers the fields that
 * actually matter for ordering.
 *
 * The name is two boxes, not one. It is stored as a single `English / বাংলা`
 * string to match the seeded catalogue, and typing that slash by hand is
 * exactly the sort of thing that produces `Pumpkin/মিষ্টি কুমড়া` on half the
 * rows — close enough to look fine, different enough to break a split later.
 */
export function QuickAddItem({
  vendors, categories, units, defaultVendorId,
}: {
  vendors:    KitchenVendor[]
  categories: { id: string; display_name: string }[]
  units:      { id: string; display_name: string; abbreviation: string }[]
  defaultVendorId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [nameEn, setNameEn] = useState('')
  const [nameBn, setNameBn] = useState('')
  const [price, setPrice] = useState('')
  const [vendorId, setVendorId] = useState(defaultVendorId ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [unitId, setUnitId] = useState(units.find((u) => u.abbreviation === 'kg')?.id ?? units[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  const preview = joinItemName(nameEn, nameBn)

  function submit() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => createKitchenItem({
        name_en: nameEn,
        name_bn: nameBn,
        kitchen_vendor_id: vendorId || null,
        category_id: categoryId || null,
        unit_id: unitId,
        default_unit_price: price,
      }))
      if (!r.success) { setError(r.error); return }
      toast.success(`${preview} added`)
      // Keep the vendor, unit and category — adding five vegetables in a row
      // shouldn't mean re-picking the same three dropdowns each time. The price
      // clears, because it belongs to the item and not to the batch.
      setNameEn('')
      setNameBn('')
      setPrice('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
      >
        <Plus size={16} /> Add a new item
      </button>
    )
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-forest-300 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">New item</p>
        <button type="button" onClick={() => { setOpen(false); setError(null) }}
          aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400">
          <X size={15} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">English name</span>
          <input
            value={nameEn} onChange={(e) => setNameEn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nameEn.trim()) submit() }}
            placeholder="Pumpkin"
            autoFocus
            className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">বাংলা নাম</span>
          <input
            value={nameBn} onChange={(e) => setNameBn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nameEn.trim()) submit() }}
            placeholder="মিষ্টি কুমড়া"
            lang="bn"
            className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
          />
        </label>
      </div>

      {preview && (
        <p className="text-[11px] text-gray-500">
          Saved as <span className="font-medium text-gray-700">{preview}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Vendor</span>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1.5 text-sm">
            <option value="">— none —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Unit</span>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1.5 text-sm">
            {units.map((u) => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Category</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1.5 text-sm">
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Rate / unit</span>
          <input
            value={price} onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal" placeholder="optional"
            className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <button
        type="button" onClick={submit} disabled={pending || !nameEn.trim() || !unitId}
        className="min-h-[44px] w-full rounded-xl bg-forest-700 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add item'}
      </button>
      <p className="text-[11px] text-gray-500">
        Vendor, unit and category stay selected, so adding several in a row is quick.
        Leave the rate blank for anything whose price moves — fish, most vegetables.
      </p>
    </div>
  )
}
