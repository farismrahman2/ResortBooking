import { createClient } from '@/lib/supabase/server'
import type { QuoteRow, QuoteWithRooms, BookingStatus } from '@/lib/supabase/types'

export interface QuoteFilters {
  status?:       BookingStatus
  search?:       string    // customer name or phone
  from_date?:    string
  to_date?:      string
  limit?:        number
  offset?:       number
}

/** Fetch quotes with optional filters */
export async function getQuotes(filters: QuoteFilters = {}): Promise<QuoteRow[]> {
  const supabase = createClient()
  let query = supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from_date) query = query.gte('visit_date', filters.from_date)
  if (filters.to_date) query = query.lte('visit_date', filters.to_date)
  if (filters.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,quote_number.ilike.%${filters.search}%`,
    )
  }
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`getQuotes: ${error.message}`)
  return data ?? []
}

/** Fetch a single quote with its rooms */
export async function getQuoteById(id: string): Promise<QuoteWithRooms | null> {
  const supabase = createClient()
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !quote) return null

  const { data: rooms } = await supabase
    .from('quote_rooms')
    .select('*')
    .eq('quote_id', id)

  return { ...quote, rooms: rooms ?? [] }
}

/** Get quote count by status (for dashboard) */
export async function getQuoteStatusCounts(): Promise<Record<BookingStatus, number>> {
  const supabase = createClient()
  const { data } = await supabase.from('quotes').select('status')
  const counts: Record<string, number> = { draft: 0, sent: 0, confirmed: 0, cancelled: 0 }
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts as Record<BookingStatus, number>
}

/** Get recent quotes for dashboard */
export async function getRecentQuotes(limit = 5): Promise<QuoteRow[]> {
  return getQuotes({ limit })
}
