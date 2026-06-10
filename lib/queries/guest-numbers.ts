import { createClient } from '@/lib/supabase/server'

export interface GuestNumber {
  phone:      string   // normalized: 01XXXXXXXXX
  name:       string   // most recent guest name seen with this number
  sources:    string[] // e.g. ['booking', 'quote']
  last_seen:  string   // ISO date of most recent quote/booking
}

/** Normalize a Bangladeshi phone number for dedupe.
 *  Strips everything non-digit, converts +880/880 prefix to leading 0.
 *  Returns null for blanks/garbage shorter than 10 digits. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('880')) digits = '0' + digits.slice(3)
  if (digits.length < 10) return null
  return digits
}

/** Every unique guest phone number across quotes + bookings (all statuses).
 *  Paginates in 1000-row batches so the result is complete regardless of the
 *  PostgREST response cap. */
export async function getUniqueGuestNumbers(): Promise<GuestNumber[]> {
  const supabase = createClient()
  const PAGE = 1000

  async function fetchAll(table: 'quotes' | 'bookings') {
    const rows: { customer_name: string; customer_phone: string; created_at: string }[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select('customer_name, customer_phone, created_at')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`[guestNumbers.${table}] ${error.message}`)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return rows
  }

  const [quotes, bookings] = await Promise.all([fetchAll('quotes'), fetchAll('bookings')])

  const map = new Map<string, GuestNumber>()
  function ingest(rows: typeof quotes, source: 'quote' | 'booking') {
    for (const r of rows) {
      const phone = normalizePhone(r.customer_phone)
      if (!phone) continue
      const existing = map.get(phone)
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source)
        // rows arrive oldest→newest, so later rows are more recent
        if (r.created_at >= existing.last_seen) {
          existing.last_seen = r.created_at
          if (r.customer_name?.trim()) existing.name = r.customer_name.trim()
        }
      } else {
        map.set(phone, {
          phone,
          name: r.customer_name?.trim() ?? '',
          sources: [source],
          last_seen: r.created_at,
        })
      }
    }
  }
  ingest(quotes, 'quote')
  ingest(bookings, 'booking')

  // Most recently seen first
  return [...map.values()].sort((a, b) => b.last_seen.localeCompare(a.last_seen))
}
