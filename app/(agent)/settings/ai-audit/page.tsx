import { Topbar } from '@/components/layout/Topbar'
import { requireRealRevenue } from '@/lib/auth/permissions'
import { listAuditReports } from '@/lib/queries/ai-audit'
import { AiAuditClient } from '@/components/settings/AiAuditClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Settings → AI audit (super admin only): findings, reports and AI spend. */
export default async function AiAuditPage() {
  await requireRealRevenue()
  const { reports, monthSpend, missing } = await listAuditReports()
  return (
    <div className="flex h-full flex-col">
      <Topbar title="AI audit" subtitle="Daily checks · weekly operations & cost report · monthly business report" />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {missing ? (
          <p className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Run <code className="rounded bg-white px-1">migrations/ai-audit/001_ai_audit.sql</code> in Supabase first.
          </p>
        ) : (
          <AiAuditClient reports={reports} monthSpend={monthSpend} keySet={!!process.env.ANTHROPIC_API_KEY} />
        )}
      </div>
    </div>
  )
}
