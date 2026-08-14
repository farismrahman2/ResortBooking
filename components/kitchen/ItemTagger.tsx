'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Check, AlertTriangle, Layers, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { setItemVendorBulk } from '@/lib/actions/kitchen'
import type { KitchenVendor } from '@/lib/supabase/types-kitchen'

export interface TaggableItem {
  id: string
  name: string
  sku_code: string | null
  category_slug: string | null
  category_name: string | null
  unit_label: string | null
  kitchen_vendor_id: string | null
}

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
  items, vendors,
}: {
  items: TaggableItem[]
  vendors: KitchenVendor[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showTagged, setShowTagged] = useState(false)

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])
  const untaggedCount = items.filter((i) => !i.kitchen_vendor_id).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (!showTagged && i.kitchen_vendor_id) return false
      if (!q) return true
      return i.name.toLowerCase().includes(q) || (i.category_name ?? '').toLowerCase().includes(q)
    })
  }, [items, search, showTagged])

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
      const r = await setItemVendorBulk(ids, vendorId)
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
            placeholder="Search items…"
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
            return (
              <li key={i.id} className={cn('flex items-center gap-2 p-3', checked && 'bg-forest-50/50')}>
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
                    {i.category_name ?? 'no category'}{i.unit_label ? ` · ${i.unit_label}` : ''}
                  </span>
                </span>
                <select
                  value={i.kitchen_vendor_id ?? ''}
                  disabled={pending}
                  onChange={(e) => {
                    const nv = vendors.find((x) => x.id === e.target.value)
                    assign([i.id], e.target.value || null, nv?.display_name ?? 'none')
                  }}
                  className={cn('min-h-[40px] w-[140px] flex-shrink-0 rounded-lg border bg-white px-1.5 text-sm',
                    v ? 'border-gray-300' : 'border-amber-400 bg-amber-50')}
                >
                  <option value="">— none —</option>
                  {vendors.map((vv) => <option key={vv.id} value={vv.id}>{vv.display_name}</option>)}
                </select>
              </li>
            )
          })}
        </ul>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
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
