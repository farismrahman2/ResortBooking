import { describe, it, expect } from 'vitest'
import { calculateGroup, calculateNight, calculateDaylong, type PackageRates } from './calculator'
import type { GroupSegment } from '@/lib/bookings/group-itinerary'

const NIGHT: PackageRates = {
  weekday_adult: 0, friday_adult: 0, holiday_adult: 0,
  child_meal: 1500, driver_price: 800, extra_person: 2500, extra_bed: 1200,
}
const DAY: PackageRates = {
  weekday_adult: 3000, friday_adult: 3500, holiday_adult: 4000,
  child_meal: 1500, driver_price: 800, extra_person: 0, extra_bed: 0,
}

const room = (room_type: string, room_numbers: string[], unit_price: number, display_name?: string) =>
  ({ room_type, display_name, qty: room_numbers.length, unit_price, room_numbers })

/** 4–7 Oct 2026. The 4th is a Sunday, the 5th a Monday. */
const ITINERARY: GroupSegment[] = [
  { day_date: '2026-10-04', stay_kind: 'night', adults: 30, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 2, extra_beds: 0,
    rooms: [
      room('super_premium', ['101'], 12000, 'Super Premium'),
      room('premium', ['102'], 9000, 'Premium'),
      room('premium_deluxe', ['108'], 8000, 'Premium Deluxe'),
      room('deluxe', ['202', '205'], 6000, 'Deluxe'),
      room('superior_deluxe', ['203', '206'], 7000, 'Superior Deluxe'),
    ] },
  { day_date: '2026-10-05', stay_kind: 'night', adults: 2, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('super_premium', ['101'], 12000, 'Super Premium')] },
  { day_date: '2026-10-05', stay_kind: 'daylong', adults: 32, adults_comp: 28, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('deluxe', ['202', '205'], 0, 'Deluxe'), room('superior_deluxe', ['203'], 0, 'Superior Deluxe')] },
  { day_date: '2026-10-06', stay_kind: 'night', adults: 2, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
    rooms: [room('super_premium', ['101'], 12000, 'Super Premium')] },
]

const base = {
  holidayDates: [] as string[], discount: 0, advance_required: 0, advance_paid: 0,
}

describe('calculateGroup', () => {
  const result = calculateGroup({ segments: ITINERARY, nightRates: NIGHT, dayRates: DAY, ...base })

  it('bills each night\'s rooms once, per night', () => {
    // 4th: 12000 + 9000 + 8000 + 2×6000 + 2×7000 = 55,000. 5th and 6th: 12,000 each.
    const roomLines = result.line_items.filter((li) => li.kind === 'room')
    expect(roomLines.reduce((s, li) => s + li.subtotal, 0)).toBe(55_000 + 12_000 + 12_000)
  })

  it('charges extra persons beyond two per room on a night, using that night\'s rooms', () => {
    // 4th: 30 adults, 7 rooms → 14 included → 16 extra × 2500 = 40,000
    const extra = result.line_items.find((li) => li.kind === 'extra_person' && li.label.includes('4 Oct'))!
    expect(extra.qty).toBe(16)
    expect(extra.subtotal).toBe(40_000)
    // 5th and 6th: 2 adults in 1 room → nothing extra
    expect(result.line_items.filter((li) => li.kind === 'extra_person')).toHaveLength(1)
  })

  it('charges day guests per head at the day package rate for that weekday, minus the complimentary ones', () => {
    // 5 Oct 2026 is a Monday → weekday rate. 32 present, 28 comp → 4 billed × 3000.
    const day = result.line_items.find((li) => li.kind === 'adult')!
    expect(day.qty).toBe(4)
    expect(day.unit_price).toBe(3000)
    expect(day.subtotal).toBe(12_000)
    expect(day.label).toMatch(/5 Oct/)
  })

  it('never bills a complimentary room', () => {
    const labels = result.line_items.map((li) => li.label)
    // Day-use Deluxe/Superior Deluxe on the 5th were unit_price 0
    expect(labels.filter((l) => l.includes('5 Oct') && /Deluxe/.test(l))).toHaveLength(0)
  })

  it('bills drivers on the night they are present', () => {
    const drivers = result.line_items.find((li) => li.kind === 'driver')!
    expect(drivers.qty).toBe(2)
    expect(drivers.subtotal).toBe(1600)
  })

  it('totals to the sum of every day', () => {
    expect(result.subtotal).toBe(79_000 + 40_000 + 12_000 + 1_600)
    expect(result.total).toBe(result.subtotal)
    expect(result.nights).toBe(3)
  })

  it('uses the Friday day rate when a day segment lands on a Friday', () => {
    const r = calculateGroup({
      segments: [{ day_date: '2026-10-09', stay_kind: 'daylong', adults: 10, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [] }],
      nightRates: null, dayRates: DAY, ...base,
    })
    expect(r.line_items[0].unit_price).toBe(3500)
    expect(r.adult_rate_used).toBe('friday')
  })

  it('applies flat and percentage discounts and service charge like the other calculators', () => {
    const r = calculateGroup({
      segments: [{ day_date: '2026-10-05', stay_kind: 'daylong', adults: 10, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [] }],
      nightRates: null, dayRates: DAY, holidayDates: [],
      discount: 1000, discount_pct: 10, service_charge_pct: 5, advance_required: 5000, advance_paid: 2000,
    })
    // 10 × 3000 = 30,000; service 5% = 1,500 → 31,500; pct 10% of 31,500 = 3,150; discount = 4,150
    expect(r.subtotal).toBe(31_500)
    expect(r.discount).toBe(4_150)
    expect(r.total).toBe(27_350)
    expect(r.due_advance).toBe(3000)
  })

  it('agrees with calculateNight for a one-night itinerary', () => {
    const seg: GroupSegment = { day_date: '2026-10-04', stay_kind: 'night', adults: 5, adults_comp: 0, children_paid: 1, children_free: 0, drivers: 1, extra_beds: 1,
      rooms: [room('deluxe', ['202', '205'], 6000, 'Deluxe')] }
    const g = calculateGroup({ segments: [seg], nightRates: NIGHT, dayRates: null, ...base })
    const n = calculateNight({
      checkInDate: new Date('2026-10-04T00:00:00'), checkOutDate: new Date('2026-10-05T00:00:00'),
      packageRates: NIGHT, rooms: seg.rooms.map((r) => ({ ...r, display_name: r.display_name ?? r.room_type })),
      adults: 5, children_paid: 1, children_free: 0, drivers: 1, extra_beds: 1, ...base,
    })
    expect(g.total).toBe(n.total)
  })

  it('agrees with calculateDaylong for a single day of day guests', () => {
    const seg: GroupSegment = { day_date: '2026-10-05', stay_kind: 'daylong', adults: 12, adults_comp: 0, children_paid: 2, children_free: 1, drivers: 1, extra_beds: 0,
      rooms: [room('deluxe', ['202'], 4000, 'Deluxe')] }
    const g = calculateGroup({ segments: [seg], nightRates: null, dayRates: DAY, ...base })
    const d = calculateDaylong({
      date: new Date('2026-10-05T00:00:00'), packageRates: DAY,
      rooms: seg.rooms.map((r) => ({ ...r, display_name: r.display_name ?? r.room_type })),
      adults: 12, children_paid: 2, children_free: 1, drivers: 1, ...base,
    })
    expect(g.total).toBe(d.total)
  })

  it('refuses silently-wrong pricing: a night segment with no night rates throws', () => {
    expect(() => calculateGroup({ segments: [ITINERARY[0]], nightRates: null, dayRates: DAY, ...base })).toThrow()
  })
})
