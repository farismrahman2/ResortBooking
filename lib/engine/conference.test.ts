import { describe, expect, it } from 'vitest'
import { occupancyOnDate, findHalvesConflict, roomNumberBuckets, type StayLike } from './halves'
import { calculateNight, calculateDaylong, type PackageRates } from './calculator'
import { includedPersons, chargedNights, isGuestRoom } from '@/lib/config/rooms'

const CONF = { room_type: 'conference_room', qty: 1, room_numbers: ['Conference'] }
const INV  = new Map([['conference_room', 1], ['deluxe', 4]])

const nightWithConf: StayLike = {
  package_type: 'night', visit_date: '2026-11-05', check_out_date: '2026-11-08',
  rooms: [CONF, { room_type: 'deluxe', qty: 1, room_numbers: ['202'] }], ref: 'GCR-B-2026-2001',
}

describe('the conference room is held for the whole arrival day only', () => {
  it('a night stay holds it day and night on check-in, not on later nights', () => {
    expect(occupancyOnDate(nightWithConf, '2026-11-05').find((r) => r.room_type === 'conference_room'))
      .toMatchObject({ day: true, night: true, room_numbers: ['Conference'] })
    expect(occupancyOnDate(nightWithConf, '2026-11-06').some((r) => r.room_type === 'conference_room')).toBe(false)
    // the bedroom carries on as before
    expect(occupancyOnDate(nightWithConf, '2026-11-06').some((r) => r.room_type === 'deluxe')).toBe(true)
  })

  it('a day visit holds the whole date, not just the day half', () => {
    const day: StayLike = { package_type: 'daylong', visit_date: '2026-11-05', check_out_date: null, rooms: [CONF] }
    expect(occupancyOnDate(day, '2026-11-05')[0]).toMatchObject({ day: true, night: true })
  })

  it('refuses a second booking that day, whatever the package', () => {
    const occ = occupancyOnDate(nightWithConf, '2026-11-05')
    expect(findHalvesConflict(INV, occ, [CONF], 'daylong', true, '2026-11-05')).toMatch(/conference room is already booked/)
    expect(findHalvesConflict(INV, occ, [CONF], 'night', true, '2026-11-05')).toMatch(/conference room/)
    expect(roomNumberBuckets(occ, 'daylong').taken).toContain('Conference')
  })

  it('a night stay asking for it is not checked against its later nights', () => {
    const other: StayLike = { package_type: 'daylong', visit_date: '2026-11-06', check_out_date: null, rooms: [CONF] }
    const occ = occupancyOnDate(other, '2026-11-06')
    expect(findHalvesConflict(INV, occ, [CONF], 'night', false, '2026-11-06')).toBeNull()
    expect(findHalvesConflict(INV, occ, [CONF], 'night', true, '2026-11-06')).toMatch(/conference room/)
  })
})

describe('pricing: per day, at the typed price, no guests included', () => {
  const rates: PackageRates = { weekday_adult: 2000, friday_adult: 2500, holiday_adult: 2500, child_meal: 1500, driver_price: 1000, extra_person: 3000, extra_bed: 1500 }
  const conf = { room_type: 'conference_room', display_name: 'Conference Room', qty: 1, unit_price: 15000 }
  const deluxe = { room_type: 'deluxe', display_name: 'Deluxe', qty: 1, unit_price: 8000 }

  it('a three-night stay pays for the conference room once', () => {
    const r = calculateNight({
      checkInDate: new Date('2026-11-05T00:00:00'), checkOutDate: new Date('2026-11-08T00:00:00'),
      packageRates: rates, rooms: [conf, deluxe], adults: 2, children_paid: 0, children_free: 0,
      drivers: 0, extra_beds: 0, holidayDates: [], discount: 0, advance_required: 0, advance_paid: 0,
    })
    const line = r.line_items.find((l) => l.label.startsWith('Conference Room'))!
    expect(line).toMatchObject({ subtotal: 15000, nights: null })
    expect(line.label).toContain('per day')
    expect(r.line_items.find((l) => l.label.startsWith('Deluxe'))!.subtotal).toBe(24000)
    // the conference room sleeps nobody: 2 adults in one Deluxe, no extras
    expect(r.line_items.some((l) => l.kind === 'extra_person')).toBe(false)
  })

  it('on a day visit it is one line at the typed price', () => {
    const r = calculateDaylong({
      date: new Date('2026-11-05T00:00:00'), packageRates: rates, rooms: [conf], adults: 30,
      children_paid: 0, children_free: 0, drivers: 0, holidayDates: [], discount: 0, advance_required: 0, advance_paid: 0,
    })
    expect(r.line_items.find((l) => l.kind === 'room')!.subtotal).toBe(15000)
  })

  it('config helpers', () => {
    expect(includedPersons('conference_room')).toBe(0)
    expect(chargedNights('conference_room', 3)).toBe(1)
    expect(chargedNights('deluxe', 3)).toBe(3)
    expect(isGuestRoom('conference_room')).toBe(false)
  })
})
