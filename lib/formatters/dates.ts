/**
 * Date formatting utilities
 */

/**
 * Format a date string or Date to 'Weekday, DD Mon YYYY' (e.g. 'Saturday, 11 Apr 2026')
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  const weekday  = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${weekday}, ${datePart}`
}

/**
 * Format a date string to 'DD/MM/YYYY' for compact display
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Format a date range: '14 Apr 2025 → 16 Apr 2025 (2 nights)'
 */
export function formatDateRange(checkIn: string, checkOut: string): string {
  const inDate  = new Date(checkIn + 'T00:00:00')
  const outDate = new Date(checkOut + 'T00:00:00')
  const nights  = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24))
  return `${formatDate(inDate)} → ${formatDate(outDate)} (${nights} night${nights !== 1 ? 's' : ''})`
}

/**
 * Format a package time for display: '09:00:00' → '9:00 AM', '19:00' → '7:00 PM'.
 * Postgres `time` columns come back as 'HH:MM:SS', so never show them raw.
 */
export function formatTime12h(time: string): string {
  if (!time) return time
  const [hRaw, mRaw = '00'] = time.split(':')
  let h = parseInt(hRaw, 10)
  if (Number.isNaN(h)) return time
  const minutes = mRaw.padStart(2, '0').slice(0, 2)
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${minutes} ${period}`
}

/**
 * Convert a Date to ISO date string 'YYYY-MM-DD'
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Is the date a Friday?
 */
export function isFriday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  return d.getDay() === 5
}

/**
 * Is the date in the holiday list?
 */
export function isHoliday(date: Date | string, holidayDates: string[]): boolean {
  const iso = typeof date === 'string' ? date : toISODate(date)
  return holidayDates.includes(iso)
}

/**
 * Get day label for a date (Weekday / Friday / Holiday)
 */
export function getDayType(
  date: Date | string,
  holidayDates: string[],
): 'friday' | 'holiday' | 'weekday' {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  if (isFriday(d)) return 'friday'
  if (isHoliday(d, holidayDates)) return 'holiday'
  return 'weekday'
}

/**
 * Compute number of nights between two ISO date strings
 */
export function computeNights(checkIn: string, checkOut: string): number {
  const inDate  = new Date(checkIn + 'T00:00:00')
  const outDate = new Date(checkOut + 'T00:00:00')
  return Math.max(1, Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24)))
}
