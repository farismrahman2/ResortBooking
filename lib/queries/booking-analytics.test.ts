import { describe, expect, it } from 'vitest'
import {
  toDhakaDate,
  dhakaDateToUtcBounds,
  daysBetween,
  classifyLeadTime,
  eachDhakaDate,
} from './booking-analytics'

describe('toDhakaDate', () => {
  it('rolls a late-evening UTC timestamp into the next Dhaka day', () => {
    // 2026-05-16T18:30:00Z = 2026-05-17 00:30 in Dhaka (UTC+6)
    expect(toDhakaDate('2026-05-16T18:30:00.000Z')).toBe('2026-05-17')
  })

  it('keeps an early-evening UTC timestamp on the same Dhaka day', () => {
    // 2026-05-16T17:59:59Z = 2026-05-16 23:59:59 in Dhaka
    expect(toDhakaDate('2026-05-16T17:59:59.000Z')).toBe('2026-05-16')
  })
})

describe('dhakaDateToUtcBounds', () => {
  it('maps the start of from to UTC and the end of to to next-day midnight UTC', () => {
    const { fromUtc, toUtc } = dhakaDateToUtcBounds('2026-05-01', '2026-05-03')
    // 2026-05-01T00:00 Dhaka = 2026-04-30T18:00 UTC
    expect(fromUtc).toBe('2026-04-30T18:00:00.000Z')
    // half-open: 2026-05-04T00:00 Dhaka = 2026-05-03T18:00 UTC
    expect(toUtc).toBe('2026-05-03T18:00:00.000Z')
  })
})

describe('daysBetween', () => {
  it('returns full days between two YYYY-MM-DD dates', () => {
    expect(daysBetween('2026-05-01', '2026-05-04')).toBe(3)
    expect(daysBetween('2026-05-01', '2026-05-01')).toBe(0)
  })
})

describe('classifyLeadTime', () => {
  it.each([
    [0,  '0–2 days'],
    [2,  '0–2 days'],
    [3,  '3–7 days'],
    [7,  '3–7 days'],
    [8,  '8–14 days'],
    [14, '8–14 days'],
    [15, '15–30 days'],
    [30, '15–30 days'],
    [31, '31–60 days'],
    [60, '31–60 days'],
    [61, '61+ days'],
    [400, '61+ days'],
  ])('classifies %d days as "%s"', (days, bin) => {
    expect(classifyLeadTime(days)).toBe(bin)
  })
})

describe('eachDhakaDate', () => {
  it('returns inclusive YYYY-MM-DD list', () => {
    expect(eachDhakaDate('2026-05-01', '2026-05-03')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ])
  })

  it('returns a single date when from == to', () => {
    expect(eachDhakaDate('2026-05-16', '2026-05-16')).toEqual(['2026-05-16'])
  })
})
