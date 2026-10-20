import { createServiceClient } from '@/lib/supabase/server'
import type { Finding } from '@/lib/audit/types'

export interface AuditReportRow {
  id: string; agent: 'daily' | 'weekly' | 'monthly'; period_start: string; period_end: string
  status: 'pending' | 'done' | 'failed'; findings: Finding[]; report: string | null; error: string | null
  model: string | null; input_tokens: number; output_tokens: number; cost_usd: number
  triggered_by: string; created_at: string; completed_at: string | null
}

/** Reports for Settings → AI audit. Service role: the table has no RLS policies.
 *  Callers must have checked the viewer is the admin. */
export async function listAuditReports(): Promise<{ reports: AuditReportRow[]; monthSpend: number; missing: boolean }> {
  const db = createServiceClient() as any   // eslint-disable-line @typescript-eslint/no-explicit-any
  const since = new Date(Date.now() - 400 * 86400000).toISOString()
  const { data, error } = await db.from('ai_audit_reports').select('*').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(200)
  if (error) return { reports: [], monthSpend: 0, missing: /does not exist|schema cache/i.test(error.message) }
  const reports = (data ?? []).map((r: AuditReportRow) => ({ ...r, cost_usd: Number(r.cost_usd ?? 0) })) as AuditReportRow[]
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const monthSpend = reports.filter((r) => r.created_at >= monthStart.toISOString()).reduce((s, r) => s + r.cost_usd, 0)
  return { reports, monthSpend, missing: false }
}
