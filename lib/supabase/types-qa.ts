/**
 * Row types for the Guest Feedback / QA module. Kept separate from
 * lib/supabase/types.ts so the core types file doesn't grow further.
 */

import type { PackageType, RoomType } from './types'

export type QaReviewStatus = 'completed' | 'unreachable' | 'declined'
export type WouldReturn    = 'yes' | 'no' | 'maybe'

export interface QaReviewRow {
  id:             string
  booking_id:     string
  /** Digits-only phone — the guest's cross-stay identity key. */
  customer_phone: string
  customer_name:  string
  status:         QaReviewStatus

  room_service_rating:  number | null
  room_service_comment: string | null
  food_rating:          number | null
  food_comment:         string | null
  other_issue:          boolean
  other_comment:        string | null

  overall_rating: number | null
  would_return:   WouldReturn | null

  reviewed_by:      string | null
  reviewed_by_name: string | null

  created_at: string
  updated_at: string
}

/** A checked-out booking awaiting its QA call. */
export interface QaPendingBooking {
  id:             string
  booking_number: string
  customer_name:  string
  customer_phone: string
  package_type:   PackageType
  visit_date:     string
  check_out_date: string | null
  nights:         number | null
  adults:         number
  rooms:          Array<{ room_type: RoomType; qty: number; room_numbers: string[] }>
  /** Effective checkout date (check_out_date, falling back to visit_date for daylong). */
  departed_on:    string
  /** Set when a previous attempt was marked unreachable/declined. */
  prior_attempt:  QaReviewStatus | null
}

/** Completed review joined with its booking's stay dates. */
export interface QaReviewWithBooking extends QaReviewRow {
  booking: {
    booking_number: string
    visit_date:     string
    check_out_date: string | null
    package_type:   PackageType
  } | null
}

/** Cross-stay feedback summary for one guest phone number. */
export interface GuestFeedbackSummary {
  phone:          string
  review_count:   number
  avg_overall:    number | null
  avg_room:       number | null
  avg_food:       number | null
  issue_count:    number
  last_review:    QaReviewWithBooking | null
  reviews:        QaReviewWithBooking[]
}

export interface QaMonthlyTrend {
  /** YYYY-MM */
  month:            string
  review_count:     number
  avg_room_service: number | null
  avg_food:         number | null
  avg_overall:      number | null
  issue_count:      number
}

export interface QaTrends {
  monthly:            QaMonthlyTrend[]
  /** Coverage over the last 30 days: reviews attempted vs. checkouts. */
  checkouts_30d:      number
  attempted_30d:      number
  completed_30d:      number
  recent_issues:      QaReviewWithBooking[]
  repeat_complainers: Array<{ phone: string; name: string; issue_count: number }>
}
