import { toBanglaDigits } from './bangla-numerals'

export interface HeadcountParts {
  total:    number | null
  adults:   number | null
  children: number | null
  drivers:  number | null
}

/**
 * Builds the bold headcount line exactly as in the WhatsApp samples:
 *
 *   সকালের নাস্তা (সকাল ৮:৩০ – ৯:০০)ঃ ২০০ জন, প্রাপ্তবয়স্ক ১৯১ জন, শিশু ৬ জন, ড্রাইভার ৩ জন ।
 *
 * Segments with a null value are omitted. Total-only renders as
 * `সকালের নাস্তা: ১১ জন` (no trailing danda). The trailing ` ।` appears only
 * when a breakdown follows the total, matching the samples. Numbers are
 * entered as stated — never recomputed (the samples contain inconsistencies
 * and the kitchen sends what it sends).
 */
export function headcountLine(
  mealLabel: string,
  servingTime: string | null,
  counts: HeadcountParts,
): string {
  const label = servingTime ? `${mealLabel} (${servingTime})` : mealLabel

  const breakdown: string[] = []
  if (counts.adults   != null) breakdown.push(`প্রাপ্তবয়স্ক ${toBanglaDigits(counts.adults)} জন`)
  if (counts.children != null) breakdown.push(`শিশু ${toBanglaDigits(counts.children)} জন`)
  if (counts.drivers  != null) breakdown.push(`ড্রাইভার ${toBanglaDigits(counts.drivers)} জন`)

  const segments: string[] = []
  if (counts.total != null) segments.push(`${toBanglaDigits(counts.total)} জন`)
  segments.push(...breakdown)

  if (segments.length === 0) return `${label}:`
  const body = segments.join(', ')
  return breakdown.length > 0 ? `${label}: ${body} ।` : `${label}: ${body}`
}
