'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Trash2, AlertCircle, CheckCircle2, Coffee, BedDouble } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import {
  createChargeCategory,
  updateChargeCategory,
  toggleChargeCategoryActive,
  createChargeItem,
  updateChargeItem,
  toggleChargeItemActive,
  toggleChargeItemCoffeeShop,
  toggleChargeItemRoomExtra,
} from '@/lib/actions/charge-catalog'
import { CHARGE_CATEGORY_BADGE } from '@/components/checkout/labels'
import { formatBDT } from '@/lib/formatters/currency'
import type {
  ChargeCategoryRow,
  ChargeItemWithCategory,
} from '@/lib/supabase/types'

interface Props {
  categories: ChargeCategoryRow[]
  items:      ChargeItemWithCategory[]
}

type AvailabilityFilter = 'all' | 'coffee_only' | 'room_only' | 'both_off'

export function ChargeCatalogClient({ categories, items }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [filter, setFilter] = useState<AvailabilityFilter>('all')

  // Apply availability filter, then group items by category
  const filteredItems = items.filter((it) => {
    if (filter === 'coffee_only') return it.is_available_in_coffee_shop && !it.is_available_as_room_extra
    if (filter === 'room_only')   return !it.is_available_in_coffee_shop && it.is_available_as_room_extra
    if (filter === 'both_off')    return !it.is_available_in_coffee_shop && !it.is_available_as_room_extra
    return true
  })
  const itemsByCategory = new Map<string, ChargeItemWithCategory[]>()
  for (const it of filteredItems) {
    const list = itemsByCategory.get(it.category_id) ?? []
    list.push(it)
    itemsByCategory.set(it.category_id, list)
  }

  // Inline new-item draft per category
  const [newItem, setNewItem] = useState<Record<string, { name: string; price: number }>>({})

  function setDraft(categoryId: string, patch: Partial<{ name: string; price: number }>) {
    setNewItem((p) => {
      const current = p[categoryId] ?? { name: '', price: 0 }
      return { ...p, [categoryId]: { ...current, ...patch } }
    })
  }

  function addItem(categoryId: string) {
    const draft = newItem[categoryId]
    if (!draft?.name || draft.name.trim().length < 2) {
      setError('Item name is required (min 2 characters).')
      return
    }
    setError(null); setSavedAt(null)
    startTransition(async () => {
      const r = await createChargeItem({
        category_id:   categoryId,
        name:          draft.name,
        default_price: draft.price ?? 0,
        description:   '',
        display_order: 0,
        is_active:     true,
      })
      if (!r.success) { setError(r.error); return }
      setNewItem((p) => ({ ...p, [categoryId]: { name: '', price: 0 } }))
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    })
  }

  function toggleItem(id: string) {
    startTransition(async () => {
      const r = await toggleChargeItemActive(id)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }
  function toggleCoffee(id: string) {
    startTransition(async () => {
      const r = await toggleChargeItemCoffeeShop(id)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }
  function toggleRoom(id: string) {
    startTransition(async () => {
      const r = await toggleChargeItemRoomExtra(id)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>Saved at {savedAt}.</span>
        </div>
      )}

      {/* Availability filter pill */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Show</span>
        {([
          { id: 'all',          label: 'All' },
          { id: 'coffee_only',  label: 'Coffee shop only' },
          { id: 'room_only',    label: 'Room extras only' },
          { id: 'both_off',     label: 'Hidden from both' },
        ] as Array<{ id: AvailabilityFilter; label: string }>).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? 'border-stone-400 bg-stone-100 text-stone-800'
                : 'border-gray-200 bg-white text-gray-600 hover:border-stone-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Categories — read-only display in v1 (seeded; admin can toggle active) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">Categories</h3>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <span
              key={c.id}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                CHARGE_CATEGORY_BADGE[c.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
              } ${!c.is_active ? 'opacity-50' : ''}`}
            >
              {c.display_name}
              {!c.is_active && ' (inactive)'}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Categories are seeded. To add a new category (rare), insert directly via Supabase SQL Editor.
        </p>
      </div>

      {/* Items per category */}
      <div className="space-y-4">
        {categories.filter((c) => c.is_active).map((c) => {
          const list = itemsByCategory.get(c.id) ?? []
          const draft = newItem[c.id] ?? { name: '', price: 0 }
          return (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      CHARGE_CATEGORY_BADGE[c.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {c.display_name}
                  </span>
                  <p className="text-xs text-gray-500">{list.length} item{list.length === 1 ? '' : 's'}</p>
                </div>
              </div>

              {list.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="border-b border-gray-100">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-4 py-2 text-right font-medium">Default Price</th>
                        <th className="px-4 py-2 font-medium">Coffee shop</th>
                        <th className="px-4 py-2 font-medium">Room extra</th>
                        <th className="px-4 py-2 font-medium">Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.map((it) => (
                        <tr key={it.id} className={!it.is_active ? 'opacity-50' : ''}>
                          <td className="px-4 py-2.5 text-gray-900">{it.name}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatBDT(Number(it.default_price))}
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleCoffee(it.id)}
                              title="Show in Coffee Shop POS picker"
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                it.is_available_in_coffee_shop
                                  ? 'bg-stone-100 text-stone-800 border-stone-200'
                                  : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                            >
                              <Coffee size={10} /> {it.is_available_in_coffee_shop ? 'Yes' : 'No'}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleRoom(it.id)}
                              title="Selectable as a guest's room extra at checkout"
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                it.is_available_as_room_extra
                                  ? 'bg-violet-50 text-violet-800 border-violet-200'
                                  : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                            >
                              <BedDouble size={10} /> {it.is_available_as_room_extra ? 'Yes' : 'No'}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleItem(it.id)}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                it.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-gray-100 text-gray-500 border-gray-300'
                              }`}
                            >
                              {it.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Inline add-item row */}
              <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-7">
                    <Input
                      label={list.length === 0 ? `Add first ${c.display_name.toLowerCase()} item` : 'New item name'}
                      value={draft.name}
                      onChange={(e) => setDraft(c.id, { name: e.target.value })}
                      placeholder="e.g. Cha"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <NumberInput
                      label="Default price"
                      prefix="৳"
                      value={draft.price}
                      onChange={(v) => setDraft(c.id, { price: v })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      loading={pending}
                      onClick={() => addItem(c.id)}
                      className="w-full gap-1.5"
                    >
                      <Plus size={14} /> Add
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
