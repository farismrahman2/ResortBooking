'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Minus, Trash2, CalendarDays, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { NumberInput } from '@/components/ui/NumberInput'
import { ChangeDatesModal } from '@/components/bookings/ChangeDatesModal'
import { SwapRoomsModal } from '@/components/bookings/SwapRoomsModal'
import { formatBDT } from '@/lib/formatters/currency'
import { calculateDaylong, calculateNight } from '@/lib/engine/calculator'
import { updateAdvancePaid, cancelBooking, updateBooking } from '@/lib/actions/bookings'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { BookingWithRooms, RoomInventoryRow, RoomType, ExtraItem } from '@/lib/supabase/types'

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

interface RoomQty { qty: number; unit_price: number; display_name: string }

interface BookingActionsProps {
  booking:            BookingWithRooms
  holidayDates:       string[]
  inventory:          RoomInventoryRow[]
  bookedRoomNumbers:  string[]   // room numbers taken by other bookings (same dates)
}

export function BookingActions({ booking, holidayDates, inventory, bookedRoomNumbers }: BookingActionsProps) {
  const router  = useRouter()
  const snap    = booking.package_snapshot

  // ── Payment state ─────────────────────────────────────────────────────────
  const [advancePaid,     setAdvancePaid]     = useState(booking.advance_paid)
  const [advanceRequired, setAdvanceRequired] = useState(booking.advance_required)
  const [paymentLoading,  setPaymentLoading]  = useState(false)
  const [paymentError,    setPaymentError]    = useState<string | null>(null)
  const [paymentSuccess,  setPaymentSuccess]  = useState(false)

  // ── Change Dates + Swap Rooms modal state ──────────────────────────────────
  const [changeDatesOpen, setChangeDatesOpen] = useState(false)
  const [swapRoomsOpen,   setSwapRoomsOpen]   = useState(false)

  // ── Edit modal state ──────────────────────────────────────────────────────
  const [editOpen,    setEditOpen]    = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editError,   setEditError]   = useState<string | null>(null)

  const [customerName,  setCustomerName]  = useState(booking.customer_name)
  const [customerPhone, setCustomerPhone] = useState(booking.customer_phone)
  const [customerNotes, setCustomerNotes] = useState(booking.customer_notes ?? '')
  // Recover flat discount from stored effective discount
  const storedPct        = (booking as any).discount_pct ?? 0
  const storedPctAmount  = Math.round(booking.subtotal * storedPct / 100)
  const [discount,           setDiscount]           = useState(Math.max(0, booking.discount - storedPctAmount))
  const [discountPct,        setDiscountPct]        = useState(storedPct)
  const [serviceChargePct,   setServiceChargePct]   = useState(booking.service_charge_pct ?? 0)
  const [adults,             setAdults]             = useState(booking.adults)
  const [childrenPaid,  setChildrenPaid]  = useState(booking.children_paid)
  const [childrenFree,  setChildrenFree]  = useState(booking.children_free)
  const [drivers,       setDrivers]       = useState(booking.drivers)
  const [extraBeds,     setExtraBeds]     = useState(booking.extra_beds)

  // ── Room qty + room number state ──────────────────────────────────────────
  const initialRooms = useMemo(() => {
    const map: Record<string, RoomQty> = {}
    for (const r of booking.rooms) {
      if (r.unit_price > 0) {
        map[r.room_type] = { qty: r.qty, unit_price: r.unit_price, display_name: ROOM_LABELS[r.room_type] ?? r.room_type }
      }
    }
    return map
  }, [booking.rooms])

  const initialNums = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const r of booking.rooms) {
      if (r.unit_price > 0) {
        map[r.room_type] = r.room_numbers ?? []
      }
    }
    return map
  }, [booking.rooms])

  // Complimentary rooms (unit_price === 0) — daylong only
  // Each entry tracks qty AND room_numbers for full assignment parity with paid rooms
  type CompRoomRow = { qty: number; room_numbers: string[] }
  const initialCompRooms = useMemo(() => {
    const map: Record<string, CompRoomRow> = {}
    for (const r of booking.rooms) {
      if (r.unit_price === 0) {
        map[r.room_type] = {
          qty: (map[r.room_type]?.qty ?? 0) + r.qty,
          room_numbers: [...(map[r.room_type]?.room_numbers ?? []), ...(r.room_numbers ?? [])],
        }
      }
    }
    return map
  }, [booking.rooms])

  const [roomQtys,     setRoomQtys]     = useState<Record<string, RoomQty>>(initialRooms)
  const [roomNums,     setRoomNums]     = useState<Record<string, string[]>>(initialNums)
  const [compRoomData, setCompRoomData] = useState<Record<string, CompRoomRow>>(initialCompRooms)
  const [extraItems, setExtraItems] = useState<ExtraItem[]>(() => (booking as any).extra_items ?? [])

  // Available room types filtered by package type + has snapshot price
  const availableRooms = useMemo(() => {
    return inventory.filter((inv) => {
      if (booking.package_type === 'night' && inv.daylong_only) return false
      const price = (snap.room_prices as any)[inv.room_type]
      return price !== undefined
    })
  }, [inventory, booking.package_type, snap.room_prices])

  function setRoomQty(roomType: string, delta: number) {
    const price   = (snap.room_prices as any)[roomType] ?? 0
    const current = roomQtys[roomType]?.qty ?? 0
    const newQty  = Math.max(0, current + delta)

    if (newQty === 0) {
      setRoomQtys((prev) => { const next = { ...prev }; delete next[roomType]; return next })
      setRoomNums((prev) => { const next = { ...prev }; delete next[roomType]; return next })
    } else {
      setRoomQtys((prev) => ({
        ...prev,
        [roomType]: {
          qty:          newQty,
          unit_price:   price,
          display_name: ROOM_LABELS[roomType as RoomType] ?? roomType,
        },
      }))
      // Trim room numbers if qty decreased
      setRoomNums((prev) => ({
        ...prev,
        [roomType]: (prev[roomType] ?? []).slice(0, newQty),
      }))
    }
  }

  function toggleRoomNumber(roomType: string, roomNum: string) {
    setRoomNums((prev) => {
      const current = prev[roomType] ?? []
      const maxQty  = roomQtys[roomType]?.qty ?? 0
      if (current.includes(roomNum)) {
        return { ...prev, [roomType]: current.filter((n) => n !== roomNum) }
      }
      if (current.length >= maxQty) return prev   // can't select more than qty
      return { ...prev, [roomType]: [...current, roomNum] }
    })
  }

  // Live recalculation
  const liveCalc = useMemo(() => {
    const rooms = Object.entries(roomQtys).map(([rt, r]) => ({
      room_type:    rt,
      display_name: r.display_name,
      qty:          r.qty,
      unit_price:   r.unit_price,
    }))
    try {
      if (booking.package_type === 'daylong') {
        return calculateDaylong({
          date:               new Date(booking.visit_date + 'T00:00:00'),
          packageRates:       snap,
          rooms,
          adults,
          children_paid:      childrenPaid,
          children_free:      childrenFree,
          drivers,
          holidayDates,
          discount,
          discount_pct:       discountPct,
          service_charge_pct: serviceChargePct,
          advance_required:   advanceRequired,
          advance_paid:       advancePaid,
          extra_items:        extraItems,
        })
      } else {
        return calculateNight({
          checkInDate:        new Date(booking.visit_date + 'T00:00:00'),
          checkOutDate:       new Date(booking.check_out_date! + 'T00:00:00'),
          packageRates:       snap,
          rooms,
          adults,
          children_paid:      childrenPaid,
          children_free:      childrenFree,
          drivers,
          extra_beds:         extraBeds,
          holidayDates,
          discount,
          discount_pct:       discountPct,
          service_charge_pct: serviceChargePct,
          advance_required:   advanceRequired,
          advance_paid:       advancePaid,
          extra_items:        extraItems,
        })
      }
    } catch {
      return null
    }
  }, [roomQtys, adults, childrenPaid, childrenFree, drivers, extraBeds, discount, discountPct, serviceChargePct, advancePaid, advanceRequired, extraItems, booking, snap, holidayDates])

  // ── Cancel state ──────────────────────────────────────────────────────────
  const [cancelOpen,    setCancelOpen]    = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError,   setCancelError]   = useState<string | null>(null)

  const localRemaining = Math.max(0, advanceRequired - advancePaid)

  async function handleUpdatePayment() {
    setPaymentLoading(true); setPaymentError(null); setPaymentSuccess(false)
    try {
      const result = await updateAdvancePaid(booking.id, advancePaid, advanceRequired)
      if (!result.success) { setPaymentError(result.error ?? 'Update failed') }
      else { setPaymentSuccess(true); router.refresh(); setTimeout(() => setPaymentSuccess(false), 2500) }
    } catch (err) { setPaymentError(String(err)) }
    finally { setPaymentLoading(false) }
  }

  async function handleSaveEdit() {
    if (booking.package_type === 'night' && Object.keys(roomQtys).length === 0) {
      setEditError('At least one room is required for night stays'); return
    }
    setEditLoading(true); setEditError(null)
    try {
      // Paid rooms
      const paidRooms = Object.entries(roomQtys).map(([rt, r]) => ({
        room_type:    rt as RoomType,
        display_name: r.display_name,
        qty:          r.qty,
        unit_price:   r.unit_price,
        room_numbers: roomNums[rt] ?? [],
      }))
      // Complimentary rooms (daylong only, unit_price=0) — with room_numbers
      const compRooms = booking.package_type === 'daylong'
        ? Object.entries(compRoomData)
            .filter(([, row]) => row.qty > 0)
            .map(([rt, row]) => ({
              room_type:    rt as RoomType,
              display_name: ROOM_LABELS[rt as RoomType] ?? rt,
              qty:          row.qty,
              unit_price:   0,
              room_numbers: row.room_numbers.slice(0, row.qty),
            }))
        : []
      const rooms = [...paidRooms, ...compRooms]
      const result = await updateBooking(booking.id, {
        customer_name:      customerName.trim(),
        customer_phone:     customerPhone.trim(),
        customer_notes:     customerNotes.trim() || null,
        discount,
        discount_pct:       discountPct,
        service_charge_pct: serviceChargePct,
        advance_paid:       advancePaid,
        advance_required:   advanceRequired,
        adults,
        children_paid:      childrenPaid,
        children_free:      childrenFree,
        drivers,
        extra_beds:         extraBeds,
        rooms,
        extra_items:        extraItems,
        package_type:       booking.package_type,
        visit_date:         booking.visit_date,
        check_out_date:     booking.check_out_date,
        package_snapshot:   snap,
      })
      if (!result.success) { setEditError(result.error ?? 'Save failed') }
      else { setEditOpen(false); router.refresh() }
    } catch (err) { setEditError(String(err)) }
    finally { setEditLoading(false) }
  }

  async function handleCancel() {
    setCancelLoading(true); setCancelError(null)
    try {
      const result = await cancelBooking(booking.id)
      if (!result.success) { setCancelError(result.error ?? 'Cancel failed') }
      else { setCancelOpen(false); router.refresh() }
    } catch (err) { setCancelError(String(err)) }
    finally { setCancelLoading(false) }
  }

  return (
    <div className="space-y-5">

      {/* ── Edit Booking ─────────────────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Edit Booking</h4>
        <Button variant="outline" size="sm" onClick={() => { setEditOpen(true); setEditError(null) }} className="w-full">
          Edit Details
        </Button>
      </div>

      {/* ── Change Dates ─────────────────────────────────────── */}
      {booking.status === 'confirmed' && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Schedule</h4>
          <Button variant="outline" size="sm" onClick={() => setChangeDatesOpen(true)} className="w-full gap-1.5">
            <CalendarDays size={13} />
            Change Dates
          </Button>
        </div>
      )}

      {/* ── Swap Rooms ───────────────────────────────────────── */}
      {booking.status === 'confirmed' && booking.rooms.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Room Assignment</h4>
          <Button variant="outline" size="sm" onClick={() => setSwapRoomsOpen(true)} className="w-full gap-1.5">
            <ArrowLeftRight size={13} />
            Swap Rooms
          </Button>
        </div>
      )}

      {/* ── Payment Section ─────────────────────────────────── */}
      <div className="space-y-3 border-t border-gray-100 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Update Payment</h4>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Advance Paid" prefix="৳" value={advancePaid} onChange={setAdvancePaid} />
          <NumberInput label="Advance Required" prefix="৳" value={advanceRequired} onChange={setAdvanceRequired} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Due Advance</span>
            <span className="font-mono font-medium text-gray-800">{formatBDT(advanceRequired)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-700">Remaining</span>
            <span className={`font-mono font-bold ${localRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {localRemaining > 0 ? formatBDT(localRemaining) : 'Fully Paid'}
            </span>
          </div>
        </div>
        {paymentError   && <p className="text-xs text-red-600">{paymentError}</p>}
        {paymentSuccess && <p className="text-xs font-medium text-green-600">Payment updated successfully.</p>}
        <Button variant="primary" size="sm" loading={paymentLoading} onClick={handleUpdatePayment} className="w-full">
          Update Payment
        </Button>
      </div>

      {/* ── Cancel Booking ───────────────────────────────────── */}
      {booking.status === 'confirmed' && (
        <div className="border-t border-gray-100 pt-4">
          <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)} className="w-full">
            Cancel Booking
          </Button>
        </div>
      )}

      {/* ── Back to Quote link ───────────────────────────────── */}
      {booking.quote_id && (
        <div className="border-t border-gray-100 pt-4">
          <Link
            href={`/quotes/${booking.quote_id}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Back to Quote
          </Link>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Booking" size="lg">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* Customer */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Customer</h5>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name"  value={customerName}  onChange={(e) => setCustomerName(e.target.value)} />
              <Input label="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="mt-3">
              <Textarea label="Notes" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} />
            </div>
          </div>

          {/* Rooms + Room Number Picker */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Rooms</h5>
            <div className="space-y-3">
              {availableRooms.map((inv) => {
                const price      = (snap.room_prices as any)[inv.room_type] ?? 0
                const current    = roomQtys[inv.room_type]?.qty ?? 0
                const fixedNums  = ROOM_NUMBERS[inv.room_type as RoomType] ?? []
                const selected   = roomNums[inv.room_type] ?? []

                return (
                  <div key={inv.room_type} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    {/* Qty row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{inv.display_name}</p>
                        <p className="text-xs text-gray-500">{formatBDT(price)} / room{booking.package_type === 'night' ? ' / night' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRoomQty(inv.room_type, -1)}
                          disabled={current === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold text-gray-900 tabular-nums">{current}</span>
                        <button
                          onClick={() => setRoomQty(inv.room_type, +1)}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Room number picker — shown when qty > 0 and fixed numbers exist */}
                    {current > 0 && fixedNums.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                          Room Numbers — select {current}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {fixedNums.map((num) => {
                            const isTaken    = bookedRoomNumbers.includes(num) && !selected.includes(num)
                            const isSelected = selected.includes(num)
                            return (
                              <button
                                key={num}
                                onClick={() => !isTaken && toggleRoomNumber(inv.room_type, num)}
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
                        {selected.length < current && (
                          <p className="mt-1.5 text-[10px] text-amber-600">
                            Select {current - selected.length} more room{current - selected.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Complimentary Rooms (daylong only) */}
          {booking.package_type === 'daylong' && (() => {
            // Build locally-taken set from paid rooms (each comp row also excludes others)
            const locallyTakenByPaid = new Set<string>()
            for (const nums of Object.values(roomNums)) {
              for (const n of nums) locallyTakenByPaid.add(n)
            }
            return (
              <div>
                <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Complimentary Rooms</h5>
                <p className="text-xs text-gray-400 italic mb-2">Rooms at no charge — won't affect totals.</p>
                <div className="space-y-2">
                  {availableRooms.map((inv) => {
                    const row = compRoomData[inv.room_type] ?? { qty: 0, room_numbers: [] }
                    const qty = row.qty
                    const fixedNums = ROOM_NUMBERS[inv.room_type as RoomType] ?? []
                    const selectedNums = row.room_numbers

                    // Other comp rows' numbers (exclude this row's own)
                    const otherCompTaken = new Set<string>()
                    for (const [rt, r] of Object.entries(compRoomData)) {
                      if (rt !== inv.room_type) {
                        for (const n of r.room_numbers) otherCompTaken.add(n)
                      }
                    }

                    return (
                      <div
                        key={inv.room_type}
                        className={`rounded-lg border px-4 py-2.5 transition-colors ${
                          qty > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{inv.display_name}</p>
                            <p className="text-xs text-emerald-600 font-medium">Complimentary · Free</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCompRoomData((prev) => {
                                const next = { ...prev }
                                const cur = prev[inv.room_type] ?? { qty: 0, room_numbers: [] }
                                const newQty = Math.max(0, cur.qty - 1)
                                if (newQty === 0) delete next[inv.room_type]
                                else next[inv.room_type] = { qty: newQty, room_numbers: cur.room_numbers.slice(0, newQty) }
                                return next
                              })}
                              disabled={qty === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                            >
                              <Minus size={13} />
                            </button>
                            <span className={`w-5 text-center text-sm font-semibold tabular-nums ${qty > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>{qty}</span>
                            <button
                              onClick={() => setCompRoomData((prev) => {
                                const cur = prev[inv.room_type] ?? { qty: 0, room_numbers: [] }
                                return { ...prev, [inv.room_type]: { qty: cur.qty + 1, room_numbers: cur.room_numbers } }
                              })}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Room number picker for comp rows with fixed numbers */}
                        {qty > 0 && fixedNums.length > 0 && (
                          <div className="mt-3 pt-2 border-t border-emerald-200">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                              Room Numbers — select {qty}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {fixedNums.map((num) => {
                                const isPickedHere = selectedNums.includes(num)
                                const isTakenByBooked = bookedRoomNumbers.includes(num) && !isPickedHere
                                const isTakenByLocalPaid = locallyTakenByPaid.has(num) && !isPickedHere
                                const isTakenByOtherComp = otherCompTaken.has(num) && !isPickedHere
                                const isTaken = isTakenByBooked || isTakenByLocalPaid || isTakenByOtherComp
                                return (
                                  <button
                                    key={num}
                                    onClick={() => !isTaken && setCompRoomData((prev) => {
                                      const cur = prev[inv.room_type] ?? { qty: 0, room_numbers: [] }
                                      let newNums: string[]
                                      if (cur.room_numbers.includes(num)) {
                                        newNums = cur.room_numbers.filter((n) => n !== num)
                                      } else {
                                        if (cur.room_numbers.length >= cur.qty) return prev
                                        newNums = [...cur.room_numbers, num]
                                      }
                                      return { ...prev, [inv.room_type]: { ...cur, room_numbers: newNums } }
                                    })}
                                    disabled={isTaken}
                                    title={isTakenByBooked ? `Room ${num} is booked by another booking` : isTakenByLocalPaid ? `Room ${num} is assigned to a paid row here` : isTakenByOtherComp ? `Room ${num} is assigned to another comp row` : undefined}
                                    className={[
                                      'rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors',
                                      isPickedHere
                                        ? 'border-emerald-500 bg-emerald-600 text-white'
                                        : isTaken
                                        ? 'border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed'
                                        : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-400 hover:bg-emerald-50',
                                    ].join(' ')}
                                  >
                                    {num}
                                  </button>
                                )
                              })}
                            </div>
                            {selectedNums.length < qty && (
                              <p className="mt-1.5 text-[10px] text-amber-600">
                                Select {qty - selectedNums.length} more room{qty - selectedNums.length !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Guests */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Guests & Pricing</h5>
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="Adults"           value={adults}       onChange={setAdults}       min={1} />
              <NumberInput label="Children (paid)"  value={childrenPaid} onChange={setChildrenPaid} min={0} />
              <NumberInput label="Children (free)"  value={childrenFree} onChange={setChildrenFree} min={0} />
              <NumberInput label="Drivers"          value={drivers}      onChange={setDrivers}      min={0} />
              {booking.package_type === 'night' && (
                <NumberInput label="Extra Beds"     value={extraBeds}    onChange={setExtraBeds}    min={0} />
              )}
              <NumberInput label="Flat Discount (৳)"    value={discount}          onChange={setDiscount}          min={0} prefix="৳" />
              <NumberInput label="Discount %"          value={discountPct}       onChange={setDiscountPct}       min={0} suffix="%" />
              <NumberInput label="Service Charge (%)"  value={serviceChargePct}  onChange={setServiceChargePct}  min={0} suffix="%" />
            </div>
          </div>

          {/* Extra Items */}
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Extra Items</h5>
            <div className="space-y-2">
              {extraItems.length === 0 && (
                <p className="text-xs text-gray-400 italic">No extra items added.</p>
              )}
              {extraItems.map((item, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Item Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Transport, Bonfire..."
                      value={item.label}
                      onChange={(e) => setExtraItems((prev) => prev.map((it, i) => i === index ? { ...it, label: e.target.value } : it))}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                    />
                  </div>
                  <div className="w-16 flex-shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(e) => setExtraItems((prev) => prev.map((it, i) => i === index ? { ...it, qty: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 tabular-nums"
                    />
                  </div>
                  <div className="w-28 flex-shrink-0">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit Price (৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={item.unit_price}
                      onChange={(e) => setExtraItems((prev) => prev.map((it, i) => i === index ? { ...it, unit_price: Math.max(0, parseInt(e.target.value) || 0) } : it))}
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 tabular-nums"
                    />
                  </div>
                  <button
                    onClick={() => setExtraItems((prev) => prev.filter((_, i) => i !== index))}
                    className="mb-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setExtraItems((prev) => [...prev, { label: '', qty: 1, unit_price: 0 }])}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-700 hover:bg-forest-100 transition-colors"
              >
                <Plus size={12} />
                Add Extra Item
              </button>
            </div>
          </div>

          {/* Live pricing preview */}
          {liveCalc && (
            <div className="rounded-lg border border-forest-200 bg-forest-50 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-forest-700 mb-2">Updated Pricing</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-mono text-gray-800">{formatBDT(liveCalc.subtotal)}</span>
              </div>
              {liveCalc.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-mono text-red-600">-{formatBDT(liveCalc.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-forest-200 pt-1.5 mt-1">
                <span className="text-forest-800">New Total</span>
                <span className="font-mono text-forest-800">{formatBDT(liveCalc.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 pt-0.5">
                <span>Remaining after advance</span>
                <span className={`font-mono font-medium ${liveCalc.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {liveCalc.remaining > 0 ? formatBDT(liveCalc.remaining) : 'Fully Paid'}
                </span>
              </div>
            </div>
          )}

          {editError && <p className="text-xs text-red-600">{editError}</p>}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={editLoading}>Cancel</Button>
            <Button variant="primary" size="sm" loading={editLoading} onClick={handleSaveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel Confirmation Modal ─────────────────────────── */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Booking" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to cancel booking{' '}
            <span className="font-mono font-semibold">{booking.booking_number}</span>?
            This action cannot be undone.
          </p>
          {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)} disabled={cancelLoading}>Keep Booking</Button>
            <Button variant="danger"  size="sm" loading={cancelLoading} onClick={handleCancel}>Yes, Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Change Dates Modal ───────────────────────────────── */}
      <ChangeDatesModal
        open={changeDatesOpen}
        onClose={() => setChangeDatesOpen(false)}
        booking={booking}
        holidayDates={holidayDates}
      />

      {/* ── Swap Rooms Modal ─────────────────────────────────── */}
      <SwapRoomsModal
        open={swapRoomsOpen}
        onClose={() => setSwapRoomsOpen(false)}
        booking={booking}
        holidayDates={holidayDates}
        inventory={inventory}
        bookedRoomNumbers={bookedRoomNumbers}
      />
    </div>
  )
}
