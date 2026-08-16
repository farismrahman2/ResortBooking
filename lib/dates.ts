/**
 * Business dates for a resort that lives in Asia/Dhaka while the server and
 * the visitors' browsers do not.
 *
 * `new Date().toISOString().slice(0, 10)` is the bug this file exists to
 * kill: it answers "what day is it in UTC", which in Bangladesh is the WRONG
 * day from midnight to 6am local — the exact hours the night auditor and the
 * 6am kitchen shift are using the system. Every default date, same-day check
 * and "this month" preset must go through these helpers instead.
 */

const DHAKA_TZ = 'Asia/Dhaka'

const ISO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: DHAKA_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Today's calendar date in Asia/Dhaka, as 'YYYY-MM-DD'. */
export function todayDhaka(now: Date = new Date()): string {
  return ISO_DAY.format(now)
}

/** An ISO date ± n days, computed safely at UTC noon (no DST/tz edges). */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The first day of the month containing the given ISO date (default: today in Dhaka). */
export function monthStartDhaka(isoDate: string = todayDhaka()): string {
  return `${isoDate.slice(0, 7)}-01`
}

/** Convert a UTC ISO timestamp to its Asia/Dhaka calendar date. */
export function toDhakaDate(utcTimestamp: string | Date): string {
  return ISO_DAY.format(typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp)
}
