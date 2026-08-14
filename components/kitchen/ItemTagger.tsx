'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, AlertTriangle, Layers, X, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { setItemVendorBulk, updateKitchenItem } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import { splitItemName, joinItemName } from '@/lib/kitchen/item-name'
import { buildSearchIndex, scoreItem } from '@/lib/kitchen/item-search'
import { phoneticKey } from '@/lib/kitchen/bangla-translit'
import type { KitchenVendor } from '@/lib/supabase/types-kitchen'

export interface TaggableItem {
  id: string
  name: string
  sku_code: string | null
  category_slug: string | null
  category_name: string | null
  unit_id: string | null
  unit_label: string | null
  default_unit_price: number | null
  kitchen_vendor_id: string | null
}

export interface UnitOption { id: string; display_name: string; abbreviation: string }

/**
 * Assigns each kitchen item to the supplier who provides it. Until an item is
 * tagged it reaches nobody — it silently drops out of every vendor message —
 * so untagged items lead the screen and the count is shown up front.
 *
 * Bulk-by-category is the primary path. Tagging 76 items one dropdown at a
 * time is the kind of chore people abandon halfway, which leaves a
 * half-configured system that fails quietly.
 */
export function ItemTagger({
  items, vendors, units,
}: {
  items: TaggableItem[]
  vendors: KitchenVendor[]
  units: UnitOption[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Once everything is tagged the untagged-only view is empty, and the screen
  // reads as broken — it is also where units and rates get edited, so show
  // the full list rather than "Nothing left to tag."
  const [showTagged, setShowTagged] = useState(() => items.every((i) => i.kitchen_vendor_id))
  const [editing, setEditing] = useState<string | null>(null)

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])
  const untaggedCount = items.filter((i) => !i.kitchen_vendor_id).length

  const searchIndex = useMemo(() => buildSearchIndex(items), [items])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qKey = phoneticKey(q)
    const pool = items.filter((i) => showTagged || !i.kitchen_vendor_id)
    if (!q) return pool
    // Category is searchable here too — "vegetable" should pull the whole
    // group on the screen whose job is assigning them to a supplier.
    return pool.filter((i) =>
      (i.category_name ?? '').toLowerCase().includes(q)
      || scoreItem(searchIndex.get(i.id), q, qKey) > 0)
  }, [items, search, showTagged, searchIndex])

  /** Categories present in the current view — powers the bulk shortcut. */
  const categories = useMemo(() => {
    const m = new Map<string, { name: string; ids: string[] }>()
    for (const i of visible) {
      if (!i.category_slug) continue
      const cur = m.get(i.category_slug) ?? { name: i.category_name ?? i.category_slug, ids: [] }
      cur.ids.push(i.id)
      m.set(i.category_slug, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].ids.length - a[1].ids.length)
  }, [visible])

  function assign(ids: string[], vendorId: string | null, label: string) {
    if (ids.length === 0) return
    start(async () => {
      const r = await safeCall(() => setItemVendorBulk(ids, vendorId))
      if (!r.success) { toast.error(r.error); return }
      toast.success(
        vendorId ? `${r.data.updated} item${r.data.updated === 1 ? '' : 's'} → ${label}` : 'Vendor cleared',
      )
      setSelected(new Set())
      router.refresh()
    })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4 pb-28">
      {untaggedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <strong>{untaggedCount} item{untaggedCount === 1 ? '' : 's'} have no vendor.</strong>{' '}
            Until tagged they won&apos;t appear in any supplier&apos;s message — they simply
            won&apos;t get ordered.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 p-3">
          <Check size={16} className="flex-shrink-0 text-green-600" />
          <p className="text-sm font-medium text-green-900">Every item is tagged.</p>
        </div>
      )}

      {/* Bulk by category — the fast path */}
      {categories.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Layers size={13} /> Tag a whole category at once
          </p>
          <div className="mt-2 space-y-2">
            {categories.map(([slug, c]) => (
              <div key={slug} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[140px] flex-1 text-sm text-gray-800">
                  {c.name} <span className="text-gray-400">· {c.ids.length}</span>
                </span>
                <select
                  defaultValue=""
                  disabled={pending}
                  onChange={(e) => {
                    const v = vendors.find((x) => x.id === e.target.value)
                    if (v) assign(c.ids, v.id, v.display_name)
                    e.target.value = ''
                  }}
                  className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm"
                >
                  <option value="">Assign all to…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Meat / Fish is the one you&apos;ll need to do by hand — it holds fish, chicken and beef,
            which are three different suppliers.
          </p>
        </div>
      )}

      {/* Search + toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search — English or Bangla in English (tel, alu)…"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 pl-9 pr-3 text-sm focus:border-forest-500 focus:outline-none"
          />
        </div>
        <button
          type="button" onClick={() => setShowTagged((v) => !v)}
          className={cn('min-h-[44px] rounded-xl border px-3 text-sm font-medium',
            showTagged ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 bg-white text-gray-700')}
        >
          {showTagged ? 'All items' : 'Untagged only'}
        </button>
      </div>

      {/* Item rows */}
      {visible.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {search ? 'Nothing matches that search.' : 'Nothing left to tag.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {visible.map((i) => {
            const v = i.kitchen_vendor_id ? vendorById.get(i.kitchen_vendor_id) : null
            const checked = selected.has(i.id)
            const isEditing = editing === i.id
            return (
              <li key={i.id} className={cn(checked && 'bg-forest-50/50', isEditing && 'bg-gray-50')}>
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button" onClick={() => toggle(i.id)}
                    aria-label={checked ? 'Deselect' : 'Select'}
                    className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2',
                      checked ? 'border-forest-600 bg-forest-600 text-white' : 'border-gray-300')}
                  >
                    {checked && <Check size={13} />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{i.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {i.category_name ?? 'no category'}
                      {i.unit_label ? ` · ${i.unit_label}` : ' · no unit'}
                      {i.default_unit_price !== null && ` · ৳${i.default_unit_price}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(isEditing ? null : i.id)}
                    aria-label={`Edit ${i.name}`}
                    className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border',
                      isEditing ? 'border-forest-500 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-500')}
                  >
                    <Pencil size={14} />
                  </button>
                  <select
                    value={i.kitchen_vendor_id ?? ''}
                    disabled={pending}
                    onChange={(e) => {
                      const nv = vendors.find((x) => x.id === e.target.value)
                      assign([i.id], e.target.value || null, nv?.display_name ?? 'none')
                    }}
                    className={cn('min-h-[40px] w-[120px] flex-shrink-0 rounded-lg border bg-white px-1.5 text-sm sm:w-[140px]',
                      v ? 'border-gray-300' : 'border-amber-400 bg-amber-50')}
                  >
                    <option value="">— none —</option>
                    {vendors.map((vv) => <option key={vv.id} value={vv.id}>{vv.display_name}</option>)}
                  </select>
                </div>
                {isEditing && (
                  <ItemDefaultsEditor
                    key={`${i.id}-${i.name}-${i.unit_id}-${i.default_unit_price}`}
                    item={i} units={units}
                    onDone={() => setEditing(null)}
                    onSaved={() => { setEditing(null); router.refresh() }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Selection bar — hidden while a row editor is open, or it covers the
          Save button on a phone. */}
      {selected.size > 0 && !editing && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <button
              type="button" onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500"
            >
              <X size={16} />
            </button>
            <span className="flex-shrink-0 text-sm font-medium text-gray-800">
              {selected.size} selected
            </span>
            <select
              defaultValue="" disabled={pending}
              onChange={(e) => {
                const v = vendors.find((x) => x.id === e.target.value)
                if (v) assign([...selected], v.id, v.display_name)
                e.target.value = ''
              }}
              className="min-h-[44px] flex-1 rounded-xl border border-gray-300 bg-white px-2.5 text-sm"
            >
              <option value="">Assign selected to…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Per-item defaults: the two halves of the name, the unit it is ordered in,
 * and the standing rate.
 *
 * Rendered inline under the row rather than in a modal — the point of this
 * screen is working down a list of 77 items, and a dialog that has to be
 * dismissed between each one turns that into a chore.
 */
function ItemDefaultsEditor({
  item, units, onDone, onSaved,
}: {
  item:    TaggableItem
  units:   UnitOption[]
  onDone:  () => void
  onSaved: () => void
}) {
  const initial = splitItemName(item.name)
  const [pending, start] = useTransition()
  const [nameEn, setNameEn] = useState(initial.en)
  const [nameBn, setNameBn] = useState(initial.bn)
  const [unitId, setUnitId] = useState(item.unit_id ?? '')
  const [price, setPrice] = useState(item.default_unit_price === null ? '' : String(item.default_unit_price))
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => updateKitchenItem(item.id, {
        name_en: nameEn, name_bn: nameBn, unit_id: unitId, default_unit_price: price,
      }))
      if (!r.success) { setError(r.error); return }
      toast.success(`${joinItemName(nameEn, nameBn)} updated`)
      onSaved()
    })
  }

  return (
    <div className="space-y-2.5 border-t border-gray-200 bg-gray-50 px-3 pb-3 pt-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">English name</span>
          <input
            value={nameEn} onChange={(e) => setNameEn(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">বাংলা নাম</span>
          <input
            value={nameBn} onChange={(e) => setNameBn(e.target.value)} lang="bn"
            className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2.5 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Default unit</span>
          <select
            value={unitId} onChange={(e) => setUnitId(e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1.5 text-sm"
          >
            <option value="">— pick one —</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.abbreviation} · {u.display_name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Default rate / unit</span>
          <input
            value={price} onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal" placeholder="leave blank if it varies"
            className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2.5 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button" onClick={onDone} disabled={pending}
          className="min-h-[42px] flex-1 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
        >
          Cancel
        </button>
        <button
          type="button" onClick={save} disabled={pending || !nameEn.trim() || !unitId}
          className="min-h-[42px] flex-1 rounded-lg bg-forest-700 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="text-[11px] text-gray-500">
        Saved as <span className="font-medium text-gray-700">{joinItemName(nameEn, nameBn) || '—'}</span>.
        The rate is a starting point — it can still be changed on an individual order.
      </p>
    </div>
  )
}
