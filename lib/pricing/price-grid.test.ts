import { describe, expect, it } from 'vitest'
import { adjustCell, canEditPrices, canViewPrices, copyColumn, isPriceable, needsAttention, parseCell, pctChange } from './price-grid'

describe('who may use the grid', () => {
  it('admin, manager and MD edit; accountant, ops and reservation look', () => {
    expect(['admin', 'manager', 'md'].every(canEditPrices)).toBe(true)
    expect(['accountant', 'operations_manager', 'reservation'].some(canEditPrices)).toBe(false)
    expect(['accountant', 'operations_manager', 'reservation'].every(canViewPrices)).toBe(true)
    expect(canViewPrices('front_desk')).toBe(false)
  })
})

describe('cells', () => {
  it('conference room and day-only rooms on night packages cannot be priced', () => {
    expect(isPriceable('conference_room', 'daylong', false)).toBe(false)
    expect(isPriceable('tree_house', 'night', true)).toBe(false)
    expect(isPriceable('tree_house', 'daylong', true)).toBe(true)
  })
  it('parses typed prices', () => {
    expect(parseCell('5,200')).toBe(5200)
    expect(parseCell('৳ 0')).toBe(0)
    expect(parseCell('')).toBeNull()
    expect(parseCell('12.5')).toBeUndefined()
    expect(parseCell('-3')).toBeUndefined()
  })
})

describe('bulk tools', () => {
  it('adjusts by % or ৳ and rounds; leaves 0 and empty alone', () => {
    expect(adjustCell(4500, 'pct', 10, 100)).toBe(5000)   // 4950 → 5000
    expect(adjustCell(4500, 'pct', 10, 50)).toBe(4950)
    expect(adjustCell(4500, 'abs', -300, 100)).toBe(4200)
    expect(adjustCell(0, 'pct', 10, 100)).toBe(0)
    expect(adjustCell(null, 'abs', 500, 100)).toBeNull()
  })
  it('copies a column, skipping what the target cannot price', () => {
    const src = { cottage: 5000, tree_house: 3000, deluxe: 0 }
    const tgt = { cottage: 4000, tree_house: null, deluxe: null }
    const night = (t: string) => t !== 'tree_house'
    expect(copyColumn(src, tgt, night, false)).toEqual({ cottage: 5000, deluxe: 0 })
    expect(copyColumn(src, tgt, night, true)).toEqual({ deluxe: 0 })
  })
})

describe('review', () => {
  it('flags big swings, new zeros and removals', () => {
    expect(pctChange(4000, 5000)).toBe(25)
    expect(needsAttention(4000, 5000)).toBe(false)
    expect(needsAttention(4000, 6000)).toBe(true)
    expect(needsAttention(4000, 0)).toBe(true)
    expect(needsAttention(4000, null)).toBe(true)
    expect(needsAttention(null, 4000)).toBe(false)
  })
})
