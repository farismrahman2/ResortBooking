/**
 * CALCULATION ENGINE
 *
 * Pure functions — no side effects, no DB calls.
 * Used both server-side (save to DB) and client-side (live preview).
 *
 * CRITICAL BUSINESS RULES:
 * - Night stay: 2 persons included PER ROOM (extra = adults - 2 × totalRoomQty)
 * - Child meal (4-9): flat ৳1500 per child for daylong; ৳1500 × nights for night stays
 * - Driver: × nights for night stays
 * - Extra bed: × nights for night stays
 * - Friday rate takes priority over holiday rate if both match
 */

import type { LineItem } from '@/lib/supabase/types'

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface PackageRates {
  weekday_adult:  number
  friday_adult:   number
  holiday_adult:  number
  child_meal:     number   // flat per child aged 4–9
  driver_price:   number
  extra_person:   number   // night only, per person per night beyond 2/room base
  extra_bed:      number   // night only, per extra bed per night
}

export interface RoomSelection {
  room_type:    string
  display_name: string
  qty:          number
  unit_price:   number        // price per room (from package_room_prices snapshot)
  room_numbers?: string[]     // specific room numbers assigned (internal only)
}

export interface DaylongInputs {
  date:                Date
  packageRates:        PackageRates
  rooms:               RoomSelection[]
  adults:              number
  children_paid:       number   // ages 4–9
  children_free:       number   // below 3 (free, just tracked)
  drivers:             number
  holidayDates:        string[] // ISO date strings 'YYYY-MM-DD'
  discount:            number
  service_charge_pct?: number   // percentage, default 0
  advance_required:    number
  advance_paid:        number
}

export interface NightInputs {
  checkInDate:         Date
  checkOutDate:        Date
  packageRates:        PackageRates
  rooms:               RoomSelection[]
  adults:              number
  children_paid:       number
  children_free:       number
  drivers:             number
  extra_beds:          number
  holidayDates:        string[]
  discount:            number
  service_charge_pct?: number   // percentage, default 0
  advance_required:    number
  advance_paid:        number
}

export type AdultRateUsed = 'weekday' | 'friday' | 'holiday'

export interface CalculationResult {
  line_items:       LineItem[]
  subtotal:         number
  discount:         number
  total:            number
  advance_required: number
  advance_paid:     number
  due_advance:      number
  remaining:        number
  adult_rate_used:  AdultRateUsed
  nights:           number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function isFriday(date: Date): boolean {
  return date.getDay() === 5
}

function isHoliday(date: Date, holidayDates: string[]): boolean {
  return holidayDates.includes(toISODate(date))
}

function resolveAdultRate(
  date: Date,
  rates: PackageRates,
  holidayDates: string[],
): { rate: number; used: AdultRateUsed } {
  if (isFriday(date)) return { rate: rates.friday_adult, used: 'friday' }
  if (isHoliday(date, holidayDates)) return { rate: rates.holiday_adult, used: 'holiday' }
  return { rate: rates.weekday_adult, used: 'weekday' }
}

function computeFinancials(
  line_items: LineItem[],
  discount: number,
  advance_required: number,
  advance_paid: number,
  nights: number | null,
  adult_rate_used: AdultRateUsed,
): CalculationResult {
  const subtotal = line_items.reduce((sum, item) => sum + item.subtotal, 0)
  const total = Math.max(0, subtotal - discount)
  const due_advance = Math.max(0, advance_required - advance_paid)
  const remaining = Math.max(0, total - advance_paid)

  return {
    line_items,
    subtotal,
    discount,
    total,
    advance_required,
    advance_paid,
    due_advance,
    remaining,
    adult_rate_used,
    nights,
  }
}

// ─── Main Exported Functions ───────────────────────────────────────────────────

/**
 * Calculate pricing for a DAYLONG booking.
 */
export function calculateDaylong(inputs: DaylongInputs): CalculationResult {
  const {
    date,
    packageRates,
    rooms,
    adults,
    children_paid,
    children_free: _childrenFree,
    drivers,
    holidayDates,
    discount,
    advance_required,
    advance_paid,
  } = inputs

  const { rate: adultRate, used: adultRateUsed } = resolveAdultRate(date, packageRates, holidayDates)
  const lineItems: LineItem[] = []

  // Room charges
  for (const room of rooms) {
    if (room.qty <= 0) continue
    lineItems.push({
      label:      `${room.display_name} × ${room.qty}`,
      qty:        room.qty,
      unit_price: room.unit_price,
      nights:     null,
      subtotal:   room.qty * room.unit_price,
    })
  }

  // Adult charges
  if (adults > 0 && adultRate > 0) {
    lineItems.push({
      label:      `Adults (${adultRateUsed === 'friday' ? 'Friday rate' : adultRateUsed === 'holiday' ? 'Holiday rate' : 'Weekday rate'})`,
      qty:        adults,
      unit_price: adultRate,
      nights:     null,
      subtotal:   adults * adultRate,
    })
  }

  // Children meal charge (ages 4–9, flat, no × nights for daylong)
  if (children_paid > 0 && packageRates.child_meal > 0) {
    lineItems.push({
      label:      'Children meal (4–9 yrs)',
      qty:        children_paid,
      unit_price: packageRates.child_meal,
      nights:     null,
      subtotal:   children_paid * packageRates.child_meal,
    })
  }

  // Driver charges
  if (drivers > 0 && packageRates.driver_price > 0) {
    lineItems.push({
      label:      'Drivers',
      qty:        drivers,
      unit_price: packageRates.driver_price,
      nights:     null,
      subtotal:   drivers * packageRates.driver_price,
    })
  }

  // Service charge (applied to pre-discount subtotal)
  const pct = inputs.service_charge_pct ?? 0
  if (pct > 0) {
    const base = lineItems.reduce((s, i) => s + i.subtotal, 0)
    const charge = Math.round(base * pct / 100)
    if (charge > 0) {
      lineItems.push({
        label:      `Service Charge (${pct}%)`,
        qty:        1,
        unit_price: charge,
        nights:     null,
        subtotal:   charge,
      })
    }
  }

  return computeFinancials(lineItems, discount, advance_required, advance_paid, null, adultRateUsed)
}

/**
 * Calculate pricing for a NIGHT STAY booking.
 *
 * Base includes 2 persons PER ROOM. Extra persons billed per extra_person rate × nights.
 */
export function calculateNight(inputs: NightInputs): CalculationResult {
  const {
    checkInDate,
    checkOutDate,
    packageRates,
    rooms,
    adults,
    children_paid,
    children_free: _childrenFree,
    drivers,
    extra_beds,
    holidayDates,
    discount,
    advance_required,
    advance_paid,
  } = inputs

  // Compute nights
  const msPerDay = 1000 * 60 * 60 * 24
  const nights = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / msPerDay))

  // For night stays, adult rate is based on check-in date
  const { used: adultRateUsed } = resolveAdultRate(checkInDate, packageRates, holidayDates)

  const totalRoomQty = rooms.reduce((sum, r) => sum + r.qty, 0)
  const basePersons  = 2 * totalRoomQty
  const extraPersons = Math.max(0, adults - basePersons)

  const lineItems: LineItem[] = []

  // Room charges (× nights)
  for (const room of rooms) {
    if (room.qty <= 0) continue
    lineItems.push({
      label:      `${room.display_name} × ${room.qty}`,
      qty:        room.qty,
      unit_price: room.unit_price,
      nights,
      subtotal:   room.qty * room.unit_price * nights,
    })
  }

  // Extra persons beyond base (adults - 2 × roomQty)
  if (extraPersons > 0 && packageRates.extra_person > 0) {
    lineItems.push({
      label:      `Extra persons (beyond ${basePersons} included)`,
      qty:        extraPersons,
      unit_price: packageRates.extra_person,
      nights,
      subtotal:   extraPersons * packageRates.extra_person * nights,
    })
  }

  // Children meal charge (ages 4–9, × nights for overnight)
  if (children_paid > 0 && packageRates.child_meal > 0) {
    lineItems.push({
      label:      'Children meal (4–9 yrs)',
      qty:        children_paid,
      unit_price: packageRates.child_meal,
      nights,
      subtotal:   children_paid * packageRates.child_meal * nights,
    })
  }

  // Driver charges (× nights)
  if (drivers > 0 && packageRates.driver_price > 0) {
    lineItems.push({
      label:      'Drivers',
      qty:        drivers,
      unit_price: packageRates.driver_price,
      nights,
      subtotal:   drivers * packageRates.driver_price * nights,
    })
  }

  // Extra bed charges (× nights)
  if (extra_beds > 0 && packageRates.extra_bed > 0) {
    lineItems.push({
      label:      'Extra beds',
      qty:        extra_beds,
      unit_price: packageRates.extra_bed,
      nights,
      subtotal:   extra_beds * packageRates.extra_bed * nights,
    })
  }

  // Service charge (applied to pre-discount subtotal)
  const pct = inputs.service_charge_pct ?? 0
  if (pct > 0) {
    const base = lineItems.reduce((s, i) => s + i.subtotal, 0)
    const charge = Math.round(base * pct / 100)
    if (charge > 0) {
      lineItems.push({
        label:      `Service Charge (${pct}%)`,
        qty:        1,
        unit_price: charge,
        nights:     null,
        subtotal:   charge,
      })
    }
  }

  return computeFinancials(lineItems, discount, advance_required, advance_paid, nights, adultRateUsed)
}

/**
 * Recalculate from stored data (for editing an existing quote/booking).
 * Thin wrapper that routes to the correct calculator.
 */
export function recalculate(
  packageType: 'daylong' | 'night',
  inputs: DaylongInputs | NightInputs,
): CalculationResult {
  if (packageType === 'daylong') {
    return calculateDaylong(inputs as DaylongInputs)
  }
  return calculateNight(inputs as NightInputs)
}
