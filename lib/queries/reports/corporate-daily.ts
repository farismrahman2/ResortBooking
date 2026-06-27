import { createClient } from '@/lib/supabase/server'
import { toDhakaDate, dhakaDateToUtcBounds } from '@/lib/queries/booking-analytics'

/**
 * CORPORATE DAILY SUMMARY — everything corporate that happened on one
 * Asia/Dhaka calendar day, in one place. Powers the Reports → Corporate
 * archive page and the scheduled snapshot job.
 *
 * "Corporate" = bookings/quotes flagged is_corporate, plus the CRM side
 * (opportunities won, activities logged, open pipeline). Money metrics use
 * confirmed + checked_out bookings created that day (same definition as the
 * sales-attribution report); cancelled / draft / no_show are excluded.
 *
 * Day buckets are computed against Asia/Dhaka dates regardless of server tz,
 * reusing the helpers in lib/queries/booking-analytics.
 */

// Statuses that count as realised revenue (mirrors getSalesAttribution).
const REVENUE_STATUSES = new Set(['confirmed', 'checked_out'])

export interface CorporateCompanyRow {
  company:     string
  bookings:    number
  revenue:     number
  collected:   number
  outstanding: number
}

export interface CorporateActivityTypeRow {
  type:  string
  count: number
}

export interface CorporateBucket {
  bookings: number
  revenue:  number
}

export interface CorporateDailySummary {
  date: string

  // Headline — corporate bookings (confirmed/checked-out) created this day
  corporate_bookings: number
  corporate_revenue:  number
  collected:          number
  outstanding:        number
  companies_count:    number

  // Corporate vs retail (same status filter, created this day)
  corp_vs_retail: { corporate: CorporateBucket; retail: CorporateBucket }

  // Quotes raised this day
  corporate_quotes:       number
  corporate_quotes_value: number

  // CRM activity
  opportunities_won:       number
  opportunities_won_value: number
  activities_logged:       number
  activities_by_type:      CorporateActivityTypeRow[]
  /** Point-in-time: weighted value of all open opportunities (context, not day-scoped). */
  open_pipeline_weighted:  number

  // Detail
  by_company: CorporateCompanyRow[]
}

/** Today's Asia/Dhaka calendar date (YYYY-MM-DD). */
export function todayDhaka(): string {
  return toDhakaDate(new Date().toISOString())
}

/** Shift a YYYY-MM-DD date by N whole days (no DST adjustment). */
export function shiftDhakaDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Compute the corporate summary for a single Dhaka day from live data.
 * Pass a service-role client (from the cron) to bypass RLS; otherwise the
 * caller's authenticated session client is used (org-wide reads via USING(true)).
 */
export async function computeCorporateDailySummary(
  date: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<CorporateDailySummary> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (client ?? createClient()) as any
  const { fromUtc, toUtc } = dhakaDateToUtcBounds(date, date)

  const [bookingsRes, quotesRes, wonRes, openRes, actsRes] = await Promise.all([
    db.from('bookings')
      .select('total, advance_paid, remaining, status, is_corporate, company_name, corporate_account_id')
      .gte('created_at', fromUtc).lt('created_at', toUtc),
    db.from('quotes')
      .select('total, status, is_corporate')
      .gte('created_at', fromUtc).lt('created_at', toUtc),
    db.from('crm_opportunities')
      .select('actual_value')
      .eq('stage', 'won')
      .gte('won_at', fromUtc).lt('won_at', toUtc),
    db.from('crm_opportunities')
      .select('weighted_value, stage')
      .eq('is_active', true),
    db.from('crm_activities')
      .select('activity_type')
      .eq('activity_date', date),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookings = (bookingsRes.data ?? []) as any[]

  // Resolve CRM account → company name for any linked corporate bookings.
  const accountIds = Array.from(
    new Set(bookings.map((b) => b.corporate_account_id).filter(Boolean)),
  ) as string[]
  const accountName = new Map<string, string>()
  if (accountIds.length > 0) {
    const { data: accs } = await db.from('crm_accounts').select('id, company_name').in('id', accountIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (accs ?? []) as any[]) accountName.set(a.id, a.company_name)
  }

  const corp:   CorporateBucket = { bookings: 0, revenue: 0 }
  const retail: CorporateBucket = { bookings: 0, revenue: 0 }
  let collected = 0
  let outstanding = 0
  const byCompany = new Map<string, CorporateCompanyRow>()

  for (const b of bookings) {
    if (!REVENUE_STATUSES.has(b.status)) continue
    const total = Number(b.total ?? 0)
    if (b.is_corporate) {
      corp.bookings += 1
      corp.revenue  += total
      collected   += Number(b.advance_paid ?? 0)
      outstanding += Number(b.remaining ?? 0)
      const company =
        (b.corporate_account_id ? accountName.get(b.corporate_account_id) : null) ||
        b.company_name || '— (unnamed)'
      const row = byCompany.get(company) ?? { company, bookings: 0, revenue: 0, collected: 0, outstanding: 0 }
      row.bookings    += 1
      row.revenue     += total
      row.collected   += Number(b.advance_paid ?? 0)
      row.outstanding += Number(b.remaining ?? 0)
      byCompany.set(company, row)
    } else {
      retail.bookings += 1
      retail.revenue  += total
    }
  }

  // Corporate quotes raised this day (any non-cancelled status).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotes = ((quotesRes.data ?? []) as any[]).filter((q) => q.is_corporate && q.status !== 'cancelled')
  const corporateQuotesValue = quotes.reduce((s, q) => s + Number(q.total ?? 0), 0)

  // Opportunities won this day.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const won = (wonRes.data ?? []) as any[]
  const oppsWonValue = won.reduce((s, o) => s + Number(o.actual_value ?? 0), 0)

  // Open pipeline (point-in-time): weighted value of non-won/non-lost opps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openPipeline = ((openRes.data ?? []) as any[])
    .filter((o) => o.stage !== 'won' && o.stage !== 'lost')
    .reduce((s, o) => s + Number(o.weighted_value ?? 0), 0)

  // Activities logged this day, grouped by type.
  const actByType = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (actsRes.data ?? []) as any[]) {
    actByType.set(a.activity_type, (actByType.get(a.activity_type) ?? 0) + 1)
  }
  const activitiesLogged = Array.from(actByType.values()).reduce((s, n) => s + n, 0)

  return {
    date,
    corporate_bookings: corp.bookings,
    corporate_revenue:  round2(corp.revenue),
    collected:          round2(collected),
    outstanding:        round2(outstanding),
    companies_count:    byCompany.size,
    corp_vs_retail: {
      corporate: { bookings: corp.bookings,   revenue: round2(corp.revenue) },
      retail:    { bookings: retail.bookings, revenue: round2(retail.revenue) },
    },
    corporate_quotes:       quotes.length,
    corporate_quotes_value: round2(corporateQuotesValue),
    opportunities_won:       won.length,
    opportunities_won_value: round2(oppsWonValue),
    activities_logged:       activitiesLogged,
    activities_by_type: Array.from(actByType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    open_pipeline_weighted: round2(openPipeline),
    by_company: Array.from(byCompany.values()).sort((a, b) => b.revenue - a.revenue),
  }
}

export interface CorporateSnapshotMeta {
  snapshot_date: string
  generated_at:  string
  generated_by:  string | null
}

/** Read an archived snapshot for a date, or null if none exists yet. */
export async function getCorporateSnapshot(
  date: string,
): Promise<{ summary: CorporateDailySummary; meta: CorporateSnapshotMeta } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { data } = await db
    .from('corporate_daily_snapshots')
    .select('snapshot_date, generated_at, generated_by, payload')
    .eq('snapshot_date', date)
    .maybeSingle()
  if (!data) return null
  return {
    summary: data.payload as CorporateDailySummary,
    meta: { snapshot_date: data.snapshot_date, generated_at: data.generated_at, generated_by: data.generated_by },
  }
}

export interface CorporateSnapshotListRow {
  date:                    string
  corporate_bookings:      number
  corporate_revenue:       number
  collected:               number
  outstanding:             number
  companies_count:         number
  opportunities_won:       number
  opportunities_won_value: number
  activities_logged:       number
}

/** Recent archived days for the summary list. */
export async function listCorporateSnapshots(limit = 30): Promise<CorporateSnapshotListRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any
  const { data } = await db
    .from('corporate_daily_snapshots')
    .select('snapshot_date, corporate_bookings, corporate_revenue, collected, outstanding, companies_count, opportunities_won, opportunities_won_value, activities_logged')
    .order('snapshot_date', { ascending: false })
    .limit(limit)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    date:                    r.snapshot_date,
    corporate_bookings:      Number(r.corporate_bookings),
    corporate_revenue:       Number(r.corporate_revenue),
    collected:               Number(r.collected),
    outstanding:             Number(r.outstanding),
    companies_count:         Number(r.companies_count),
    opportunities_won:       Number(r.opportunities_won),
    opportunities_won_value: Number(r.opportunities_won_value),
    activities_logged:       Number(r.activities_logged),
  }))
}

/**
 * Compute the summary for a day and persist it (upsert by date).
 * Used by the scheduled job; `generatedBy` is null for the job.
 */
export async function upsertCorporateSnapshot(
  date: string,
  generatedBy: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<CorporateDailySummary> {
  const summary = await computeCorporateDailySummary(date, client)
  const { error } = await client.from('corporate_daily_snapshots').upsert({
    snapshot_date:           date,
    generated_at:            new Date().toISOString(),
    generated_by:            generatedBy,
    corporate_bookings:      summary.corporate_bookings,
    corporate_revenue:       summary.corporate_revenue,
    collected:               summary.collected,
    outstanding:             summary.outstanding,
    companies_count:         summary.companies_count,
    opportunities_won:       summary.opportunities_won,
    opportunities_won_value: summary.opportunities_won_value,
    activities_logged:       summary.activities_logged,
    open_pipeline_weighted:  summary.open_pipeline_weighted,
    payload:                 summary,
  }, { onConflict: 'snapshot_date' })
  if (error) throw new Error(`upsertCorporateSnapshot: ${error.message}`)
  return summary
}
