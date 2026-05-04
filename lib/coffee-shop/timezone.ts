/**
 * Coffee Shop runs in Bangladesh, server runs in UTC. The same-day edit
 * window is computed against Asia/Dhaka local date — never the server's
 * UTC date. This single helper is the source of truth.
 */

const DHAKA_TZ = 'Asia/Dhaka'

/** Returns 'YYYY-MM-DD' for "today" in Asia/Dhaka regardless of server tz. */
export function getTodayInDhaka(now: Date = new Date()): string {
  // en-CA renders ISO date without locale rearrangement.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DHAKA_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** True iff the given sale_date matches today's Dhaka calendar date. */
export function isStillSameDayInDhaka(saleDate: string, now: Date = new Date()): boolean {
  return getTodayInDhaka(now) === saleDate
}
