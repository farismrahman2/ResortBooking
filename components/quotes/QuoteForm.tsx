'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { CreateQuoteSchema, type CreateQuoteInput } from '@/lib/validators/quote'
import { createQuote, updateQuote } from '@/lib/actions/quotes'
import { calculateDaylong, calculateNight, type CalculationResult, type RoomSelection } from '@/lib/engine/calculator'
import { getDayType } from '@/lib/formatters/dates'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { PackageSelector } from '@/components/quotes/PackageSelector'
import { RoomSelector } from '@/components/quotes/RoomSelector'
import { GuestInputs, type GuestValues } from '@/components/quotes/GuestInputs'
import { PricingBreakdown } from '@/components/quotes/PricingBreakdown'
import { ROOM_NUMBERS } from '@/lib/config/rooms'
import type { PackageWithPrices, RoomInventoryRow, SettingsMap, ExtraItem, RoomType } from '@/lib/supabase/types'

interface QuoteFormProps {
  packages: PackageWithPrices[]
  rooms: RoomInventoryRow[]
  holidayDates: string[]
  settings: SettingsMap
  // Edit mode — when provided, form pre-fills and calls updateQuote
  quoteId?: string
  initialValues?: Partial<CreateQuoteInput>
  initialExtraItems?: ExtraItem[]
}

const DAY_LABELS = {
  friday:  { label: 'Friday Rate', variant: 'warning' as const },
  holiday: { label: 'Holiday Rate', variant: 'danger' as const },
  weekday: { label: 'Weekday Rate', variant: 'default' as const },
}

export function QuoteForm({ packages, rooms, holidayDates, settings, quoteId, initialValues, initialExtraItems }: QuoteFormProps) {
  const router = useRouter()
  const isEditMode = !!quoteId
  const [submitting,         setSubmitting]         = useState(false)
  const [errorMsg,           setErrorMsg]           = useState<string | null>(null)
  const [calcResult,         setCalcResult]         = useState<CalculationResult | null>(null)
  const [bookedRoomNumbers,    setBookedRoomNumbers]    = useState<string[]>([])
  const [extraItems,           setExtraItems]           = useState<ExtraItem[]>(initialExtraItems ?? [])
  const [roomAvailableAfterNoon, setRoomAvailableAfterNoon] = useState(false)

  // Separate complimentary rooms (unit_price=0) from paid rooms in initialValues
  // so RoomSelector only sees paid rooms
  const paidInitialRooms = ((initialValues?.rooms ?? []) as RoomSelection[]).filter((r) => r.unit_price > 0)
  // Comp rooms track qty AND room_numbers (for fixed-number room types)
  type CompRoomRow = { qty: number; room_numbers: string[] }
  const compInitial: Record<string, CompRoomRow> = {}
  for (const r of (initialValues?.rooms ?? []) as RoomSelection[]) {
    if (r.unit_price === 0) {
      compInitial[r.room_type] = {
        qty: (compInitial[r.room_type]?.qty ?? 0) + r.qty,
        room_numbers: [...(compInitial[r.room_type]?.room_numbers ?? []), ...(r.room_numbers ?? [])],
      }
    }
  }
  const [compRoomData, setCompRoomData] = useState<Record<string, CompRoomRow>>(compInitial)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateQuoteInput>({
    resolver: zodResolver(CreateQuoteSchema),
    defaultValues: {
      customer_name:    '',
      customer_phone:   '',
      customer_notes:   '',
      package_id:          '',
      package_type:        'daylong',
      visit_date:          '',
      check_out_date:      '',
      adults:              2,
      children_paid:       0,
      children_free:       0,
      drivers:             0,
      extra_beds:          0,
      discount:            0,
      discount_pct:        0,
      service_charge_pct:  0,
      advance_required:    0,
      advance_paid:        0,
      extra_items:         [],
      // Spread initialValues last; rooms always overridden to paid-only list
      ...{ ...initialValues, rooms: paidInitialRooms },
    },
  })

  const watchedValues = watch()
  const selectedPackageId = watchedValues.package_id
  const packageType = watchedValues.package_type
  const visitDate = watchedValues.visit_date
  const checkOutDate = watchedValues.check_out_date

  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null

  // When package changes, update package_type
  function handlePackageChange(pkg: PackageWithPrices | null) {
    if (!pkg) {
      setValue('package_id', '')
      return
    }
    setValue('package_id', pkg.id)
    setValue('package_type', pkg.type)
    // Clear rooms when package changes
    setValue('rooms', [])
  }

  // Derive day type for badge display
  const dayType = visitDate
    ? getDayType(visitDate, holidayDates)
    : null

  // Live recalculation
  const recalculate = useCallback(() => {
    if (!selectedPackage || !visitDate) {
      setCalcResult(null)
      return
    }

    const selectedRooms = (watchedValues.rooms ?? []) as RoomSelection[]
    // Night stays need at least one room to calculate; daylong can proceed with zero rooms
    if (packageType === 'night' && selectedRooms.length === 0) {
      setCalcResult(null)
      return
    }

    const rates = {
      weekday_adult:  selectedPackage.weekday_adult,
      friday_adult:   selectedPackage.friday_adult,
      holiday_adult:  selectedPackage.holiday_adult,
      child_meal:     selectedPackage.child_meal,
      driver_price:   selectedPackage.driver_price,
      extra_person:   selectedPackage.extra_person,
      extra_bed:      selectedPackage.extra_bed,
    }

    try {
      if (packageType === 'daylong') {
        const result = calculateDaylong({
          date:               new Date(visitDate + 'T00:00:00'),
          packageRates:       rates,
          rooms:              selectedRooms,
          adults:             watchedValues.adults,
          children_paid:      watchedValues.children_paid,
          children_free:      watchedValues.children_free,
          drivers:            watchedValues.drivers,
          holidayDates,
          discount:           watchedValues.discount,
          discount_pct:       watchedValues.discount_pct ?? 0,
          service_charge_pct: watchedValues.service_charge_pct ?? 0,
          advance_required:   watchedValues.advance_required,
          advance_paid:       watchedValues.advance_paid,
          extra_items:        extraItems,
        })
        setCalcResult(result)
      } else if (packageType === 'night' && checkOutDate && checkOutDate > visitDate) {
        const result = calculateNight({
          checkInDate:        new Date(visitDate + 'T00:00:00'),
          checkOutDate:       new Date(checkOutDate + 'T00:00:00'),
          packageRates:       rates,
          rooms:              selectedRooms,
          adults:             watchedValues.adults,
          children_paid:      watchedValues.children_paid,
          children_free:      watchedValues.children_free,
          drivers:            watchedValues.drivers,
          extra_beds:         watchedValues.extra_beds,
          holidayDates,
          discount:           watchedValues.discount,
          discount_pct:       watchedValues.discount_pct ?? 0,
          service_charge_pct: watchedValues.service_charge_pct ?? 0,
          advance_required:   watchedValues.advance_required,
          advance_paid:       watchedValues.advance_paid,
          extra_items:        extraItems,
        })
        setCalcResult(result)
      } else {
        setCalcResult(null)
      }
    } catch {
      setCalcResult(null)
    }
  }, [
    selectedPackage,
    visitDate,
    checkOutDate,
    packageType,
    watchedValues.rooms,
    watchedValues.adults,
    watchedValues.children_paid,
    watchedValues.children_free,
    watchedValues.drivers,
    watchedValues.extra_beds,
    watchedValues.discount,
    watchedValues.discount_pct,
    watchedValues.service_charge_pct,
    watchedValues.advance_required,
    watchedValues.advance_paid,
    extraItems,
    holidayDates,
  ])

  useEffect(() => {
    recalculate()
  }, [recalculate])

  // Fetch booked room numbers whenever dates change
  useEffect(() => {
    if (!visitDate) { setBookedRoomNumbers([]); return }
    const params = new URLSearchParams({ visitDate })
    if (checkOutDate) params.set('checkOutDate', checkOutDate)
    fetch(`/api/booked-room-numbers?${params}`)
      .then((r) => r.json())
      .then((d) => setBookedRoomNumbers(d.takenRoomNumbers ?? []))
      .catch(() => setBookedRoomNumbers([]))
  }, [visitDate, checkOutDate])


  // Helper: build comp room selections for submission
  function buildCompRoomSelections(): RoomSelection[] {
    return Object.entries(compRoomData)
      .filter(([, row]) => row.qty > 0)
      .map(([room_type, row]) => ({
        room_type,
        display_name: rooms.find((r) => r.room_type === room_type)?.display_name ?? room_type,
        qty: row.qty,
        unit_price: 0,
        room_numbers: row.room_numbers.slice(0, row.qty),
      }))
  }

  async function onSubmit(data: CreateQuoteInput) {
    setSubmitting(true)
    setErrorMsg(null)
    try {
      // Merge paid rooms (from react-hook-form) with complimentary rooms
      // Ensure room_numbers is always an array (RoomSelection has it optional)
      const allRooms = [...data.rooms, ...buildCompRoomSelections()].map((r) => ({
        ...r,
        room_numbers: r.room_numbers ?? [],
      }))
      const payload = { ...data, extra_items: extraItems, rooms: allRooms }
      if (isEditMode) {
        const result = await updateQuote(quoteId!, payload)
        if (result.success) {
          router.push(`/quotes/${quoteId}`)
        } else {
          setErrorMsg(result.error ?? 'Update failed')
        }
      } else {
        const result = await createQuote(payload)
        if (result.success) {
          router.push(`/quotes/${result.data.quoteId}`)
        } else {
          setErrorMsg(result.error)
        }
      }
    } catch (err) {
      setErrorMsg(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function addExtraItem() {
    setExtraItems((prev) => [...prev, { label: '', qty: 1, unit_price: 0 }])
  }

  function removeExtraItem(index: number) {
    setExtraItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateExtraItem(index: number, field: keyof ExtraItem, value: string | number) {
    setExtraItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    ))
  }

  const currentRooms = (watchedValues.rooms ?? []) as RoomSelection[]

  // All rooms including complimentary — used for WhatsApp preview and noon-notice check
  const allRoomsWithComp: RoomSelection[] = [
    ...currentRooms,
    ...Object.entries(compRoomData)
      .filter(([, row]) => row.qty > 0)
      .map(([room_type, row]) => ({
        room_type,
        display_name: rooms.find((r) => r.room_type === room_type)?.display_name ?? room_type,
        qty: row.qty,
        unit_price: 0,
        room_numbers: row.room_numbers.slice(0, row.qty),
      })),
  ]

  // Check if any selected rooms have a night stay checking out on the visit date (daylong only)
  useEffect(() => {
    if (packageType !== 'daylong' || !visitDate || allRoomsWithComp.length === 0) {
      setRoomAvailableAfterNoon(false)
      return
    }
    const roomTypes = allRoomsWithComp.map((r) => r.room_type).join(',')
    fetch(`/api/room-noon-notice?visitDate=${visitDate}&roomTypes=${roomTypes}`)
      .then((r) => r.json())
      .then((d) => setRoomAvailableAfterNoon(d.hasConflict ?? false))
      .catch(() => setRoomAvailableAfterNoon(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageType, visitDate, currentRooms, compRoomData])

  const dayBadge = dayType ? DAY_LABELS[dayType] : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col lg:flex-row gap-6 min-h-0">
      {/* ── LEFT: Form ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-6 pb-8">

        {/* SECTION: Customer */}
        <FormSection title="Customer">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              required
              placeholder="e.g. Rahim Uddin"
              error={errors.customer_name?.message}
              {...register('customer_name')}
            />
            <div className="w-full">
              <Input
                label="Phone"
                required
                placeholder="e.g. 01700000000"
                error={errors.customer_phone?.message}
                {...register('customer_phone')}
              />
              {watchedValues.customer_phone && (
                <div className="mt-1.5">
                  <WhatsAppLink phone={watchedValues.customer_phone} />
                </div>
              )}
            </div>
          </div>
        </FormSection>

        {/* SECTION: Package */}
        <FormSection title="Package">
          <Controller
            name="package_id"
            control={control}
            render={() => (
              <PackageSelector
                packages={packages}
                value={selectedPackageId ?? ''}
                onChange={handlePackageChange}
              />
            )}
          />
          {errors.package_id && (
            <p className="mt-1 text-xs text-red-600">{errors.package_id.message}</p>
          )}
        </FormSection>

        {/* SECTION: Date */}
        <FormSection title="Date">
          <div className="space-y-3">
            {packageType === 'daylong' ? (
              <div className="flex items-end gap-3">
                <Input
                  label="Visit Date"
                  type="date"
                  required
                  error={errors.visit_date?.message}
                  {...register('visit_date')}
                  className="max-w-[220px]"
                />
                {dayBadge && (
                  <div className="mb-0.5">
                    <Badge variant={dayBadge.variant}>{dayBadge.label}</Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-end gap-3 flex-wrap">
                <Input
                  label="Check-in Date"
                  type="date"
                  required
                  error={errors.visit_date?.message}
                  {...register('visit_date')}
                  className="max-w-[220px]"
                />
                <Input
                  label="Check-out Date"
                  type="date"
                  required
                  error={errors.check_out_date?.message}
                  {...register('check_out_date')}
                  className="max-w-[220px]"
                />
                {dayBadge && (
                  <div className="mb-0.5">
                    <Badge variant={dayBadge.variant}>{dayBadge.label}</Badge>
                  </div>
                )}
              </div>
            )}
          </div>
        </FormSection>

        {/* SECTION: Rooms */}
        <FormSection title="Rooms">
          <Controller
            name="rooms"
            control={control}
            render={({ field }) => (
              <RoomSelector
                rooms={rooms}
                selectedPackage={selectedPackage}
                packageType={packageType}
                value={field.value as RoomSelection[]}
                onChange={(r) => field.onChange(r)}
                bookedRoomNumbers={bookedRoomNumbers}
              />
            )}
          />
          {currentRooms.length === 0 && packageType === 'night' && selectedPackage && visitDate && (
            <p className="mt-2 text-xs font-medium text-amber-600">
              ⚠ Please select at least one room for a night stay.
            </p>
          )}
          {errors.rooms && (
            <p className="mt-1 text-xs text-red-600">
              {Array.isArray(errors.rooms) ? 'Room error' : (errors.rooms as { message?: string }).message}
            </p>
          )}
        </FormSection>

        {/* SECTION: Complimentary Rooms (daylong only) */}
        {packageType === 'daylong' && selectedPackage && (() => {
          // Build set of locally-taken room numbers: paid rooms + other comp rows
          const locallyTakenByPaid: Set<string> = new Set()
          for (const pr of currentRooms) {
            for (const n of pr.room_numbers ?? []) locallyTakenByPaid.add(n)
          }
          return (
            <FormSection title="Complimentary Rooms">
              <p className="text-xs text-gray-500 -mt-1">
                Rooms provided at no extra charge. Won't affect the total cost. Daylong packages only.
              </p>
              <div className="space-y-2">
                {rooms
                  .filter((inv) => {
                    const price = selectedPackage.room_prices.find((p) => p.room_type === inv.room_type)?.price
                    return price !== undefined
                  })
                  .map((inv) => {
                    const row = compRoomData[inv.room_type] ?? { qty: 0, room_numbers: [] }
                    const qty = row.qty
                    const fixedNums = ROOM_NUMBERS[inv.room_type as RoomType] ?? []
                    const selectedNums = row.room_numbers

                    // Taken for this comp row: other bookings + own paid rooms + other comp rows (not this row's own)
                    const otherCompTaken = new Set<string>()
                    for (const [rt, r] of Object.entries(compRoomData)) {
                      if (rt !== inv.room_type) {
                        for (const n of r.room_numbers) otherCompTaken.add(n)
                      }
                    }

                    return (
                      <div
                        key={inv.room_type}
                        className={`rounded-lg border px-4 py-3 transition-colors ${
                          qty > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{inv.display_name}</p>
                            <p className="text-xs text-emerald-600 font-medium">Complimentary · Free</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={qty <= 0}
                              onClick={() => setCompRoomData((prev) => {
                                const next = { ...prev }
                                const cur = prev[inv.room_type] ?? { qty: 0, room_numbers: [] }
                                const newQty = Math.max(0, cur.qty - 1)
                                if (newQty === 0) delete next[inv.room_type]
                                else next[inv.room_type] = { qty: newQty, room_numbers: cur.room_numbers.slice(0, newQty) }
                                return next
                              })}
                              className={`h-7 w-7 rounded border flex items-center justify-center text-sm font-medium transition-colors ${
                                qty > 0
                                  ? 'border-emerald-400 bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                              }`}
                            >
                              −
                            </button>
                            <span className={`w-8 text-center text-sm font-semibold tabular-nums ${qty > 0 ? 'text-emerald-700' : 'text-gray-600'}`}>
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCompRoomData((prev) => {
                                const cur = prev[inv.room_type] ?? { qty: 0, room_numbers: [] }
                                return { ...prev, [inv.room_type]: { qty: cur.qty + 1, room_numbers: cur.room_numbers } }
                              })}
                              className="h-7 w-7 rounded border border-emerald-400 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center text-sm font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Room number picker — for types with fixed numbers */}
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
                                    type="button"
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
                                    title={isTakenByBooked ? `Room ${num} is taken by another booking` : isTakenByLocalPaid ? `Room ${num} is assigned to a paid row in this booking` : isTakenByOtherComp ? `Room ${num} is assigned to another comp row` : undefined}
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
            </FormSection>
          )
        })()}

        {/* SECTION: Guests */}
        <FormSection title="Guests">
          <Controller
            name="adults"
            control={control}
            render={() => (
              <GuestInputs
                packageType={packageType}
                value={{
                  adults:        watchedValues.adults,
                  children_paid: watchedValues.children_paid,
                  children_free: watchedValues.children_free,
                  drivers:       watchedValues.drivers,
                  extra_beds:    watchedValues.extra_beds,
                }}
                onChange={(v: GuestValues) => {
                  setValue('adults', v.adults)
                  setValue('children_paid', v.children_paid)
                  setValue('children_free', v.children_free)
                  setValue('drivers', v.drivers)
                  setValue('extra_beds', v.extra_beds)
                }}
              />
            )}
          />
          {errors.adults && (
            <p className="mt-1 text-xs text-red-600">{errors.adults.message}</p>
          )}
        </FormSection>

        {/* SECTION: Pricing Adjustments */}
        <FormSection title="Pricing Adjustments">
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="discount"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Flat Discount"
                  prefix="৳"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.discount?.message}
                />
              )}
            />
            <Controller
              name="discount_pct"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Discount %"
                  suffix="%"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={(errors as any).discount_pct?.message}
                />
              )}
            />
            <Controller
              name="service_charge_pct"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Service Charge"
                  suffix="%"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.service_charge_pct?.message}
                />
              )}
            />
          </div>
          <Textarea
            label="Internal Notes"
            placeholder="Any special notes for this quote..."
            rows={2}
            {...register('customer_notes')}
          />
        </FormSection>

        {/* SECTION: Extra Items */}
        <FormSection title="Extra Items">
          <div className="space-y-2">
            {extraItems.length === 0 && (
              <p className="text-xs text-gray-400 italic">No extra items added yet.</p>
            )}
            {extraItems.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Extra towels, Bonfire, Transport..."
                    value={item.label}
                    onChange={(e) => updateExtraItem(index, 'label', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                  />
                </div>
                <div className="w-20 flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateExtraItem(index, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 tabular-nums"
                  />
                </div>
                <div className="w-32 flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price (৳)</label>
                  <input
                    type="number"
                    min={0}
                    value={item.unit_price}
                    onChange={(e) => updateExtraItem(index, 'unit_price', Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeExtraItem(index)}
                  className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                  title="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addExtraItem}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-3 py-2 text-xs font-medium text-forest-700 hover:bg-forest-100 transition-colors"
            >
              <Plus size={13} />
              Add Extra Item
            </button>
          </div>
        </FormSection>

        {/* SECTION: Advance Payment */}
        <FormSection title="Advance Payment">
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="advance_required"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Advance Required"
                  prefix="৳"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.advance_required?.message}
                />
              )}
            />
            <Controller
              name="advance_paid"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Advance Paid"
                  prefix="৳"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.advance_paid?.message}
                />
              )}
            />
          </div>
        </FormSection>

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Submit / Cancel */}
        <div className={isEditMode ? 'flex gap-3' : ''}>
          {isEditMode && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => router.push(`/quotes/${quoteId}`)}
              className="flex-1 text-base"
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={submitting || (packageType === 'night' && currentRooms.length === 0)}
            className={isEditMode ? 'flex-1 text-base' : 'w-full text-base'}
          >
            {isEditMode ? 'Save Changes' : 'Generate Quote'}
          </Button>
        </div>
      </div>

      {/* ── RIGHT: Sticky Preview ────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[380px] flex-shrink-0">
        <div className="sticky top-6 space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Live Pricing Preview</h3>
            <PricingBreakdown result={calcResult} />
          </div>

          {/* Package info card */}
          {selectedPackage && (selectedPackage.meals || selectedPackage.activities || selectedPackage.experience) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Package Inclusions
              </p>
              {selectedPackage.meals && (
                <div>
                  <p className="text-xs font-medium text-amber-700">Meals</p>
                  <p className="text-xs text-amber-900 whitespace-pre-wrap">{selectedPackage.meals}</p>
                </div>
              )}
              {selectedPackage.activities && (
                <div>
                  <p className="text-xs font-medium text-amber-700">Activities</p>
                  <p className="text-xs text-amber-900 whitespace-pre-wrap">{selectedPackage.activities}</p>
                </div>
              )}
              {selectedPackage.experience && (
                <div>
                  <p className="text-xs font-medium text-amber-700">Experience</p>
                  <p className="text-xs text-amber-900 whitespace-pre-wrap">{selectedPackage.experience}</p>
                </div>
              )}
            </div>
          )}

          {/* WhatsApp output preview */}
          {calcResult && selectedPackage && (
            <WhatsAppPreview
              packageName={selectedPackage.name}
              customerName={watchedValues.customer_name || '—'}
              customerPhone={watchedValues.customer_phone || '—'}
              packageType={packageType}
              visitDate={visitDate}
              checkOutDate={checkOutDate ?? null}
              checkIn={selectedPackage.check_in}
              checkOut={selectedPackage.check_out}
              rooms={allRoomsWithComp}
              calcResult={calcResult}
              mealsText={selectedPackage.meals}
              notesText={selectedPackage.notes}
              settings={settings}
              roomAvailableAfterNoon={roomAvailableAfterNoon}
            />
          )}
        </div>
      </div>
    </form>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</h3>
      {children}
    </div>
  )
}

// ── WhatsApp preview (inline, no DB call) ────────────────────────────────────

import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, formatDateRange } from '@/lib/formatters/dates'
import type { RoomSelection as RS } from '@/lib/engine/calculator'

interface WhatsAppPreviewProps {
  packageName: string
  customerName: string
  customerPhone: string
  packageType: 'daylong' | 'night'
  visitDate: string
  checkOutDate: string | null
  checkIn: string
  checkOut: string
  rooms: RS[]
  calcResult: CalculationResult
  mealsText: string | null | undefined
  notesText: string | null | undefined
  settings: SettingsMap
  roomAvailableAfterNoon?: boolean
}

function WhatsAppPreview({
  packageName,
  customerName,
  customerPhone,
  packageType,
  visitDate,
  checkOutDate,
  checkIn,
  checkOut,
  rooms,
  calcResult,
  mealsText,
  notesText,
  settings,
  roomAvailableAfterNoon,
}: WhatsAppPreviewProps) {
  const [copied, setCopied] = useState(false)

  if (!visitDate) return null

  const SEP = '━━━━━━━━━━━━━━━━━━'
  const dateLine =
    packageType === 'night' && checkOutDate
      ? formatDateRange(visitDate, checkOutDate)
      : formatDate(visitDate)

  // Split paid vs complimentary rooms for preview
  const paidRoomsPreview = rooms.filter((r) => r.qty > 0 && r.unit_price > 0)
  const compRoomsPreview = rooms.filter((r) => r.qty > 0 && r.unit_price === 0)

  const roomLines = paidRoomsPreview
    .map((r) => {
      const n = calcResult.nights
      return n
        ? `${r.display_name} × ${r.qty}: ${formatBDT(r.unit_price)}/rm × ${n}N = ${formatBDT(r.qty * r.unit_price * n)}`
        : `${r.display_name} × ${r.qty}: ${formatBDT(r.unit_price)}/rm = ${formatBDT(r.qty * r.unit_price)}`
    })
    .join('\n')

  const compRoomLines = compRoomsPreview
    .map((r) => `${r.display_name} × ${r.qty}: Complimentary`)
    .join('\n')

  const pricingLines = calcResult.line_items
    .map((item) => {
      const ns = item.nights ? ` × ${item.nights}N` : ''
      return `  ${item.label}${ns}: ${formatBDT(item.subtotal)}`
    })
    .join('\n')

  const lines = [
    SEP,
    '🌿 *GARDEN CENTRE RESORT*',
    '✨ *QUOTATION* (Draft Preview)',
    SEP,
    `📌 *Package:* ${packageName}`,
    `👤 *Name:* ${customerName}`,
    `📞 *Contact:* ${customerPhone}`,
    `📅 *Date:* ${dateLine}`,
    `🕐 *Check-in:* ${checkIn}  |  *Check-out:* ${checkOut}`,
    SEP,
    '🏨 *ROOMS*',
    roomLines || (compRoomsPreview.length > 0 ? '  (no paid rooms)' : '  (no rooms selected)'),
    ...(compRoomsPreview.length > 0 ? [``, `🎁 *COMPLIMENTARY ROOMS*`, compRoomLines] : []),
    ...(roomAvailableAfterNoon ? ['⚠️ *Note:* Room will be available after 12:00 PM (previous guest checking out)'] : []),
    SEP,
    '💰 *PRICING BREAKDOWN*',
    pricingLines,
    '─────────────────────',
    `  Subtotal:          ${formatBDT(calcResult.subtotal)}`,
  ]

  if (calcResult.discount > 0) {
    lines.push(`  Discount:         -${formatBDT(calcResult.discount)}`)
  }

  lines.push(
    `  *Total:*           ${formatBDT(calcResult.total)}`,
    `  Advance Required: ${formatBDT(calcResult.advance_required)}`,
    `  Advance Paid:     ${formatBDT(calcResult.advance_paid)}`,
    `  *Remaining:*       ${formatBDT(calcResult.remaining)}`,
  )

  if (mealsText) lines.push(SEP, '🍽️ *MEALS*', mealsText)
  if (notesText) lines.push(SEP, '📝 *NOTES*', notesText)

  if (settings['payment_instructions']) {
    lines.push(SEP, '💳 *PAYMENT*', settings['payment_instructions'])
  }
  if (settings['contact_numbers']) {
    lines.push(SEP, `📞 ${settings['contact_numbers']}`)
  }
  if (settings['footer_text']) {
    lines.push(settings['footer_text'])
  }
  lines.push(SEP)

  const text = lines.join('\n')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback — create textarea
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          WhatsApp Preview
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs font-medium text-forest-700 hover:text-forest-900 transition-colors px-2 py-1 rounded hover:bg-forest-50"
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words px-3 py-3 text-xs text-gray-700 font-mono leading-relaxed max-h-80 overflow-y-auto">
        {text}
      </pre>
    </div>
  )
}
