import { describe, it, expect } from 'vitest'
import { toBanglaDigits, banglaDate, banglaWeekday } from './bangla-numerals'
import { headcountLine } from './headcount-line'

describe('toBanglaDigits', () => {
  it('converts a number', () => {
    expect(toBanglaDigits(2026)).toBe('২০২৬')
  })
  it('converts digits inside a string, leaving other chars alone', () => {
    expect(toBanglaDigits('8:30 - 9:00')).toBe('৮:৩০ - ৯:০০')
  })
  it('handles zero', () => {
    expect(toBanglaDigits(0)).toBe('০')
  })
  it('passes through Bangla text untouched', () => {
    expect(toBanglaDigits('পরোটা (২ পিস)')).toBe('পরোটা (২ পিস)')
  })
})

describe('banglaDate / banglaWeekday', () => {
  it('formats 2026-06-25 as ২৫ জুন ২০২৬', () => {
    expect(banglaDate('2026-06-25')).toBe('২৫ জুন ২০২৬')
  })
  it('2026-06-25 is a Thursday (বৃহস্পতিবার)', () => {
    expect(banglaWeekday('2026-06-25')).toBe('বৃহস্পতিবার')
  })
  it('2026-07-03 is a Friday (শুক্রবার)', () => {
    expect(banglaWeekday('2026-07-03')).toBe('শুক্রবার')
  })
  it('month boundaries render correctly', () => {
    expect(banglaDate('2026-01-01')).toBe('১ জানুয়ারি ২০২৬')
    expect(banglaDate('2026-12-31')).toBe('৩১ ডিসেম্বর ২০২৬')
  })
})

describe('headcountLine', () => {
  it('renders the full breakdown with trailing danda', () => {
    expect(
      headcountLine('সকালের নাস্তা', null, { total: 200, adults: 191, children: 6, drivers: 3 }),
    ).toBe('সকালের নাস্তা: ২০০ জন, প্রাপ্তবয়স্ক ১৯১ জন, শিশু ৬ জন, ড্রাইভার ৩ জন ।')
  })
  it('total-only renders without danda', () => {
    expect(headcountLine('সকালের নাস্তা', null, { total: 11, adults: null, children: null, drivers: null }))
      .toBe('সকালের নাস্তা: ১১ জন')
  })
  it('includes serving time in parentheses', () => {
    expect(headcountLine('দুপুরের খাবার', 'দুপুর ১:০০ – ২:০০', { total: 52, adults: null, children: null, drivers: null }))
      .toBe('দুপুরের খাবার (দুপুর ১:০০ – ২:০০): ৫২ জন')
  })
  it('omits null segments from the breakdown', () => {
    expect(headcountLine('রাতের খাবার', null, { total: 40, adults: 35, children: null, drivers: 1 }))
      .toBe('রাতের খাবার: ৪০ জন, প্রাপ্তবয়স্ক ৩৫ জন, ড্রাইভার ১ জন ।')
  })
  it('breakdown without total still renders', () => {
    expect(headcountLine('রাতের খাবার', null, { total: null, adults: 12, children: null, drivers: null }))
      .toBe('রাতের খাবার: প্রাপ্তবয়স্ক ১২ জন ।')
  })
  it('all-null renders just the label', () => {
    expect(headcountLine('ওয়েলকাম ড্রিংকস', null, { total: null, adults: null, children: null, drivers: null }))
      .toBe('ওয়েলকাম ড্রিংকস:')
  })
})
