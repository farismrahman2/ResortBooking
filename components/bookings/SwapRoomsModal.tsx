'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, RefreshCw, ArrowUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatBDT } from '@/lib/formatters/currency'
import { swapRoomAssignment } from '@/lib/actions/bookings'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { BookingWithRooms, RoomInventoryRow, RoomType } from '@/lib/supabase/types'

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

type TabMode = 'reassign' | 'swap' | 'type_change'

// Minimal row shape used across all three tabs
interface BookingRow {
  id:           string
  room_type:    RoomType
  qty:          number
  unit_price:   number
  room_numbers: string[]
}

interface OverlappingBooking {
  id:             string
  booking_number: string
  customer_name:  string
  visit_date:     string
  check_out_date: string | null
  rooms:          BookingRow[]
}

interface SwapRoomsModalProps {
  open:              boolean
  onClose:           () => void
  booking:           BookingWithRooms
  holidayDates:      string[]
  inventory:         RoomInventoryRow[]
  bookedRoomNumbers: string[]
}

export function SwapRoomsModal({ open, onClose, booking, inventory, bookedRoomNumbers }: SwapRoomsModalProps) {
  const router = useRouter()
  const snap   = booking.package_snapshot

  const [tab,     setTab]     = useState<TabMode>('reassign')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (open) { setError(null); setSuccess(false); setTab('reassign') }
  }, [open])

  function handleSuccess() {
    setSuccess(true)
    setTimeout(() => { onClose(); router.refresh() }, 800)
  }

  return (
    <Modal open={open} onClose={onClose} title="Room Assignment" size="xl">
      <div className="space-y-4">

        {/* Tab selector */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {([
            { key: 'reassign' as TabMode,    icon: RefreshCw,     label: 'Reassign' },
            { key: 'swap' as TabMode,        icon: ArrowLeftRight, label: 'Swap Bookings' },
            { key: 'type_change' as TabMode, icon: ArrowUpDown,    label: 'Change Type / Charge' },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setError(null); setSuccess(false) }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                tab === key
                  ? 'bg-white text-forest-700 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'reassign' && (
          <ReassignTab booking={booking} bookedRoomNumbers={bookedRoomNumbers}
            saving={saving} setSaving={setSaving} error={error} setError={setError} onSuccess={handleSuccess} />
        )}
        {tab === 'swap' && (
          <SwapTab booking={booking} saving={saving} setSaving={setSaving} error={error} setError={setError} onSuccess={handleSuccess} />
        )}
        {tab === 'type_change' && (
          <TypeChangeTab booking={booking} snap={snap} inventory={inventory} bookedRoomNumbers={bookedRoomNumbers}
            saving={saving} setSaving={setSaving} error={error} setError={setError} onSuccess={handleSuccess} />
        )}

        {success && (
          <p className="text-center text-sm font-medium text-green-600">Done! Refreshing...</p>
        )}
      </div>
    </Modal>
  )
}

// ─── Paid / Comp badge helper ────────────────────────────────────────────────

function ChargeBadge({ unitPrice }: { unitPrice: number }) {
  if (unitPrice === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        🎁 Comp
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
      Paid
    </span>
  )
}

// ─── Tab 1: Reassign Room Numbers (row-level) ────────────────────────────────

function ReassignTab({
  booking, bookedRoomNumbers, saving, setSaving, error, setError, onSuccess,
}: {
  booking: BookingWithRooms
  bookedRoomNumbers: string[]
  saving: boolean
  setSaving: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  onSuccess: () => void
}) {
  // Build per-row selections keyed by booking_room.id
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const r of booking.rooms) map[r.id] = [...(r.room_numbers ?? [])]
    return map
  })

  useEffect(() => {
    const map: Record<string, string[]> = {}
    for (const r of booking.rooms) map[r.id] = [...(r.room_numbers ?? [])]
    setSelections(map)
  }, [booking.rooms])

  function toggleNum(rowId: string, num: string, maxQty: number) {
    setSelections((prev) => {
      const current = prev[rowId] ?? []
      if (current.includes(num)) return { ...prev, [rowId]: current.filter((n) => n !== num) }
      if (current.length >= maxQty) return prev
      return { ...prev, [rowId]: [...current, num] }
    })
  }

  const hasChanges = useMemo(() => {
    return booking.rooms.some((r) => {
      const orig = [...(r.room_numbers ?? [])].sort()
      const cur  = [...(selections[r.id] ?? [])].sort()
      return JSON.stringify(orig) !== JSON.stringify(cur)
    })
  }, [booking.rooms, selections])

  // Merged set of locally-taken numbers across ALL other rows in this booking
  function otherRowNumbers(excludeRowId: string): Set<string> {
    const s = new Set<string>()
    for (const r of booking.rooms) {
      if (r.id === excludeRowId) continue
      for (const n of (selections[r.id] ?? [])) s.add(n)
    }
    return s
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      for (const r of booking.rooms) {
        const orig = [...(r.room_numbers ?? [])].sort()
        const cur  = [...(selections[r.id] ?? [])].sort()
        if (JSON.stringify(orig) !== JSON.stringify(cur)) {
          const result = await swapRoomAssignment(booking.id, {
            mode:             'reassign',
            booking_room_id:  r.id,
            new_room_numbers: selections[r.id] ?? [],
          })
          if (!result.success) { setError(result.error ?? 'Failed'); setSaving(false); return }
        }
      }
      onSuccess()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  const rowsWithNumbers = booking.rooms.filter((r) => (ROOM_NUMBERS[r.room_type] ?? []).length > 0)

  if (rowsWithNumbers.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No rooms with assignable numbers in this booking.</p>
  }

  return (
    <div className="space-y-4">
      {rowsWithNumbers.map((r) => {
        const fixedNums = ROOM_NUMBERS[r.room_type] ?? []
        const selected  = selections[r.id] ?? []
        const otherTaken = otherRowNumbers(r.id)
        const isComp = r.unit_price === 0
        return (
          <div key={r.id} className={`rounded-lg border px-4 py-3 ${isComp ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{ROOM_LABELS[r.room_type]}</span>
                <ChargeBadge unitPrice={r.unit_price} />
                <span className="text-xs text-gray-500">({r.qty} room{r.qty !== 1 ? 's' : ''})</span>
              </div>
              <span className="text-xs text-gray-500">{selected.length}/{r.qty} selected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fixedNums.map((num) => {
                const isPicked     = selected.includes(num)
                const takenByOther = bookedRoomNumbers.includes(num) && !isPicked
                const takenByLocal = otherTaken.has(num) && !isPicked
                const isTaken      = takenByOther || takenByLocal
                return (
                  <button
                    key={num}
                    onClick={() => !isTaken && toggleNum(r.id, num, r.qty)}
                    disabled={isTaken}
                    title={takenByOther ? `Room ${num} is booked by another booking` : takenByLocal ? `Room ${num} is assigned to another row in this booking` : undefined}
                    className={[
                      'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                      isPicked
                        ? (isComp
                           ? 'border-emerald-500 bg-emerald-600 text-white'
                           : 'border-forest-500 bg-forest-600 text-white')
                        : isTaken
                        ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-forest-400 hover:bg-forest-50',
                    ].join(' ')}
                  >
                    {num}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="primary" size="sm" loading={saving} disabled={!hasChanges} onClick={handleSave}>
          Save Assignment
        </Button>
      </div>
    </div>
  )
}

// ─── Tab 2: Swap Between Bookings (row-level) ────────────────────────────────

function SwapTab({
  booking, saving, setSaving, error, setError, onSuccess,
}: {
  booking: BookingWithRooms
  saving: boolean
  setSaving: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  onSuccess: () => void
}) {
  const [overlapping, setOverlapping] = useState<OverlappingBooking[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selected,    setSelected]    = useState<OverlappingBooking | null>(null)

  const [sourceRowId, setSourceRowId] = useState<string>('')
  const [targetRowId, setTargetRowId] = useState<string>('')
  const [sourceNew,   setSourceNew]   = useState<string[]>([])
  const [targetNew,   setTargetNew]   = useState<string[]>([])

  useEffect(() => {
    setLoadingList(true)
    fetch(`/api/overlapping-bookings?bookingId=${booking.id}`)
      .then((r) => r.json())
      .then((data) => { setOverlapping(data.overlapping ?? []); setSelected(null) })
      .catch(() => setOverlapping([]))
      .finally(() => setLoadingList(false))
  }, [booking.id])

  const sourceRows = booking.rooms.filter((r) => (r.room_numbers ?? []).length > 0)
  const targetRows = selected?.rooms ?? []

  const sourceRow = sourceRows.find((r) => r.id === sourceRowId)
  const targetRow = targetRows.find((r) => r.id === targetRowId)

  // When rows are picked, initialize sourceNew/targetNew to the CURRENT numbers so
  // user starts from the "no-op" state and edits from there.
  useEffect(() => {
    if (sourceRow) setSourceNew([...(sourceRow.room_numbers ?? [])])
  }, [sourceRowId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (targetRow) setTargetNew([...(targetRow.room_numbers ?? [])])
  }, [targetRowId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pool of numbers available to either side = union of both rows' current numbers
  const pool: string[] = useMemo(() => {
    if (!sourceRow || !targetRow) return []
    const set = new Set<string>([...(sourceRow.room_numbers ?? []), ...(targetRow.room_numbers ?? [])])
    return [...set].sort()
  }, [sourceRow, targetRow])

  // Validation: both sides must be same type, qty, and their output sets partition the pool
  const sameType = sourceRow && targetRow && sourceRow.room_type === targetRow.room_type
  const correctSourceCount = !!sourceRow && sourceNew.length === sourceRow.qty
  const correctTargetCount = !!targetRow && targetNew.length === targetRow.qty
  const noDupes = sourceNew.every((n) => !targetNew.includes(n))
  const coversPool = pool.every((n) => sourceNew.includes(n) || targetNew.includes(n))
  const canSwap   = !!sameType && correctSourceCount && correctTargetCount && noDupes && coversPool

  function toggleSource(num: string) {
    if (!sourceRow) return
    setSourceNew((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num)
      if (prev.length >= sourceRow.qty) return prev
      if (targetNew.includes(num)) setTargetNew((t) => t.filter((n) => n !== num))
      return [...prev, num]
    })
  }
  function toggleTarget(num: string) {
    if (!targetRow) return
    setTargetNew((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num)
      if (prev.length >= targetRow.qty) return prev
      if (sourceNew.includes(num)) setSourceNew((s) => s.filter((n) => n !== num))
      return [...prev, num]
    })
  }

  function selectTarget(b: OverlappingBooking) {
    setSelected(b)
    setSourceRowId(''); setTargetRowId(''); setSourceNew([]); setTargetNew([])
  }

  async function handleSwap() {
    if (!selected || !sourceRow || !targetRow || !canSwap) return
    setSaving(true); setError(null)
    try {
      const result = await swapRoomAssignment(booking.id, {
        mode: 'swap',
        target_booking_id: selected.id,
        source_booking_room_id: sourceRow.id,
        target_booking_room_id: targetRow.id,
        source_new_numbers: sourceNew,
        target_new_numbers: targetNew,
      })
      if (!result.success) setError(result.error ?? 'Swap failed')
      else onSuccess()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  if (loadingList) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Loading overlapping bookings...
      </div>
    )
  }

  if (overlapping.length === 0) {
    return <p className="text-sm text-gray-400 italic py-8 text-center">No overlapping bookings with room assignments found.</p>
  }

  return (
    <div className="space-y-4">
      {!selected ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Select a booking to swap with</p>
          {overlapping.map((b) => (
            <button
              key={b.id}
              onClick={() => selectTarget(b)}
              className="w-full text-left rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{b.booking_number}</span>
                <span className="text-xs text-gray-500">{b.visit_date}{b.check_out_date ? ` → ${b.check_out_date}` : ''}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{b.customer_name}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {b.rooms.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
                    {r.unit_price === 0 && <span className="text-emerald-600">🎁</span>}
                    {ROOM_LABELS[r.room_type]}: #{(r.room_numbers ?? []).join(', #')}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelected(null)} className="text-xs text-forest-600 hover:underline">
            ← Back to booking list
          </button>

          <div className="grid grid-cols-2 gap-4">
            <SwapSide
              title="This Booking" subtitle={booking.booking_number}
              rows={sourceRows} selectedRowId={sourceRowId} onSelectRow={(id) => { setSourceRowId(id); setTargetRowId('') }}
              pool={pool} newNums={sourceNew} onToggle={toggleSource}
              accent="forest" otherNew={targetNew}
            />
            <SwapSide
              title="Target Booking" subtitle={`${selected.booking_number} — ${selected.customer_name}`}
              rows={targetRows} selectedRowId={targetRowId} onSelectRow={setTargetRowId}
              pool={pool} newNums={targetNew} onToggle={toggleTarget}
              accent="indigo" otherNew={sourceNew}
            />
          </div>

          {sourceRow && targetRow && !sameType && (
            <p className="text-xs text-amber-600">Both sides must be the same room type for a direct number swap.</p>
          )}
          {sameType && sourceRow && targetRow && (!correctSourceCount || !correctTargetCount) && (
            <p className="text-xs text-amber-600">
              Each side must keep its original quantity ({sourceRow.qty} / {targetRow.qty}).
            </p>
          )}
          {sameType && sourceRow && targetRow && correctSourceCount && correctTargetCount && (!noDupes || !coversPool) && (
            <p className="text-xs text-amber-600">Every number must go to exactly one side.</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {selected && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="primary" size="sm" loading={saving} disabled={!canSwap} onClick={handleSwap}>
            Swap Rooms
          </Button>
        </div>
      )}
    </div>
  )
}

function SwapSide({
  title, subtitle, rows, selectedRowId, onSelectRow, pool, newNums, onToggle, accent, otherNew,
}: {
  title: string
  subtitle: string
  rows: BookingRow[]
  selectedRowId: string
  onSelectRow: (id: string) => void
  pool: string[]
  newNums: string[]
  onToggle: (num: string) => void
  accent: 'forest' | 'indigo'
  otherNew: string[]
}) {
  const rowsWithNums = rows.filter((r) => (r.room_numbers ?? []).length > 0)
  const pickedBtn    = accent === 'forest' ? 'border-forest-500 bg-forest-600 text-white' : 'border-indigo-500 bg-indigo-600 text-white'
  const hoverBtn     = accent === 'forest' ? 'hover:border-forest-400 hover:bg-forest-50' : 'hover:border-indigo-400 hover:bg-indigo-50'

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-[10px] text-gray-500 mb-2">{subtitle}</p>
      {rowsWithNums.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No rooms with assigned numbers</p>
      ) : (
        <div className="space-y-2">
          {rowsWithNums.map((r) => {
            const isSelected = selectedRowId === r.id
            return (
              <div key={r.id}>
                <button
                  onClick={() => onSelectRow(r.id)}
                  className={`w-full text-left flex items-center gap-2 text-xs font-medium mb-1 ${isSelected ? 'text-forest-700' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  <span>{ROOM_LABELS[r.room_type]} × {r.qty}</span>
                  <ChargeBadge unitPrice={r.unit_price} />
                </button>
                {isSelected && (
                  <div className="flex flex-wrap gap-1">
                    {pool.map((num) => {
                      const isPicked   = newNums.includes(num)
                      const isOnOther  = otherNew.includes(num)
                      return (
                        <button
                          key={num}
                          onClick={() => onToggle(num)}
                          disabled={isOnOther && !isPicked}
                          className={[
                            'rounded border px-2 py-0.5 text-xs font-mono font-semibold transition-colors',
                            isPicked
                              ? pickedBtn
                              : isOnOther
                              ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed'
                              : `border-gray-300 bg-white text-gray-700 ${hoverBtn}`,
                          ].join(' ')}
                        >
                          {num}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Change Type / Charge Mode ────────────────────────────────────────

function TypeChangeTab({
  booking, snap, inventory, bookedRoomNumbers, saving, setSaving, error, setError, onSuccess,
}: {
  booking: BookingWithRooms
  snap: BookingWithRooms['package_snapshot']
  inventory: RoomInventoryRow[]
  bookedRoomNumbers: string[]
  saving: boolean
  setSaving: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  onSuccess: () => void
}) {
  const [rowId,      setRowId]      = useState<string>('')
  const [toType,     setToType]     = useState<RoomType | ''>('')
  const [chargeMode, setChargeMode] = useState<'paid' | 'comp'>('paid')
  const [newNums,    setNewNums]    = useState<string[]>([])

  const row = booking.rooms.find((r) => r.id === rowId)

  const availableTargets = useMemo(() => {
    const prices = snap.room_prices as Record<string, number>
    // For paid mode: only types priced in snapshot
    // For comp mode: any type valid for package type
    return inventory
      .filter((inv) => {
        if (booking.package_type === 'night' && inv.daylong_only) return false
        if (chargeMode === 'paid' && prices[inv.room_type] === undefined) return false
        return true
      })
      .map((inv) => inv.room_type as RoomType)
  }, [snap.room_prices, inventory, booking.package_type, chargeMode])

  // Default toType to the row's current type when row changes
  useEffect(() => {
    if (row) {
      setToType(row.room_type)
      setChargeMode(row.unit_price === 0 ? 'comp' : 'paid')
      setNewNums([...(row.room_numbers ?? [])])
    }
  }, [rowId]) // eslint-disable-line react-hooks/exhaustive-deps

  const fromPrice = row?.unit_price ?? 0
  const toPrice   = chargeMode === 'comp' ? 0 : (toType ? ((snap.room_prices as Record<string, number>)[toType] ?? 0) : 0)
  const nights    = booking.nights ?? 1
  const priceDiff = row ? (toPrice - fromPrice) * row.qty * nights : 0

  const newFixedNums = toType ? (ROOM_NUMBERS[toType] ?? []) : []

  // Other rows in this booking (their room_numbers are locally-taken)
  const otherRowNumbers = useMemo(() => {
    const s = new Set<string>()
    for (const r of booking.rooms) {
      if (r.id === rowId) continue
      for (const n of (r.room_numbers ?? [])) s.add(n)
    }
    return s
  }, [booking.rooms, rowId])

  function toggleNewNum(num: string) {
    if (!row) return
    setNewNums((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num)
      if (prev.length >= row.qty) return prev
      return [...prev, num]
    })
  }

  async function handleSave() {
    if (!row || !toType) return
    if (newFixedNums.length > 0 && newNums.length !== row.qty) {
      setError(`Select ${row.qty} room number${row.qty !== 1 ? 's' : ''}`); return
    }
    setSaving(true); setError(null)
    try {
      const result = await swapRoomAssignment(booking.id, {
        mode: 'type_change',
        booking_room_id:  row.id,
        to_room_type:     toType,
        to_charge_mode:   chargeMode,
        new_room_numbers: newNums,
      })
      if (!result.success) setError(result.error ?? 'Failed')
      else onSuccess()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  if (booking.rooms.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No rooms in this booking to change.</p>
  }

  // Warn if converting paid→comp leaves the booking over-collected
  const overCollected = row && chargeMode === 'comp' && row.unit_price > 0 && (booking.total + priceDiff) < booking.advance_paid
  const overAmt = overCollected ? booking.advance_paid - Math.max(0, booking.total + priceDiff) : 0

  return (
    <div className="space-y-4">
      {/* Source row */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Select row to convert</label>
        <div className="flex flex-wrap gap-2">
          {booking.rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => setRowId(r.id)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                rowId === r.id
                  ? 'border-forest-500 bg-forest-50 text-forest-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <span>{ROOM_LABELS[r.room_type]} ({r.qty})</span>
              <ChargeBadge unitPrice={r.unit_price} />
              <span className="text-gray-400">{formatBDT(r.unit_price)}/rm</span>
            </button>
          ))}
        </div>
      </div>

      {/* Target type + charge mode */}
      {row && (
        <>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Charge Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setChargeMode('paid'); setNewNums([]) }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  chargeMode === 'paid' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >Paid</button>
              <button
                onClick={() => { setChargeMode('comp'); setNewNums([]) }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  chargeMode === 'comp' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >🎁 Complimentary</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">To Room Type</label>
            {availableTargets.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No valid room types available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTargets.map((rt) => {
                  const price = chargeMode === 'comp' ? 0 : ((snap.room_prices as Record<string, number>)[rt] ?? 0)
                  return (
                    <button
                      key={rt}
                      onClick={() => { setToType(rt); setNewNums([]) }}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                        toType === rt ? 'border-forest-500 bg-forest-50 text-forest-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {ROOM_LABELS[rt]}
                      <span className="ml-1 text-gray-400">{chargeMode === 'comp' ? 'Free' : formatBDT(price)}/rm</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Price diff */}
      {row && toType && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          priceDiff > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : priceDiff < 0
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}>
          <p className="font-semibold mb-1">Pricing impact</p>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>From: {ROOM_LABELS[row.room_type]} ({row.unit_price === 0 ? 'Comp' : formatBDT(row.unit_price) + '/rm'})</span>
              <span />
            </div>
            <div className="flex justify-between">
              <span>To: {ROOM_LABELS[toType]} ({chargeMode === 'comp' ? 'Comp' : formatBDT(toPrice) + '/rm'})</span>
              <span />
            </div>
            <div className="flex justify-between font-semibold border-t border-current/20 pt-1 mt-1">
              <span>{row.qty} room{row.qty !== 1 ? 's' : ''} × {nights} night{nights !== 1 ? 's' : ''}</span>
              <span className="font-mono">{priceDiff > 0 ? '+' : ''}{formatBDT(priceDiff)}</span>
            </div>
          </div>
        </div>
      )}

      {overCollected && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          ⚠ After this change, advance paid ({formatBDT(booking.advance_paid)}) exceeds the new total by {formatBDT(overAmt)}.
          Refund the customer manually if needed.
        </div>
      )}

      {/* Room number picker */}
      {row && toType && newFixedNums.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Assign Room Numbers — {ROOM_LABELS[toType]} (select {row.qty})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {newFixedNums.map((num) => {
              const isPicked   = newNums.includes(num)
              const takenExt   = bookedRoomNumbers.includes(num) && !(row.room_numbers ?? []).includes(num) && !isPicked
              const takenLocal = otherRowNumbers.has(num) && !isPicked
              const isTaken    = takenExt || takenLocal
              return (
                <button
                  key={num}
                  onClick={() => !isTaken && toggleNewNum(num)}
                  disabled={isTaken}
                  title={takenExt ? `Room ${num} is booked by another booking` : takenLocal ? `Room ${num} is on another row in this booking` : undefined}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                    isPicked
                      ? (chargeMode === 'comp'
                         ? 'border-emerald-500 bg-emerald-600 text-white'
                         : 'border-forest-500 bg-forest-600 text-white')
                      : isTaken
                      ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-forest-400 hover:bg-forest-50',
                  ].join(' ')}
                >
                  {num}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {row && toType && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            Apply Change
          </Button>
        </div>
      )}
    </div>
  )
}
