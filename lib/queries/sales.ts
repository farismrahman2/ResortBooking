import { createClient } from '@/lib/supabase/server'
import type { BookingStatus } from '@/lib/supabase/types'

export interface SalesAttributionRow {
  employee_id:     string
  employee_code:   string
  full_name:       string
  sales_team:      string | null
  bookings_count:  number
  cancelled_count: number
  total_revenue:   number
}

export interface TeamRollup {
  team_name:      string | null
  member_count:   number
  bookings_count: number
  total_revenue:  number
}

export interface SalesAttribution {
  by_rep:               SalesAttributionRow[]
  by_team:              TeamRollup[]
  /** Sum of booking.total for non-cancelled bookings without a sales rep — for context */
  unattributed_revenue: number
  /** Sum of booking.total for ALL non-cancelled bookings in range — denominator */
  total_revenue:        number
}

/**
 * Per-rep / per-team revenue rollup over a date range.
 *
 * Counts:
 *   - `bookings_count`   = confirmed + checked_out bookings tagged to this rep
 *   - `cancelled_count`  = cancelled bookings tagged to this rep (informational)
 *   - `total_revenue`    = sum of `booking.total` for confirmed + checked_out only
 *
 * Cancelled bookings DON'T contribute revenue. Range is on `visit_date`.
 */
export async function getSalesAttribution(args: {
  from: string
  to:   string
}): Promise<SalesAttribution> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: bookings, error } = await db
    .from('bookings')
    .select('id, status, total, sales_employee_id, visit_date')
    .gte('visit_date', args.from)
    .lte('visit_date', args.to)
    .neq('status', 'draft')
    .neq('status', 'sent')
    .limit(5000)
  if (error) throw new Error(`getSalesAttribution: ${error.message}`)

  // Resolve sales rep details in one extra query (small set)
  const empIds = Array.from(
    new Set(((bookings ?? []) as any[]).map((b) => b.sales_employee_id).filter(Boolean)),
  ) as string[]
  const empById = new Map<string, { id: string; employee_code: string; full_name: string; sales_team: string | null }>()
  if (empIds.length > 0) {
    const { data: emps } = await db
      .from('employees')
      .select('id, employee_code, full_name, sales_team')
      .in('id', empIds)
    for (const e of (emps ?? []) as any[]) empById.set(e.id, e)
  }

  const repMap = new Map<string, SalesAttributionRow>()
  let totalRevenue = 0
  let unattributed = 0

  for (const b of (bookings ?? []) as any[]) {
    const status = b.status as BookingStatus
    const total  = Number(b.total ?? 0)
    const isRevenue = status === 'confirmed' || status === 'checked_out'
    const isCancelled = status === 'cancelled'

    if (isRevenue) totalRevenue += total

    if (!b.sales_employee_id) {
      if (isRevenue) unattributed += total
      continue
    }

    const emp = empById.get(b.sales_employee_id)
    if (!emp) continue   // rep deleted? skip silently

    const cur = repMap.get(emp.id) ?? {
      employee_id:     emp.id,
      employee_code:   emp.employee_code,
      full_name:       emp.full_name,
      sales_team:      emp.sales_team,
      bookings_count:  0,
      cancelled_count: 0,
      total_revenue:   0,
    }
    if (isRevenue)   { cur.bookings_count  += 1; cur.total_revenue += total }
    if (isCancelled) { cur.cancelled_count += 1 }
    repMap.set(emp.id, cur)
  }

  const by_rep = Array.from(repMap.values()).sort((a, b) => b.total_revenue - a.total_revenue)

  // Team rollup — group by sales_team string (NULL = "(no team)")
  const teamMap = new Map<string | null, TeamRollup>()
  for (const r of by_rep) {
    const key = r.sales_team ?? null
    const t = teamMap.get(key) ?? {
      team_name:      key,
      member_count:   0,
      bookings_count: 0,
      total_revenue:  0,
    }
    t.member_count   += 1
    t.bookings_count += r.bookings_count
    t.total_revenue  += r.total_revenue
    teamMap.set(key, t)
  }
  const by_team = Array.from(teamMap.values()).sort((a, b) => b.total_revenue - a.total_revenue)

  return {
    by_rep,
    by_team,
    unattributed_revenue: Math.round(unattributed * 100) / 100,
    total_revenue:        Math.round(totalRevenue * 100) / 100,
  }
}
