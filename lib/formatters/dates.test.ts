import { describe, expect, it } from 'vitest'
import { formatTime12h } from './dates'

describe('formatTime12h', () => {
  it('formats the "HH:MM:SS" shape Postgres time columns return', () => {
    expect(formatTime12h('09:00:00')).toBe('9:00 AM')
    expect(formatTime12h('19:00:00')).toBe('7:00 PM')
    expect(formatTime12h('14:30:00')).toBe('2:30 PM')
  })

  it('formats a plain "HH:MM"', () => {
    expect(formatTime12h('08:00')).toBe('8:00 AM')
    expect(formatTime12h('18:00')).toBe('6:00 PM')
  })

  it('handles the two ends of the clock', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM')
    expect(formatTime12h('12:00')).toBe('12:00 PM')
    expect(formatTime12h('23:59')).toBe('11:59 PM')
  })

  it('passes through anything that is not a time', () => {
    expect(formatTime12h('')).toBe('')
    expect(formatTime12h('noon')).toBe('noon')
  })
})
