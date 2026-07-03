/**
 * Bangla numeral + date formatting for the printable খাবারের মেনু.
 * Pure functions — unit-tested in bangla-numerals.test.ts.
 */

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

export const BANGLA_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
] as const

export const BANGLA_WEEKDAYS = [
  'রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার',
] as const

/** Convert every Western digit in a number or string to Bangla digits.
 *  Non-digit characters pass through untouched. */
export function toBanglaDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)])
}

/** Parse 'YYYY-MM-DD' without timezone drift (new Date('YYYY-MM-DD') is UTC —
 *  splitting keeps the calendar date the kitchen expects). */
function parts(isoDate: string): { y: number; m: number; d: number } {
  const [y, m, d] = isoDate.split('-').map(Number)
  return { y, m, d }
}

/** '2026-06-25' → '২৫ জুন ২০২৬' */
export function banglaDate(isoDate: string): string {
  const { y, m, d } = parts(isoDate)
  return `${toBanglaDigits(d)} ${BANGLA_MONTHS[m - 1]} ${toBanglaDigits(y)}`
}

/** '2026-06-25' → 'বৃহস্পতিবার' */
export function banglaWeekday(isoDate: string): string {
  const { y, m, d } = parts(isoDate)
  // Date.UTC avoids local-timezone day shifts for the weekday calculation
  return BANGLA_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}
