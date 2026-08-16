'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Check, CheckCircle2, CloudOff, Loader2, AlertTriangle, Plus, Search, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { saveDelivery, confirmDelivery } from '@/lib/actions/kitchen-ledger'
import { safeCall } from '@/lib/actions/safe-call'
import { formatBDT } from '@/lib/formatters/currency'
import { todayDhaka } from '@/lib/dates'
import { buildSearchIndex, searchItems } from '@/lib/kitchen/item-search'
import { num } from '@/lib/kitchen/messages'
import type { SubstitutableLine } from '@/lib/queries/kitchen-ledger'
import type { KitchenVendor, DeliveryWithLines } from '@/lib/supabase/types-kitchen'
import type { PickerItemRow } from '@/lib/queries/kitchen'
import type { SalesEmployee } from '@/lib/supabase/types'

export interface PrefillLine {
  requisition_line_id: string
  item_id:      string | null
  item_name:    string
  qty_ordered:  number
  qty_delivered: number
  piece_count:  number | null
  unit_id:      string | null
  unit_label:   string | null
  unit_price:   number
}

interface Line {
  requisition_line_id: string | null
  item_id:        string | null
  item_name:      string
  qty_ordered:    number | null
  /** The unit the kitchen ORDERED in (the catalogue unit — e.g. pcs for
   *  chicken). Frozen at line creation; the received unit below can differ. */
  ordered_unit_label: string | null
  qty_delivered:  string
  rejected_qty:   string
  reject_reason:  string
  piece_count:    string
  unit_id:        string | null
  unit_label:     string | null
  unit_price:     string
  is_unrequested: boolean
  notes:          string
  /** Save this line's rate back to the item as its standing rate on confirm. */
  set_default_price: boolean
}

const n = (v: string) => Number(v) || 0

/**
 * Receiving goods. Used standing at the gate at 6am, one-handed.
 *
 * Built around correcting a pre-filled list rather than entering one. When a
 * delivery is opened against a requisition, every ordered line arrives with
 * the ordered quantity already in the delivered box and the item's standing
 * rate in the price box — because "everything arrived, at the usual price" is
 * the case most mornings, and typing forty numbers that were already on the
 * printed sheet is how this screen gets abandoned in week two.
 *
 * The shortfall column is the point of the exercise. It is the difference
 * between "we paid for what we got" and "we paid for what we asked for", and
 * nobody notices the gap when it lives only in the storekeeper's memory.
 */
export function DeliveryForm({
  deliveryId, initial, vendors, items, employees, prefill, isNew,
  requisitionNo, requisitionId, defaultVendorId, receiptCapture,
  unitOptions = [], substitutable = [],
}: {
  deliveryId: string
  initial:    DeliveryWithLines | null
  vendors:    KitchenVendor[]
  items:      PickerItemRow[]
  employees:  Pick<SalesEmployee, 'id' | 'full_name'>[]
  /** Lines built from the requisition, when arriving from one. */
  prefill?:   PrefillLine[]
  isNew:      boolean
  requisitionNo?: string | null
  /** Set when receiving against a requisition — stored on the delivery. */
  requisitionId?: string | null
  defaultVendorId?: string | null
  /** Slot rendered right under the memo fields — the receipt-photo capture,
   *  so the proof is photographed at the moment the memo number is typed. */
  receiptCapture?: React.ReactNode
  /** All units, for the per-line "received in" switcher (order pcs, get kg). */
  unitOptions?: Array<{ id: string; label: string }>
  /** Undelivered lines tagged to OTHER vendors on this requisition — the
   *  "their vendor didn't have it, this one brought it" picker. */
  substitutable?: SubstitutableLine[]
}) {
  const router = useRouter()

  const [vendorId, setVendorId]   = useState(initial?.kitchen_vendor_id ?? defaultVendorId ?? '')
  const [date, setDate]           = useState(initial?.delivery_date ?? todayDhaka())
  const [memoNo, setMemoNo]       = useState(initial?.supplier_memo_no ?? '')
  const [receiverId, setReceiver] = useState(initial?.received_by_employee_id ?? '')
  const [notes, setNotes]         = useState(initial?.notes ?? '')
  const unitLabel = (unitId: string | null | undefined): string | null =>
    unitOptions.find((u) => u.id === unitId)?.label ?? null
  const [lines, setLines] = useState<Line[]>(() => {
    if (initial?.lines.length) {
      return initial.lines.map((l) => ({
        requisition_line_id: l.requisition_line_id,
        item_id: l.item_id, item_name: l.item_name,
        qty_ordered: l.qty_ordered,
        // The catalogue unit is the ORDERING unit (chicken is ordered in pcs
        // even when it arrives priced per kg).
        ordered_unit_label: items.find((i) => i.id === l.item_id)?.unit_label ?? null,
        qty_delivered: String(l.qty_delivered),
        rejected_qty: l.rejected_qty === null ? '' : String(l.rejected_qty),
        reject_reason: l.reject_reason ?? '',
        piece_count: l.piece_count === null ? '' : String(l.piece_count),
        unit_id: l.unit_id,
        // Resolve from the units list, NOT the catalogue: the received unit is
        // stored on the line and may deliberately differ from the item's.
        unit_label: unitLabel(l.unit_id) ?? items.find((i) => i.id === l.item_id)?.unit_label ?? null,
        unit_price: String(l.unit_price),
        is_unrequested: l.is_unrequested, notes: l.notes ?? '',
        set_default_price: false,
      }))
    }
    return (prefill ?? []).map((p) => ({
      requisition_line_id: p.requisition_line_id,
      item_id: p.item_id, item_name: p.item_name,
      qty_ordered: p.qty_ordered,
      ordered_unit_label: p.unit_label,
      qty_delivered: String(p.qty_delivered),
      rejected_qty: '', reject_reason: '',
      piece_count: p.piece_count === null ? '' : String(p.piece_count),
      unit_id: p.unit_id, unit_label: p.unit_label,
      unit_price: p.unit_price ? String(p.unit_price) : '',
      is_unrequested: false, notes: '',
      set_default_price: false,
    }))
  })

  const [saving, setSaving]   = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirming, setConfirming] = useState(false)
  const dirty = useRef(prefill != null && prefill.length > 0 && !initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = useMemo(
    () => lines.reduce((s, l) => s + n(l.qty_delivered) * n(l.unit_price), 0),
    [lines],
  )
  // A shortfall only means something when ordered and received share a unit —
  // 20 pcs of chicken arriving as 26 kg is not "6 short".
  const isShort = (l: Line) =>
    l.qty_ordered !== null
    && (l.ordered_unit_label === null || l.ordered_unit_label === l.unit_label)
    && n(l.qty_delivered) < l.qty_ordered
  const shortfalls = useMemo(() => lines.filter(isShort), [lines])
  const unpriced = useMemo(
    () => lines.filter((l) => n(l.qty_delivered) > 0 && !(n(l.unit_price) > 0)),
    [lines],
  )

  function payload() {
    return {
      requisition_id: initial?.requisition_id ?? requisitionId ?? null,
      kitchen_vendor_id: vendorId || null,
      delivery_date: date || null,
      supplier_memo_no: memoNo || null,
      received_by_employee_id: receiverId || null,
      notes: notes || null,
      lines: lines.map((l, i) => ({
        sort_order: i,
        requisition_line_id: l.requisition_line_id,
        item_id: l.item_id, item_name: l.item_name,
        qty_ordered: l.qty_ordered,
        qty_delivered: n(l.qty_delivered),
        rejected_qty: l.rejected_qty === '' ? null : n(l.rejected_qty),
        reject_reason: l.reject_reason || null,
        piece_count: l.piece_count === '' ? null : n(l.piece_count),
        unit_id: l.unit_id,
        unit_price: n(l.unit_price),
        is_unrequested: l.is_unrequested,
        notes: l.notes || null,
        set_default_price: l.set_default_price,
      })),
    }
  }

  async function persist(): Promise<boolean> {
    if (!dirty.current) return true
    setSaving('saving')
    const r = await safeCall(() => saveDelivery(deliveryId, payload()))
    if (!r.success) { toast.error(r.error); setSaving('idle'); return false }
    dirty.current = false
    setSaving('saved')
    return true
  }

  function touch() {
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist() }, 1200)
  }

  // A delivery opened from a requisition arrives pre-filled and therefore
  // already worth saving — otherwise a storekeeper who accepts the whole order
  // unchanged and taps Confirm would have nothing on the server to confirm.
  useEffect(() => { if (dirty.current) void persist() }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // ── Cross-vendor substitution: pull an undelivered line from another
  //    vendor's section onto THIS vendor's delivery, ordered qty and
  //    requisition link intact. The bill lands on whoever actually supplied it.
  const substitutableOpen = substitutable.filter(
    (s) => !lines.some((l) => l.requisition_line_id === s.requisition_line_id),
  )
  function addSubstituted(s: SubstitutableLine) {
    setLines((prev) => [...prev, {
      requisition_line_id: s.requisition_line_id,
      item_id: s.item_id, item_name: s.item_name,
      qty_ordered: s.qty_ordered,
      ordered_unit_label: s.unit_label,
      qty_delivered: String(s.qty_ordered),
      rejected_qty: '', reject_reason: '',
      piece_count: s.piece_count === null ? '' : String(s.piece_count),
      unit_id: s.unit_id, unit_label: s.unit_label,
      unit_price: s.unit_price ? String(s.unit_price) : '',
      is_unrequested: false,
      notes: `Came from this vendor instead of ${s.from_vendor}`,
      set_default_price: false,
    }])
    touch()
  }

  // ── Standalone deliveries (no requisition behind them) have no prefill, so
  //    they keep an item search — without it a blank delivery could never
  //    gain a line at all.
  const standalone = !(initial?.requisition_id ?? requisitionId)
  const [search, setSearch] = useState('')
  const chosen = useMemo(() => new Set(lines.map((l) => l.item_id).filter(Boolean)), [lines])
  const searchIndex = useMemo(() => buildSearchIndex(items), [items])
  const matches = useMemo(
    () => (standalone ? searchItems(items, searchIndex, search, { exclude: chosen }) : []),
    [standalone, search, items, searchIndex, chosen],
  )
  function addItem(it: PickerItemRow) {
    setLines((prev) => [...prev, {
      requisition_line_id: null, item_id: it.id, item_name: it.name,
      qty_ordered: null, ordered_unit_label: null,
      qty_delivered: '', rejected_qty: '', reject_reason: '',
      piece_count: '', unit_id: it.unit_id, unit_label: it.unit_label,
      unit_price: it.default_unit_price ? String(it.default_unit_price) : '',
      is_unrequested: true, notes: '',
      set_default_price: false,
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

  async function handleConfirm() {
    setConfirming(true)
    if (timer.current) clearTimeout(timer.current)
    dirty.current = true
    const saved = await persist()
    if (!saved) { setConfirming(false); return }
    // Which items should adopt this delivery's rate as their standing rate.
    const rememberRates = lines
      .filter((l) => l.set_default_price && l.item_id && n(l.unit_price) > 0)
      .map((l) => l.item_id as string)
    const r = await safeCall(() => confirmDelivery(deliveryId, rememberRates))
    if (!r.success) { toast.error(r.error); setConfirming(false); return }
    toast.success('Delivery confirmed', { description: 'The bill message is ready to send.' })
    router.push(`/kitchen/deliveries/${deliveryId}`)
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-28">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Supplier <span className="text-red-500">*</span>
          </span>
          <select
            value={vendorId} onChange={(e) => { setVendorId(e.target.value); touch() }}
            disabled={!isNew && !!initial?.requisition_id}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-base disabled:bg-gray-100"
          >
            <option value="">— choose —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Delivery date <span className="text-red-500">*</span>
          </span>
          <input
            type="date" value={date} onChange={(e) => { setDate(e.target.value); touch() }}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">Their memo no.</span>
          <input
            value={memoNo} onChange={(e) => { setMemoNo(e.target.value); touch() }}
            placeholder="from the supplier's slip"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">Received by</span>
          <select
            value={receiverId} onChange={(e) => { setReceiver(e.target.value); touch() }}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-base"
          >
            <option value="">— who took it in —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
      </div>

      {receiptCapture}

      {requisitionNo && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Against <strong className="text-gray-800">{requisitionNo}</strong> — quantities and rates
          are pre-filled. Change only what differs.
        </p>
      )}

      {/* Standalone deliveries only: nothing is prefilled, so lines are added
          by search. Requisition-backed deliveries get their lines from the
          requisition (and the substitution picker below). */}
      {standalone && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
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
                        {m.unit_label ?? 'no unit'}
                        {m.default_unit_price ? ` · ৳${m.default_unit_price}` : ' · no standing rate'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Nothing on this delivery yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="divide-y divide-gray-100">
            {lines.map((l, i) => {
              const short = isShort(l)
              const amount = n(l.qty_delivered) * n(l.unit_price)
              return (
                <div key={i} className={cn('p-3', l.is_unrequested && 'bg-amber-50/40')}>
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                      {l.item_name}
                      {l.is_unrequested && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          not ordered
                        </span>
                      )}
                      {l.qty_ordered !== null && (
                        <span className="ml-1.5 text-[11px] font-normal text-gray-500">
                          ordered {l.qty_ordered}{l.ordered_unit_label ? ` ${l.ordered_unit_label}` : ''}
                        </span>
                      )}
                    </p>
                    <span className="flex-shrink-0 text-sm font-semibold text-gray-800">
                      {amount > 0 ? formatBDT(amount) : '—'}
                    </span>
                    <button
                      type="button" onClick={() => removeLine(i)}
                      aria-label="Remove"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Got</span>
                      <input
                        inputMode="decimal" value={l.qty_delivered}
                        onChange={(e) => setLine(i, { qty_delivered: e.target.value.replace(/[^0-9.]/g, '') })}
                        className={cn('min-h-[42px] w-full rounded-lg border px-2 text-base',
                          short ? 'border-amber-400 bg-amber-50' : 'border-gray-300')}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">In</span>
                      {/* Ordered in pcs, arrived priced per kg — chicken every
                          morning. Switching the unit here changes what "Got"
                          and "Rate" mean; the "ordered N pcs" note above keeps
                          the original ask visible. */}
                      <select
                        value={l.unit_id ?? ''}
                        onChange={(e) => setLine(i, {
                          unit_id: e.target.value || null,
                          unit_label: unitLabel(e.target.value) ?? null,
                        })}
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {unitOptions.map((u) => (
                          <option key={u.id} value={u.id}>{u.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Pieces</span>
                      <input
                        inputMode="decimal" value={l.piece_count}
                        onChange={(e) => setLine(i, { piece_count: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-base"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">
                        Rate {l.unit_label ? `/ ${l.unit_label}` : ''}
                      </span>
                      <input
                        inputMode="decimal" value={l.unit_price}
                        onChange={(e) => setLine(i, { unit_price: e.target.value.replace(/[^0-9.]/g, '') })}
                        className={cn('min-h-[42px] w-full rounded-lg border px-2 text-base',
                          n(l.qty_delivered) > 0 && !(n(l.unit_price) > 0)
                            ? 'border-red-400 bg-red-50' : 'border-gray-300')}
                      />
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2">
                    <label className="col-span-1 block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-gray-500">Rejected</span>
                      <input
                        inputMode="decimal" value={l.rejected_qty}
                        onChange={(e) => setLine(i, { rejected_qty: e.target.value.replace(/[^0-9.]/g, '') })}
                        placeholder="—"
                        className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-base"
                      />
                    </label>
                    {l.item_id && n(l.unit_price) > 0 && (
                      <label className="col-span-3 flex cursor-pointer items-end gap-2 pb-2 text-xs text-gray-700">
                        <input
                          type="checkbox" checked={l.set_default_price}
                          onChange={(e) => setLine(i, { set_default_price: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 accent-forest-700"
                        />
                        Make ৳{l.unit_price} the default rate for {l.item_name.split('/')[0].trim()}
                      </label>
                    )}
                  </div>

                  {l.rejected_qty !== '' && (
                    <input
                      value={l.reject_reason} onChange={(e) => setLine(i, { reject_reason: e.target.value })}
                      placeholder="Why was it rejected?"
                      className="mt-2 min-h-[40px] w-full rounded-lg border border-gray-300 px-2 text-sm"
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="text-sm font-medium text-gray-700">Bill total</span>
            <span className="text-lg font-bold text-gray-900">{formatBDT(total)}</span>
          </div>
        </div>
      )}

      {/* Another vendor's item arrived on THIS van. Picking it moves the line
          here with its ordered quantity intact — the original vendor's sheet
          stops expecting it, and the bill lands on who actually supplied it. */}
      {substitutableOpen.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
            <ArrowRightLeft size={13} /> An item came from this vendor instead?
          </p>
          <p className="mt-0.5 text-[11px] text-sky-800/80">
            Still undelivered on this requisition, tagged to other vendors. Tap to receive it here.
          </p>
          <ul className="mt-2 space-y-1">
            {substitutableOpen.map((s) => (
              <li key={s.requisition_line_id}>
                <button
                  type="button" onClick={() => addSubstituted(s)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg bg-white px-2 text-left ring-1 ring-sky-100 hover:bg-sky-50"
                >
                  <Plus size={14} className="flex-shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{s.item_name}</span>
                    <span className="block text-[11px] text-gray-500">
                      ordered {num(s.qty_ordered)}{s.unit_label ? ` ${s.unit_label}` : ''}
                      {s.piece_count ? ` (${num(s.piece_count)} pcs)` : ''}
                      {' · from '}{s.from_vendor}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shortfalls.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <strong>{shortfalls.length} item{shortfalls.length === 1 ? '' : 's'} came up short.</strong>{' '}
            You only pay for what arrived — but if the kitchen still needs it, put it on
            tomorrow&apos;s requisition now, while you remember.
          </p>
        </div>
      )}

      {unpriced.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-900">
            <strong>{unpriced.length} item{unpriced.length === 1 ? '' : 's'} have no rate.</strong>{' '}
            The bill would come to zero and reconcile against nothing.
          </p>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-800">Notes</span>
        <textarea
          rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); touch() }}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[720px] items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            {saving === 'saving' && <><Loader2 size={13} className="animate-spin" /> Saving…</>}
            {saving === 'saved'  && <><Check size={13} className="text-green-600" /> Saved</>}
            {saving === 'idle'   && <><CloudOff size={13} /> Not saved yet</>}
          </span>
          <button
            type="button" onClick={handleConfirm}
            disabled={confirming || lines.length === 0 || !vendorId || !date}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest-700 px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> {confirming ? 'Confirming…' : `Confirm · ${formatBDT(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
