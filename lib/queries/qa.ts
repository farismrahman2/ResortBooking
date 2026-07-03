import { createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/queries/guest-numbers'
import type {
  GuestFeedbackSummary,
  QaMonthlyTrend,
  QaPendingBooking,
  QaReviewStatus,
  QaReviewWithBooking,
  QaTrends,
} from '@/lib/supabase/types-qa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/** How many days after checkout a guest stays in the call queue. Two days so
 *  a guest missed on the first day isn't lost — anyone older ages out. */
export const QA_WINDOW_DAYS = 2

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/** PostgREST filter for "effective checkout date within [from, to]" —
 *  night stays use check_out_date, daylong visits fall back to visit_date. */
function departedBetween(from: string, to: string): string {
  return [
    `and(check_out_date.gte.${from},check_out_date.lte.${to})`,
    `and(check_out_date.is.null,visit_date.gte.${from},visit_date.lte.${to})`,
  ].join(',')
}

const REVIEW_WITH_BOOKING = `
  *,
  booking:bookings (booking_number, visit_date, check_out_date, package_type)
`

/**
 * Checked-out bookings from the last QA_WINDOW_DAYS days that still need a
 * feedback call. Bookings whose prior attempt was unreachable/declined stay
 * in the queue (flagged) so the collector can retry until they age out.
 */
export async function getPendingQaCalls(): Promise<QaPendingBooking[]> {
  const from = isoDaysAgo(QA_WINDOW_DAYS)
  const to   = isoDaysAgo(0)

  const { data, error } = await dbc()
    .from('bookings')
    .select(`
      id, booking_number, customer_name, customer_phone,
      package_type, visit_date, check_out_date, nights, adults,
      booking_rooms (room_type, qty, room_numbers),
      qa_reviews (status)
    `)
    .eq('status', 'checked_out')
    .or(departedBetween(from, to))
    .order('visit_date', { ascending: false })
  if (error) throw new Error(`getPendingQaCalls: ${error.message}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .filter((b) => {
      const review = Array.isArray(b.qa_reviews) ? b.qa_reviews[0] : b.qa_reviews
      return !review || review.status !== 'completed'
    })
    .map((b) => {
      const review = Array.isArray(b.qa_reviews) ? b.qa_reviews[0] : b.qa_reviews
      return {
        id:             b.id,
        booking_number: b.booking_number,
        customer_name:  b.customer_name,
        customer_phone: b.customer_phone,
        package_type:   b.package_type,
        visit_date:     b.visit_date,
        check_out_date: b.check_out_date,
        nights:         b.nights,
        adults:         b.adults,
        rooms:          b.booking_rooms ?? [],
        departed_on:    b.check_out_date ?? b.visit_date,
        prior_attempt:  (review?.status as QaReviewStatus | undefined) ?? null,
      }
    })
}

/** All recorded reviews (any status), newest first. */
export async function getQaReviews(limit = 300): Promise<QaReviewWithBooking[]> {
  const { data, error } = await dbc()
    .from('qa_reviews')
    .select(REVIEW_WITH_BOOKING)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`getQaReviews: ${error.message}`)
  return (data ?? []) as QaReviewWithBooking[]
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10
}

/**
 * Cross-stay feedback history for one guest phone number. Returns null when
 * the phone doesn't normalize (blank/garbage) or the guest has no reviews.
 */
export async function getGuestFeedbackByPhone(rawPhone: string): Promise<GuestFeedbackSummary | null> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return null

  const { data, error } = await dbc()
    .from('qa_reviews')
    .select(REVIEW_WITH_BOOKING)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`getGuestFeedbackByPhone: ${error.message}`)

  const reviews = (data ?? []) as QaReviewWithBooking[]
  if (reviews.length === 0) return null

  const completed = reviews.filter((r) => r.status === 'completed')
  return {
    phone,
    review_count: completed.length,
    avg_overall:  avg(completed.map((r) => r.overall_rating).filter((n): n is number => n != null)),
    avg_room:     avg(completed.map((r) => r.room_service_rating).filter((n): n is number => n != null)),
    avg_food:     avg(completed.map((r) => r.food_rating).filter((n): n is number => n != null)),
    issue_count:  reviews.filter((r) => r.other_issue).length,
    last_review:  reviews[0] ?? null,
    reviews,
  }
}

/** Aggregates for the Trends tab. All computed app-side — QA volumes are
 *  a handful of calls per day, far below the PostgREST row cap. */
export async function getQaTrends(months = 6): Promise<QaTrends> {
  const db = dbc()

  const start = new Date()
  start.setDate(1)
  start.setMonth(start.getMonth() - (months - 1))
  const startIso = start.toISOString().split('T')[0]

  const cover30From = isoDaysAgo(30)
  const cover30To   = isoDaysAgo(0)

  const [reviewsRes, checkoutsRes, issuesRes] = await Promise.all([
    db.from('qa_reviews')
      .select('created_at, status, room_service_rating, food_rating, overall_rating, other_issue, customer_phone, customer_name')
      .gte('created_at', startIso)
      .order('created_at', { ascending: true })
      .limit(2000),
    db.from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'checked_out')
      .or(departedBetween(cover30From, cover30To)),
    db.from('qa_reviews')
      .select(REVIEW_WITH_BOOKING)
      .eq('other_issue', true)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  if (reviewsRes.error) throw new Error(`getQaTrends: ${reviewsRes.error.message}`)

  type Slim = {
    created_at: string; status: QaReviewStatus
    room_service_rating: number | null; food_rating: number | null; overall_rating: number | null
    other_issue: boolean; customer_phone: string; customer_name: string
  }
  const rows = (reviewsRes.data ?? []) as Slim[]

  // Monthly buckets (completed reviews only for averages)
  const byMonth = new Map<string, Slim[]>()
  for (const r of rows) {
    const month = r.created_at.slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(r)
  }
  const monthly: QaMonthlyTrend[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      const done = list.filter((r) => r.status === 'completed')
      return {
        month,
        review_count:     done.length,
        avg_room_service: avg(done.map((r) => r.room_service_rating).filter((n): n is number => n != null)),
        avg_food:         avg(done.map((r) => r.food_rating).filter((n): n is number => n != null)),
        avg_overall:      avg(done.map((r) => r.overall_rating).filter((n): n is number => n != null)),
        issue_count:      list.filter((r) => r.other_issue).length,
      }
    })

  // Coverage — last 30 days
  const recent = rows.filter((r) => r.created_at.slice(0, 10) >= cover30From)

  // Repeat complainers — guests with issues on 2+ separate reviews
  const issuesByPhone = new Map<string, { name: string; count: number }>()
  for (const r of rows) {
    if (!r.other_issue) continue
    const entry = issuesByPhone.get(r.customer_phone) ?? { name: r.customer_name, count: 0 }
    entry.count += 1
    entry.name = r.customer_name
    issuesByPhone.set(r.customer_phone, entry)
  }
  const repeat_complainers = [...issuesByPhone.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([phone, v]) => ({ phone, name: v.name, issue_count: v.count }))
    .sort((a, b) => b.issue_count - a.issue_count)

  return {
    monthly,
    checkouts_30d: checkoutsRes.count ?? 0,
    attempted_30d: recent.length,
    completed_30d: recent.filter((r) => r.status === 'completed').length,
    recent_issues: (issuesRes.data ?? []) as QaReviewWithBooking[],
    repeat_complainers,
  }
}
