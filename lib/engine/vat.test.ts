import { describe, expect, it } from 'vitest'
import { calculateDaylong, calculateNight, calculateGroup, type PackageRates } from './calculator'

const rates: PackageRates = { weekday_adult: 2000, friday_adult: 2500, holiday_adult: 2500, child_meal: 1500, driver_price: 1000, extra_person: 3000, extra_bed: 1500 }
const deluxe = { room_type: 'deluxe', display_name: 'Deluxe', qty: 1, unit_price: 8000 }
const base = { packageRates: rates, children_paid: 0, children_free: 0, drivers: 0, holidayDates: [], discount: 0, advance_required: 0, advance_paid: 0 }
const day = (over = {}) => calculateDaylong({ ...base, date: new Date('2026-11-04T00:00:00'), rooms: [deluxe], adults: 2, ...over })   // a Wednesday

describe('VAT', () => {
  it('no line at 0% — the bill is exactly as before', () => {
    const r = day()
    expect(r.line_items.some((l) => l.kind === 'vat')).toBe(false)
    expect(r.total).toBe(12000)
  })

  it('adds a VAT line on the bill', () => {
    const r = day({ vat_pct: 15 })
    expect(r.line_items.at(-1)).toMatchObject({ label: 'VAT (15%)', kind: 'vat', subtotal: 1800 })
    expect(r.total).toBe(13800)
  })

  it('is charged after the service charge, on the bill including it', () => {
    const r = day({ service_charge_pct: 10, vat_pct: 15 })
    const kinds = r.line_items.map((l) => l.kind)
    expect(kinds.indexOf('service_charge')).toBeLessThan(kinds.indexOf('vat'))
    expect(r.line_items.find((l) => l.kind === 'vat')!.subtotal).toBe(1980)   // 15% of 12000 + 1200
    expect(r.total).toBe(15180)
  })

  it('allows decimals', () => {
    expect(day({ vat_pct: 7.5 }).line_items.find((l) => l.kind === 'vat')).toMatchObject({ label: 'VAT (7.5%)', subtotal: 900 })
  })

  it('works on night stays and groups too', () => {
    const night = calculateNight({ ...base, checkInDate: new Date('2026-11-04T00:00:00'), checkOutDate: new Date('2026-11-06T00:00:00'),
      rooms: [deluxe], adults: 2, extra_beds: 0, vat_pct: 10 })
    expect(night.line_items.find((l) => l.kind === 'vat')!.subtotal).toBe(1600)   // 10% of 2 nights × 8000
    const group = calculateGroup({
      segments: [{ day_date: '2026-11-04', stay_kind: 'night', adults: 2, adults_comp: 0, children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0,
        rooms: [{ room_type: 'deluxe', qty: 1, unit_price: 8000, room_numbers: ['202'], evening_rooms: [] }], notes: null }],
      nightRates: rates, dayRates: null, holidayDates: [], discount: 0, advance_required: 0, advance_paid: 0, vat_pct: 10,
    })
    expect(group.line_items.find((l) => l.kind === 'vat')!.subtotal).toBe(800)
  })
})
