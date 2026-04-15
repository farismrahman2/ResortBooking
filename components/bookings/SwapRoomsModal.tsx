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

interface OverlappingBooking {
  id:             string
  booking_number: string
  customer_name:  string
  visit_date:     string
  check_out_date: string | null
  rooms:          { room_type: RoomType; qty: number; room_numbers: string[] }[]
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

  // Reset on open
  useEffect(() => {
    if (open) { setError(null); setSuccess(false); setTab('reassign') }
  }, [open])

  function handleSuccess() {
    setSuccess(true)
    setTimeout(() => {
      onClose()
      router.refresh()
    }, 800)
  }

  return (
    <Modal open={open} onClose={onClose} title="Room Assignment" size="xl">
      <div className="space-y-4">

        {/* Tab selector */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {([
            { key: 'reassign' as TabMode, icon: RefreshCw, label: 'Reassign' },
            { key: 'swap' as TabMode,     icon: ArrowLeftRight, label: 'Swap Bookings' },
            { key: 'type_change' as TabMode, icon: ArrowUpDown, label: 'Change Type' },
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

        {/* Tab content */}
        {tab === 'reassign' && (
          <ReassignTab
            booking={booking}
            bookedRoomNumbers={bookedRoomNumbers}
            saving={saving}
            setSaving={setSaving}
            error={error}
            setError={setError}
            onSuccess={handleSuccess}
          />
        )}
        {tab === 'swap' && (
          <SwapTab
            booking={booking}
            saving={saving}
            setSaving={setSaving}
            error={error}
            setError={setError}
            onSuccess={handleSuccess}
          />
        )}
        {tab === 'type_change' && (
          <TypeChangeTab
            booking={booking}
            snap={snap}
            inventory={inventory}
            bookedRoomNumbers={bookedRoomNumbers}
            saving={saving}
            setSaving={setSaving}
            error={error}
            setError={setError}
            onSuccess={handleSuccess}
          />
        )}

        {success && (
          <p className="text-center text-sm font-medium text-green-600">Done! Refreshing...</p>
        )}
      </div>
    </Modal>
  )
}

// ─── Tab 1: Reassign Room Numbers ────────────────────────────────────────────

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
  // Build initial room number selections from booking
  const [selections, setSelections] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    for (const r of booking.rooms) {
      map[r.room_type] = [...(r.room_numbers ?? [])]
    }
    return map
  })

  // Reset when modal opens
  useEffect(() => {
    const map: Record<string, string[]> = {}
    for (const r of booking.rooms) map[r.room_type] = [...(r.room_numbers ?? [])]
    setSelections(map)
  }, [booking.rooms])

  function toggleNum(roomType: string, num: string) {
    setSelections((prev) => {
      const current = prev[roomType] ?? []
      const maxQty  = booking.rooms.find((r) => r.room_type === roomType)?.qty ?? 0
      if (current.includes(num)) {
        return { ...prev, [roomType]: current.filter((n) => n !== num) }
      }
      if (current.length >= maxQty) return prev
      return { ...prev, [roomType]: [...current, num] }
    })
  }

  const hasChanges = useMemo(() => {
    return booking.rooms.some((r) => {
      const original = [...(r.room_numbers ?? [])].sort()
      const current  = [...(selections[r.room_type] ?? [])].sort()
      return JSON.stringify(original) !== JSON.stringify(current)
    })
  }, [booking.rooms, selections])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      // Save each room type that changed
      for (const r of booking.rooms) {
        const original = [...(r.room_numbers ?? [])].sort()
        const current  = [...(selections[r.room_type] ?? [])].sort()
        if (JSON.stringify(original) !== JSON.stringify(current)) {
          const result = await swapRoomAssignment(booking.id, {
            mode:             'reassign',
            room_type:        r.room_type,
            new_room_numbers: selections[r.room_type] ?? [],
          })
          if (!result.success) { setError(result.error ?? 'Failed'); setSaving(false); return }
        }
      }
      onSuccess()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  const roomsWithNumbers = booking.rooms.filter((r) => {
    const fixed = ROOM_NUMBERS[r.room_type] ?? []
    return fixed.length > 0
  })

  if (roomsWithNumbers.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No rooms with assignable room numbers in this booking.</p>
  }

  return (
    <div className="space-y-4">
      {roomsWithNumbers.map((r) => {
        const fixedNums = ROOM_NUMBERS[r.room_type] ?? []
        const selected  = selections[r.room_type] ?? []

        return (
          <div key={r.room_type} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-medium text-gray-800">{ROOM_LABELS[r.room_type]}</span>
                <span className="ml-2 text-xs text-gray-500">({r.qty} room{r.qty !== 1 ? 's' : ''})</span>
              </div>
              <span className="text-xs text-gray-500">
                {selected.length}/{r.qty} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {fixedNums.map((num) => {
                const isTaken    = bookedRoomNumbers.includes(num) && !selected.includes(num)
                const isSelected = selected.includes(num)
                return (
                  <button
                    key={num}
                    onClick={() => !isTaken && toggleNum(r.room_type, num)}
                    disabled={isTaken}
                    title={isTaken ? `Room ${num} is booked` : undefined}
                    className={[
                      'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                      isSelected
                        ? 'border-forest-500 bg-forest-600 text-white'
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

// ─── Tab 2: Swap with Another Booking ────────────────────────────────────────

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

  // Source room selection
  const [sourceRoom, setSourceRoom] = useState<string>('')
  const [sourceNums, setSourceNums] = useState<string[]>([])
  // Target room selection
  const [targetRoom, setTargetRoom] = useState<string>('')
  const [targetNums, setTargetNums] = useState<string[]>([])

  // Fetch overlapping bookings
  useEffect(() => {
    setLoadingList(true)
    fetch(`/api/overlapping-bookings?bookingId=${booking.id}`)
      .then((r) => r.json())
      .then((data) => {
        setOverlapping(data.overlapping ?? [])
        setSelected(null)
      })
      .catch(() => setOverlapping([]))
      .finally(() => setLoadingList(false))
  }, [booking.id])

  function selectTarget(b: OverlappingBooking) {
    setSelected(b)
    setSourceRoom('')
    setSourceNums([])
    setTargetRoom('')
    setTargetNums([])
  }

  // Get source rooms with numbers
  const sourceRoomsWithNums = booking.rooms.filter((r) => (r.room_numbers ?? []).length > 0)
  const targetRoomsWithNums = selected?.rooms.filter((r) => (r.room_numbers ?? []).length > 0) ?? []

  function toggleSourceNum(num: string) {
    setSourceNums((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    )
  }
  function toggleTargetNum(num: string) {
    setTargetNums((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
    )
  }

  const canSwap = sourceNums.length > 0 && targetNums.length > 0 && sourceNums.length === targetNums.length && sourceRoom && targetRoom && sourceRoom === targetRoom

  async function handleSwap() {
    if (!selected || !canSwap) return
    setSaving(true); setError(null)
    try {
      const result = await swapRoomAssignment(booking.id, {
        mode:              'swap',
        target_booking_id: selected.id,
        source_gives:      { room_type: sourceRoom as RoomType, room_numbers: sourceNums },
        target_gives:      { room_type: targetRoom as RoomType, room_numbers: targetNums },
      })
      if (!result.success) { setError(result.error ?? 'Swap failed') }
      else { onSuccess() }
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
      {/* Booking selector */}
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
                  <span key={r.room_type} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-mono text-gray-600">
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
            {/* Source side */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">This Booking</p>
              <p className="text-[10px] text-gray-500 mb-2">{booking.booking_number}</p>
              {sourceRoomsWithNums.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No rooms with assigned numbers</p>
              ) : (
                <div className="space-y-2">
                  {sourceRoomsWithNums.map((r) => (
                    <div key={r.room_type}>
                      <button
                        onClick={() => { setSourceRoom(r.room_type); setSourceNums([]) }}
                        className={`text-xs font-medium mb-1 ${sourceRoom === r.room_type ? 'text-forest-700' : 'text-gray-600 hover:text-gray-800'}`}
                      >
                        {ROOM_LABELS[r.room_type]}
                      </button>
                      {sourceRoom === r.room_type && (
                        <div className="flex flex-wrap gap-1">
                          {(r.room_numbers ?? []).map((num) => (
                            <button
                              key={num}
                              onClick={() => toggleSourceNum(num)}
                              className={`rounded border px-2 py-0.5 text-xs font-mono font-semibold transition-colors ${
                                sourceNums.includes(num)
                                  ? 'border-forest-500 bg-forest-600 text-white'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-forest-400'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Target side */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Target Booking</p>
              <p className="text-[10px] text-gray-500 mb-2">{selected.booking_number} — {selected.customer_name}</p>
              {targetRoomsWithNums.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No rooms with assigned numbers</p>
              ) : (
                <div className="space-y-2">
                  {targetRoomsWithNums.map((r) => (
                    <div key={r.room_type}>
                      <button
                        onClick={() => { setTargetRoom(r.room_type); setTargetNums([]) }}
                        className={`text-xs font-medium mb-1 ${targetRoom === r.room_type ? 'text-forest-700' : 'text-gray-600 hover:text-gray-800'}`}
                      >
                        {ROOM_LABELS[r.room_type]}
                      </button>
                      {targetRoom === r.room_type && (
                        <div className="flex flex-wrap gap-1">
                          {(r.room_numbers ?? []).map((num) => (
                            <button
                              key={num}
                              onClick={() => toggleTargetNum(num)}
                              className={`rounded border px-2 py-0.5 text-xs font-mono font-semibold transition-colors ${
                                targetNums.includes(num)
                                  ? 'border-indigo-500 bg-indigo-600 text-white'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-400'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sourceNums.length > 0 && targetNums.length > 0 && sourceNums.length !== targetNums.length && (
            <p className="text-xs text-amber-600">Select the same number of rooms on each side to swap.</p>
          )}
          {sourceRoom && targetRoom && sourceRoom !== targetRoom && (
            <p className="text-xs text-amber-600">Both sides must be the same room type for a direct swap.</p>
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

// ─── Tab 3: Change Room Type ─────────────────────────────────────────────────

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
  const [fromType,    setFromType]    = useState<RoomType | ''>('')
  const [toType,      setToType]      = useState<RoomType | ''>('')
  const [qty,         setQty]         = useState(1)
  const [newNums,     setNewNums]     = useState<string[]>([])

  // Available target room types (must be in snapshot and different from source)
  const availableTargets = useMemo(() => {
    const prices = snap.room_prices as Record<string, number>
    return Object.keys(prices)
      .filter((rt) => rt !== fromType && prices[rt] !== undefined)
      .filter((rt) => {
        const inv = inventory.find((i) => i.room_type === rt)
        if (!inv) return false
        if (booking.package_type === 'night' && inv.daylong_only) return false
        return true
      }) as RoomType[]
  }, [snap.room_prices, fromType, inventory, booking.package_type])

  // Pricing info
  const fromPrice = fromType ? ((snap.room_prices as Record<string, number>)[fromType] ?? 0) : 0
  const toPrice   = toType   ? ((snap.room_prices as Record<string, number>)[toType]   ?? 0) : 0
  const nights    = booking.nights ?? 1
  const priceDiff = (toPrice - fromPrice) * qty * nights

  // Source room max qty
  const sourceRow = fromType ? booking.rooms.find((r) => r.room_type === fromType) : null
  const maxQty    = sourceRow?.qty ?? 0

  // New room type fixed nums
  const newFixedNums = toType ? (ROOM_NUMBERS[toType] ?? []) : []

  function toggleNewNum(num: string) {
    setNewNums((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num)
      if (prev.length >= qty) return prev
      return [...prev, num]
    })
  }

  async function handleSave() {
    if (!fromType || !toType || qty < 1) return
    setSaving(true); setError(null)
    try {
      const result = await swapRoomAssignment(booking.id, {
        mode:             'type_change',
        from_room_type:   fromType,
        to_room_type:     toType,
        qty,
        new_room_numbers: newNums,
      })
      if (!result.success) { setError(result.error ?? 'Failed') }
      else { onSuccess() }
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  if (booking.rooms.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No rooms in this booking to change.</p>
  }

  return (
    <div className="space-y-4">
      {/* Source room type */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">From Room Type</label>
        <div className="flex flex-wrap gap-2">
          {booking.rooms.map((r) => (
            <button
              key={r.room_type}
              onClick={() => { setFromType(r.room_type); setToType(''); setQty(1); setNewNums([]) }}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                fromType === r.room_type
                  ? 'border-forest-500 bg-forest-50 text-forest-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {ROOM_LABELS[r.room_type]} ({r.qty})
              <span className="ml-1 text-gray-400">{formatBDT(r.unit_price)}/rm</span>
            </button>
          ))}
        </div>
      </div>

      {/* Target room type */}
      {fromType && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">To Room Type</label>
          {availableTargets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No other room types available in this package.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTargets.map((rt) => {
                const price = (snap.room_prices as Record<string, number>)[rt] ?? 0
                return (
                  <button
                    key={rt}
                    onClick={() => { setToType(rt); setNewNums([]) }}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      toType === rt
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {ROOM_LABELS[rt]}
                    <span className="ml-1 text-gray-400">{formatBDT(price)}/rm</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Quantity */}
      {fromType && toType && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Quantity to change (max {maxQty})
          </label>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={qty}
            onChange={(e) => {
              const v = Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1))
              setQty(v)
              setNewNums([])
            }}
            className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
        </div>
      )}

      {/* Price difference */}
      {fromType && toType && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          priceDiff > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : priceDiff < 0
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}>
          <p className="font-semibold mb-1">Price difference</p>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span>{ROOM_LABELS[fromType]}</span>
              <span className="font-mono">{formatBDT(fromPrice)}/rm{booking.package_type === 'night' ? '/night' : ''}</span>
            </div>
            <div className="flex justify-between">
              <span>{ROOM_LABELS[toType as RoomType]}</span>
              <span className="font-mono">{formatBDT(toPrice)}/rm{booking.package_type === 'night' ? '/night' : ''}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-current/20 pt-1 mt-1">
              <span>{qty} room{qty !== 1 ? 's' : ''} x {nights} night{nights !== 1 ? 's' : ''}</span>
              <span className="font-mono">
                {priceDiff > 0 ? '+' : ''}{formatBDT(priceDiff)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* New room number picker */}
      {fromType && toType && newFixedNums.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Assign Room Numbers — {ROOM_LABELS[toType as RoomType]} (select {qty})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {newFixedNums.map((num) => {
              const isTaken    = bookedRoomNumbers.includes(num) && !newNums.includes(num)
              const isSelected = newNums.includes(num)
              return (
                <button
                  key={num}
                  onClick={() => !isTaken && toggleNewNum(num)}
                  disabled={isTaken}
                  className={[
                    'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                    isSelected
                      ? 'border-forest-500 bg-forest-600 text-white'
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

      {fromType && toType && (
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!fromType || !toType || qty < 1}
            onClick={handleSave}
          >
            Change Room Type
          </Button>
        </div>
      )}
    </div>
  )
}
