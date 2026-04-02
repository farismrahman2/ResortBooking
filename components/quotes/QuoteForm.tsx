'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateQuoteSchema, type CreateQuoteInput } from '@/lib/validators/quote'
import { createQuote } from '@/lib/actions/quotes'
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
import type { PackageWithPrices, RoomInventoryRow, SettingsMap } from '@/lib/supabase/types'

interface QuoteFormProps {
  packages: PackageWithPrices[]
  rooms: RoomInventoryRow[]
  holidayDates: string[]
  settings: SettingsMap
}

const DAY_LABELS = {
  friday:  { label: 'Friday Rate', variant: 'warning' as const },
  holiday: { label: 'Holiday Rate', variant: 'danger' as const },
  weekday: { label: 'Weekday Rate', variant: 'default' as const },
}

export function QuoteForm({ packages, rooms, holidayDates, settings }: QuoteFormProps) {
  const router = useRouter()
  const [submitting,         setSubmitting]         = useState(false)
  const [errorMsg,           setErrorMsg]           = useState<string | null>(null)
  const [calcResult,         setCalcResult]         = useState<CalculationResult | null>(null)
  const [bookedRoomNumbers,  setBookedRoomNumbers]  = useState<string[]>([])

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
      rooms:               [],
      discount:            0,
      service_charge_pct:  0,
      advance_required:    0,
      advance_paid:        0,
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

    const selectedRooms = watchedValues.rooms as RoomSelection[]
    if (!selectedRooms || selectedRooms.length === 0) {
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
          service_charge_pct: watchedValues.service_charge_pct ?? 0,
          advance_required:   watchedValues.advance_required,
          advance_paid:       watchedValues.advance_paid,
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
          service_charge_pct: watchedValues.service_charge_pct ?? 0,
          advance_required:   watchedValues.advance_required,
          advance_paid:       watchedValues.advance_paid,
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
    watchedValues.service_charge_pct,
    watchedValues.advance_required,
    watchedValues.advance_paid,
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

  async function onSubmit(data: CreateQuoteInput) {
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const result = await createQuote(data)
      if (result.success) {
        router.push(`/quotes/${result.data.quoteId}`)
      } else {
        setErrorMsg(result.error)
      }
    } catch (err) {
      setErrorMsg(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const currentRooms = (watchedValues.rooms ?? []) as RoomSelection[]

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
          {currentRooms.length === 0 && selectedPackage && visitDate && (
            <p className="mt-2 text-xs font-medium text-amber-600">
              ⚠ Please select at least one room to generate the quote.
            </p>
          )}
          {errors.rooms && (
            <p className="mt-1 text-xs text-red-600">
              {Array.isArray(errors.rooms) ? 'Room error' : (errors.rooms as { message?: string }).message}
            </p>
          )}
        </FormSection>

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
                  label="Discount"
                  prefix="৳"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.discount?.message}
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

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
          disabled={submitting || currentRooms.length === 0}
          className="w-full text-base"
        >
          Generate Quote
        </Button>
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
              rooms={currentRooms}
              calcResult={calcResult}
              mealsText={selectedPackage.meals}
              notesText={selectedPackage.notes}
              settings={settings}
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
}: WhatsAppPreviewProps) {
  const [copied, setCopied] = useState(false)

  if (!visitDate) return null

  const SEP = '━━━━━━━━━━━━━━━━━━'
  const dateLine =
    packageType === 'night' && checkOutDate
      ? formatDateRange(visitDate, checkOutDate)
      : formatDate(visitDate)

  const roomLines = rooms
    .filter((r) => r.qty > 0)
    .map((r) => {
      const n = calcResult.nights
      return n
        ? `${r.display_name} × ${r.qty}: ${formatBDT(r.unit_price)}/rm × ${n}N = ${formatBDT(r.qty * r.unit_price * n)}`
        : `${r.display_name} × ${r.qty}: ${formatBDT(r.unit_price)}/rm = ${formatBDT(r.qty * r.unit_price)}`
    })
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
    roomLines || '  (no rooms selected)',
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
