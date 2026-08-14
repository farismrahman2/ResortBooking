'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Send, Check, CloudOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { saveRequisition, submitRequisition } from '@/lib/actions/kitchen'
import type { KitchenVendor, RequisitionWithLines } from '@/lib/supabase/types-kitchen'

export interface PickerItem {
  id: string; name: string
  kitchen_vendor_id: string | null
  unit_id: string | null; unit_label: string | null
  category_name: string | null
}

interface Line {
  item_id: string | null
  item_name: string
  kitchen_vendor_id: string | null
  qty: string
  piece_count: string
  unit_id: string | null
  unit_label: string | null
  notes: string
  is_extra: boolean
}

/**
 * The requisition sheet. Deliberately grouped BY VENDOR rather than mirroring
 * the paper form's three printed columns: the columns don't map to suppliers
 * (beef, chicken, fish and eggs all sit inside column 2), and the vendor
 * grouping is what the dispatch actually needs.
 */
export function RequisitionForm({
  requisitionId, initial, vendors, items, isNew,
}: {
  requisitionId: string
  initial: RequisitionWithLines | null
  vendors: KitchenVendor[]
  items: PickerItem[]
  isNew: boolean
}) {
  const router = useRouter()
  const [eventDate, setEventDate] = useState(initial?.event_date ?? '')
  const [notes, setNotes]         = useState(initial?.notes ?? '')
  const [isEmergency, setEmergency] = useState(initial?.is_emergency ?? false)
  const [lines, setLines] = useState<Line[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      item_id: l.item_id, item_name: l.item_name,
      kitchen_vendor_id: l.kitchen_vendor_id,
      qty: String(l.qty), piece_count: l.piece_count === null ? '' : String(l.piece_count),
      unit_id: l.unit_id, unit_label: null,
      notes: l.notes ?? '', is_extra: l.is_extra,
    })),
  )
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])

  function payload() {
    return {
      event_date: eventDate || null,
      notes: notes || null,
      is_emergency: isEmergency,
      lines: lines.map((l, i) => ({
        sort_order: i, item_id: l.item_id, item_name: l.item_name,
        kitchen_vendor_id: l.kitchen_vendor_id,
        qty: Number(l.qty) || 0,
        piece_count: l.piece_count ? Number(l.piece_count) : null,
        unit_id: l.unit_id, notes: l.notes || null, is_extra: l.is_extra,
      })),
    }
  }

  async function persist() {
    if (!dirty.current) return
    setSaving('saving')
    const r = await saveRequisition(requisitionId, payload())
    if (!r.success) { toast.error(r.error); setSaving('idle'); return }
    dirty.current = false
    setSaving('saved')
  }

  function touch() {
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist() }, 1200)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function addItem(it: PickerItem) {
    // An approved requisition has already gone out; anything added afterwards
    // is flagged so the supplier can see it's an addition.
    setLines((prev) => [...prev, {
      item_id: it.id, item_name: it.name,
      kitchen_vendor_id: it.kitchen_vendor_id,
      qty: '', piece_count: '', unit_id: it.unit_id, unit_label: it.unit_label,
      notes: '', is_extra: !isNew && (initial?.lines.length ?? 0) > 0,
    }])
    setSearch('')
    touch()
  }

  function addFreeText() {
    const name = search.trim()
    if (!name) return
    setLines((prev) => [...prev, {
      item_id: null, item_name: name, kitchen_vendor_id: null,
      qty: '', piece_count: '', unit_id: null, unit_label: null,
      notes: '', is_extra: false,
    }])
    setSearch('')
    touch()
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
    touch()
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
    touch()
  }

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 1) return []
    const chosen = new Set(lines.map((l) => l.item_id).filter(Boolean))
    return items.filter((i) => !chosen.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8)
  }, [search, items, lines])

  // Group for display — vendor order, untagged last so it's visible.
  const grouped = useMemo(() => {
    const map = new Map<string, { vendor: KitchenVendor | null; idx: number[] }>()
    lines.forEach((l, i) => {
      const key = l.kitchen_vendor_id ?? '_untagged'
      const cur = map.get(key) ?? { vendor: l.kitchen_vendor_id ? vendorById.get(l.kitchen_vendor_id) ?? null : null, idx: [] }
      cur.idx.push(i)
      map.set(key, cur)
    })
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '_untagged') return 1
      if (b[0] === '_untagged') return -1
      return (a[1].vendor?.sort_order ?? 0) - (b[1].vendor?.sort_order ?? 0)
    })
  }, [lines, vendorById])

  async function handleSubmit() {
    setSubmitting(true)
    if (timer.current) clearTimeout(timer.current)
    dirty.current = true
    await persist()
    const r = await submitRequisition(requisitionId)
    if (!r.success) { toast.error(r.error); setSubmitting(false); return }
    toast.success('Sent for approval')
    router.push(`/kitchen/requisitions/${requisitionId}`)
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-28">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Event date <span className="text-red-500">*</span>
          </span>
          <input
            type="date" value={eventDate}
            onChange={(e) => { setEventDate(e.target.value); touch() }}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base focus:border-forest-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-gray-500">The day the food is for</span>
        </label>
        <label className="flex items-end pb-1">
          <button
            type="button"
            onClick={() => { setEmergency((v) => !v); touch() }}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium',
              isEmergency ? 'border-red-400 bg-red-50 text-red-800' : 'border-gray-300 bg-white text-gray-700',
            )}
          >
            <span className={cn('flex h-4 w-4 items-center justify-center rounded border-2',
              isEmergency ? 'border-red-500 bg-red-500 text-white' : 'border-gray-400')}>
              {isEmergency && <Check size={11} />}
            </span>
            Emergency order
          </button>
        </label>
      </div>

      {/* Item picker */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches.length === 0) { e.preventDefault(); addFreeText() } }}
            placeholder="Search an item to add…"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 pl-9 pr-3 text-base focus:border-forest-500 focus:outline-none"
          />
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button" onClick={() => addItem(m)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-forest-50"
                >
                  <Plus size={14} className="flex-shrink-0 text-forest-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{m.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {m.kitchen_vendor_id
                        ? vendorById.get(m.kitchen_vendor_id)?.display_name ?? 'Unknown vendor'
                        : <span className="text-red-600">No vendor set</span>}
                      {m.unit_label ? ` · ${m.unit_label}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {search.trim() && matches.length === 0 && (
          <button
            type="button" onClick={addFreeText}
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
          >
            <Plus size={15} /> Add &ldquo;{search.trim()}&rdquo; as a one-off
          </button>
        )}
      </div>

      {/* Lines grouped by vendor */}
      {lines.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No items yet — search above to build the requisition.
        </p>
      ) : grouped.map(([key, g]) => (
        <div key={key} className={cn(
          'overflow-hidden rounded-xl border bg-white',
          key === '_untagged' ? 'border-red-300' : 'border-gray-200',
        )}>
          <p className={cn(
            'border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide',
            key === '_untagged' ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-gray-50 text-gray-600',
          )}>
            {g.vendor?.display_name ?? 'No vendor — these won’t reach any supplier'}
          </p>
          <div className="divide-y divide-gray-100">
            {g.idx.map((i) => {
              const l = lines[i]
              return (
                <div key={i} className="p-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                      {l.item_name}
                      {l.is_extra && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          extra
                        </span>
                      )}
                    </p>
                    <button
                      type="button" onClick={() => removeLine(i)}
                      aria-label="Remove" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">
                        Qty {l.unit_label ? `(${l.unit_label})` : ''}
                      </span>
                      <input
                        inputMode="decimal" value={l.qty}
                        onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-base"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Pieces</span>
                      <input
                        inputMode="numeric" value={l.piece_count} placeholder="—"
                        onChange={(e) => setLine(i, { piece_count: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-base"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Vendor</span>
                      <select
                        value={l.kitchen_vendor_id ?? ''}
                        onChange={(e) => setLine(i, { kitchen_vendor_id: e.target.value || null })}
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1 text-sm"
                      >
                        <option value="">— none —</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-800">Notes</span>
        <textarea
          rows={2} value={notes}
          onChange={(e) => { setNotes(e.target.value); touch() }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus:border-forest-500 focus:outline-none"
        />
      </label>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[720px] border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-gray-500">
            {saving === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : saving === 'saved' ? <><Check size={12} className="text-green-600" /> Saved</>
              : <><CloudOff size={12} className="opacity-0" /></>}
          </span>
          <button
            type="button" onClick={handleSubmit}
            disabled={submitting || lines.length === 0 || !eventDate}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest-700 px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            <Send size={16} /> {submitting ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </div>
    </div>
  )
}
