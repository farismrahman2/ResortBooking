import { createClient } from '@/lib/supabase/server'
import type { BookingWithRooms, BookingStatus } from '@/lib/supabase/types'

export interface BookingFilters {
  status?:    BookingStatus
  search?:    string
  from_date?: string
  to_date?:   string
  limit?:     number
  offset?:    number
}

/** Fetch bookings with their rooms */
export async function getBookings(filters: BookingFilters = {}): Promise<BookingWithRooms[]> {
  const supabase = createClient()
  let query = supabase
    .from('bookings')
    .select('*, booking_rooms(*)')
    .order('visit_date', { ascending: true })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.from_date) query = query.gte('visit_date', filters.from_date)
  if (filters.to_date) query = query.lte('visit_date', filters.to_date)
  if (filters.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,booking_number.ilike.%${filters.search}%`,
    )
  }
  if (filters.limit) query = query.limit(filters.limit)

  const { data, error } = await query
  if (error) throw new Error(`getBookings: ${error.message}`)
  return (data ?? []).map((b: any) => ({ ...b, rooms: b.booking_rooms ?? [] }))
}

/** Fetch a single booking with its rooms */
export async function getBookingById(id: string): Promise<BookingWithRooms | null> {
  const supabase = createClient()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !booking) return null

  const { data: rooms } = await supabase
    .from('booking_rooms')
    .select('*')
    .eq('booking_id', id)

  return { ...booking, rooms: rooms ?? [] }
}

/** Get upcoming confirmed bookings */
export async function getUpcomingBookings(limit = 5): Promise<BookingWithRooms[]> {
  const today = new Date().toISOString().split('T')[0]
  return getBookings({ status: 'confirmed', from_date: today, limit })
}

/** Get booking total revenue (for dashboard) */
export async function getBookingStats(): Promise<{
  total_bookings: number
  total_revenue: number
  pending_advance: number
}> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bookings')
    .select('total, remaining')
    .neq('status', 'cancelled')

  const total_bookings = data?.length ?? 0
  const total_revenue = data?.reduce((sum, b) => sum + (b.total ?? 0), 0) ?? 0
  const pending_advance = data?.reduce((sum, b) => sum + (b.remaining ?? 0), 0) ?? 0
  return { total_bookings, total_revenue, pending_advance }
}
