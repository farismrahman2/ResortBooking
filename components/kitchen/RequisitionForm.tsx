'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Send, Check, CloudOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { saveRequisition, submitRequisition } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import { PaxBanner } from './PaxBanner'
import { StartFromPrevious } from './StartFromPrevious'
import { buildSearchIndex, searchItems } from '@/lib/kitchen/item-search'
import { SaveAsTemplate } from './SaveAsTemplate'
import type { CopyableRequisition } from '@/lib/queries/kitchen'
import type { TemplateWithLines } from '@/lib/supabase/types-kitchen'
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
  requisitionId, initial, vendors, items, isNew, recent = [], templates = [], amendmentOf,
}: {
  requisitionId: string
  initial: RequisitionWithLines | null
  vendors: KitchenVendor[]
  items: PickerItem[]
  isNew: boolean
  /** Recent requisitions offered as a starting point. */
  recent?: CopyableRequisition[]
  /** Standing lists offered ahead of them. */
  templates?: TemplateWithLines[]
  /** Set when this sheet is an amendment — lines are CHANGES, not an order. */
  amendmentOf?: { id: string; requisition_no: string }
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

  /**
   * The form's live state, mirrored into a ref on every render.
   *
   * `touch()` schedules a timer that closes over the render it ran in — and it
   * runs in the SAME handler as the setState that changed things, so that
   * closure holds the state from BEFORE the edit. Every debounced save was
   * therefore one edit stale, and since nothing follows the last edit, the last
   * edit was simply never written. Add an item, type a quantity, wait for the
   * "Saved" tick, reload: the item was gone.
   *
   * A ref is read at fire time, not at schedule time, which is the only thing
   * that makes a debounce correct here.
   */
  const live = useRef({ eventDate, notes, isEmergency, lines })
  live.current = { eventDate, notes, isEmergency, lines }

  /** Bumped by every edit. A save that finishes while newer edits are pending
   *  must NOT clear the dirty flag, or those edits are lost too. */
  const revision = useRef(0)

  function payload() {
    const { eventDate, notes, isEmergency, lines } = live.current
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

  async function persist(): Promise<boolean> {
    if (!dirty.current) return true
    const sentAt = revision.current
    setSaving('saving')
    const r = await safeCall(() => saveRequisition(requisitionId, payload()))
    if (!r.success) { toast.error(r.error); setSaving('idle'); return false }
    // Only clear the flag if nothing changed while the request was in flight.
    // On a kitchen 4G connection a save takes a second or two, and edits made
    // during it used to be marked clean and never sent.
    if (revision.current === sentAt) {
      dirty.current = false
      setSaving('saved')
    }
    return true
  }

  function touch() {
    dirty.current = true
    revision.current += 1
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist() }, 1200)
  }

  useEffect(() => {
    // Leaving with an edit still in the debounce window used to throw it away:
    // type the last quantity, tap "Orders" in the tab bar within 1.2 seconds,
    // and it was gone. The cleanup cancelled the timer without ever firing it.
    // Flush instead — and warn if the browser is closing, where we cannot.
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) void persist()
    }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  function addItem(it: PickerItem) {
    // is_extra is always false here. It marks a line added to an order the
    // suppliers ALREADY HAVE, and this form only ever edits a draft — anything
    // after dispatch goes through an amendment. It used to be derived from
    // `isNew`, which flips to false the moment the first autosave re-renders
    // the page with the now-existing row, so every item added after the first
    // 1.2 seconds was silently stamped "extra" on a brand new sheet.
    setLines((prev) => [...prev, {
      item_id: it.id, item_name: it.name,
      kitchen_vendor_id: it.kitchen_vendor_id,
      qty: '', piece_count: '', unit_id: it.unit_id, unit_label: it.unit_label,
      notes: '', is_extra: false,
    }])
    setSearch('')
    touch()
  }

  /** Replace the sheet with a copy of a previous one, quantities included. */
  function copyFrom(src: CopyableRequisition) {
    setLines(src.lines.map((l) => ({
      item_id: l.item_id, item_name: l.item_name,
      kitchen_vendor_id: l.kitchen_vendor_id,
      qty: String(l.qty),
      piece_count: l.piece_count === null ? '' : String(l.piece_count),
      unit_id: l.unit_id,
      // The unit label isn't stored on the line — recover it from the
      // catalogue so the copied rows read the same as freshly added ones.
      unit_label: items.find((i) => i.id === l.item_id)?.unit_label ?? null,
      notes: l.notes ?? '', is_extra: false,
    })))
    toast.success(`Copied ${src.lines.length} items from ${src.requisition_no}`, {
      description: 'Adjust the quantities for today\u2019s headcount.',
    })
    touch()
  }

  /** Load a standing list. Same shape as copyFrom, different source of truth. */
  function loadTemplate(t: TemplateWithLines) {
    setLines(t.lines.map((l) => ({
      item_id: l.item_id, item_name: l.item_name,
      kitchen_vendor_id: l.kitchen_vendor_id,
      // A template line may deliberately carry no quantity — "always order
      // fish, decide the weight on the day" — so an empty box is meaningful
      // here and must not become a 0 that submit then rejects.
      qty: l.qty ? String(l.qty) : '',
      piece_count: l.piece_count === null ? '' : String(l.piece_count),
      unit_id: l.unit_id,
      unit_label: items.find((i) => i.id === l.item_id)?.unit_label ?? null,
      notes: l.notes ?? '', is_extra: false,
    })))
    toast.success(`Loaded "${t.name}"`, {
      description: 'Adjust the quantities for today\u2019s headcount.',
    })
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

  // Built once per catalogue, not per keystroke — transliteration is cheap but
  // this runs on a phone while somebody is typing.
  const searchIndex = useMemo(() => buildSearchIndex(items), [items])
  const matches = useMemo(() => {
    const chosen = new Set(lines.map((l) => l.item_id).filter(Boolean))
    return searchItems(items, searchIndex, search, { exclude: chosen })
  }, [search, items, searchIndex, lines])

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
    // Checked HERE because the server cannot: blank lines are dropped before
    // they are written, so by the time submitRequisition reads the row back
    // the offending item is already gone and the requisition looks complete.
    // Without this, an item you can see on screen is silently not ordered.
    const blank = lines.find((l) => !(Number(l.qty) !== 0))
    if (blank) {
      toast.error(`"${blank.item_name}" has no quantity`, {
        description: 'Give it a number, or remove the line.',
      })
      return
    }
    setSubmitting(true)
    if (timer.current) clearTimeout(timer.current)
    dirty.current = true
    // Don't submit on top of a failed save — that's how "Sent for approval"
    // appeared next to a save error, having sent an incomplete requisition.
    const saved = await persist()
    if (!saved) { setSubmitting(false); return }
    const r = await safeCall(() => submitRequisition(requisitionId))
    if (!r.success) { toast.error(r.error); setSubmitting(false); return }
    // Straight to the printable sheet: the store wants paper the moment the
    // list is closed, and going looking for a print button afterwards is how
    // people end up hand-copying it. "Back to requisition" leads to approval.
    toast.success('Sent for approval', { description: 'Here is the sheet to print.' })
    router.push(`/kitchen/requisitions/${requisitionId}/print`)
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

      {amendmentOf ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-amber-900">
            Changes to {amendmentOf.requisition_no}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            List only what changed. Use <strong>+</strong> for extra and <strong>−</strong> to
            cancel part of what was ordered. The suppliers already have the original — anything
            you repeat here they will deliver twice.
          </p>
        </div>
      ) : (
        <PaxBanner date={eventDate} />
      )}

      {/* Item picker */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches.length === 0) { e.preventDefault(); addFreeText() } }}
            placeholder="Search — English or Bangla typed in English (tel, alu)…"
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

      {lines.length === 0 && !amendmentOf && (
        <StartFromPrevious
          options={recent} templates={templates}
          onPick={copyFrom} onPickTemplate={loadTemplate}
        />
      )}

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
                        {amendmentOf ? 'Change' : 'Qty'} {l.unit_label ? `(${l.unit_label})` : ''}
                      </span>
                      <div className="flex gap-1">
                        {/* An amendment line is signed: + adds to the order the
                            supplier already has, − cancels part of it. A typed
                            minus is too easy to miss on a phone, so the sign is
                            a button that shows its own state. */}
                        {amendmentOf && (
                          <button
                            type="button"
                            onClick={() => setLine(i, { qty: l.qty.startsWith('-')
                              ? l.qty.slice(1) : `-${l.qty || ''}` })}
                            aria-label={l.qty.startsWith('-') ? 'Cancelling' : 'Adding'}
                            className={cn('min-h-[42px] w-9 flex-shrink-0 rounded-lg border text-base font-bold',
                              l.qty.startsWith('-')
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : 'border-green-400 bg-green-50 text-green-700')}
                          >
                            {l.qty.startsWith('-') ? '−' : '+'}
                          </button>
                        )}
                        <input
                          inputMode="decimal" value={l.qty}
                          onChange={(e) => setLine(i, {
                            qty: amendmentOf
                              ? e.target.value.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '')
                              : e.target.value.replace(/[^0-9.]/g, ''),
                          })}
                          className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-base"
                        />
                      </div>
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
          rows={2} value={notes} maxLength={2000}
          onChange={(e) => { setNotes(e.target.value); touch() }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus:border-forest-500 focus:outline-none"
        />
      </label>

      {/* Sticky action bar */}
      {!amendmentOf && lines.length > 0 && (
        <SaveAsTemplate requisitionId={requisitionId} onBeforeSave={persist} />
      )}

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
            <Send size={16} /> {submitting
              ? 'Sending…'
              : amendmentOf ? 'Send change for approval' : 'Send for approval'}
          </button>
        </div>
      </div>
    </div>
  )
}
