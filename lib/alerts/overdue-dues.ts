import { createClient } from '@/lib/supabase/server'
import { getOutstandingDues } from '@/lib/queries/reports/dues'
import { formatBDT } from '@/lib/formatters/currency'

/** A due is worth flagging once it is this many days old. */
export const DUE_ALERT_MIN_DAYS = 3

/**
 * ...and stops being worth flagging past this.
 *
 * Not an arbitrary cut-off. Bookings from before the checkout module was in
 * real use compute as unpaid simply because no payment rows exist for them —
 * over a hundred of them, worth ~৳1.9m on paper. Flagging those would bury
 * every real alert on the first run and teach everyone to ignore the log.
 *
 * A due is caught as it CROSSES the minimum and the alert then persists until
 * acknowledged, so the upper bound loses nothing going forward. Anything older
 * belongs in Reports → Outstanding dues, which is a ledger, not an inbox.
 */
export const DUE_ALERT_MAX_DAYS = 45

/**
 * Raise an audit-log entry for each departed guest whose balance has gone
 * unpaid past the threshold.
 *
 * Unlike every other alert, this one is not triggered by an action — nothing
 * happens when a due goes stale, time just passes — so it is raised by a scan
 * that runs daily and whenever the Audit Log is opened. Re-running is safe: a
 * partial unique index on (entity_id) where event_type='due_overdue' means the
 * second insert is rejected rather than duplicated. That is deliberately done
 * by the database rather than a read-then-write check, which two overlapping
 * scans would both pass.
 *
 * Never throws — a failed scan must not take down the page it runs on.
 */
export async function flagOverdueDues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0
  try {
    const db = client ?? (createClient() as any)  // eslint-disable-line @typescript-eslint/no-explicit-any
    const dues = await getOutstandingDues(DUE_ALERT_MIN_DAYS, client)

    const candidates = dues.rows.filter((r) => r.days_overdue <= DUE_ALERT_MAX_DAYS)
    if (candidates.length === 0) return { created: 0, skipped: 0 }

    // Which of these already have an alert. The unique index is what actually
    // guarantees uniqueness; this pre-filter just avoids a pile of doomed
    // inserts on the ordinary path where most are already flagged.
    const { data: existing } = await db
      .from('admin_alerts')
      .select('entity_id')
      .eq('event_type', 'due_overdue')
      .in('entity_id', candidates.map((r) => r.booking_id))
    const already = new Set(
      ((existing ?? []) as Array<{ entity_id: string }>).map((r) => r.entity_id),
    )

    for (const r of candidates) {
      if (already.has(r.booking_id)) { skipped++; continue }
      const who = r.is_corporate && r.company_name
        ? `${r.customer_name} (${r.company_name})`
        : r.customer_name
      const { error } = await db.from('admin_alerts').insert({
        event_type:  'due_overdue',
        entity_type: 'booking',
        entity_id:   r.booking_id,
        summary:
          `${formatBDT(r.outstanding)} unpaid ${r.days_overdue} days after checkout — `
          + `${who} (${r.booking_number})`,
        payload: {
          booking_number: r.booking_number,
          customer_phone: r.customer_phone,
          due_since:      r.due_since,
          days_overdue:   r.days_overdue,
          outstanding:    r.outstanding,
          total_bill:     r.total_bill,
          collected:      r.collected,
        },
      })
      // 23505 = the unique index did its job; a concurrent scan won the race.
      if (error) {
        if (error.code === '23505') skipped++
        else console.warn(`[overdue-dues] ${r.booking_number}: ${error.message}`)
        continue
      }
      created++
    }
  } catch (err) {
    console.warn('[overdue-dues] scan failed (non-fatal):', err)
  }
  return { created, skipped }
}
