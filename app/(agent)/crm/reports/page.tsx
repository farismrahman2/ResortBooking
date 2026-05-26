import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import {
  getPipelineForecast, getWinRate, getTopAccounts, getActivityVolume, getSectorBreakdown,
} from '@/lib/queries/reports/crm'
import { ACTIVITY_TYPE_LABELS } from '@/components/crm/labels'
import { formatBDT } from '@/lib/formatters/currency'
import type { ActivityType } from '@/lib/supabase/types-crm'

export const dynamic = 'force-dynamic'

export default async function CrmReportsPage() {
  await requirePermission('crm', 'read')

  let migrationError: string | null = null
  let forecast: Awaited<ReturnType<typeof getPipelineForecast>> | null = null
  let winRate: Awaited<ReturnType<typeof getWinRate>> | null = null
  let topAccounts: Awaited<ReturnType<typeof getTopAccounts>> = []
  let activity: Awaited<ReturnType<typeof getActivityVolume>> | null = null
  let sectors: Awaited<ReturnType<typeof getSectorBreakdown>> = []

  try {
    [forecast, winRate, topAccounts, activity, sectors] = await Promise.all([
      getPipelineForecast(), getWinRate(), getTopAccounts(), getActivityVolume(), getSectorBreakdown(),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Corporate Sales Reports" subtitle="Pipeline · win rate · accounts · activity · sectors" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <Section title="Pipeline forecast — by month (weighted)">
              <Table head={['Month', 'Deals', 'Est. value', 'Weighted']} rightAlign={[1, 2, 3]}
                rows={forecast!.byMonth.map((r) => [r.month, String(r.count), formatBDT(r.est_value), formatBDT(r.weighted_value)])} />
            </Section>

            <Section title="Pipeline — by stage">
              <Table head={['Stage', 'Deals', 'Est. value', 'Weighted']} rightAlign={[1, 2, 3]}
                rows={forecast!.byStage.map((r) => [r.stage, String(r.count), formatBDT(r.est_value), formatBDT(r.weighted_value)])} />
            </Section>

            <Section title={`Win rate — overall ${winRate!.overall.rate != null ? winRate!.overall.rate + '%' : '—'} (${winRate!.overall.won}W / ${winRate!.overall.lost}L)`}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SubTable title="By sector" rows={winRate!.bySector} />
                <SubTable title="By tier" rows={winRate!.byTier} />
                <SubTable title="By owner" rows={winRate!.byOwner} />
              </div>
            </Section>

            <Section title="Top accounts by closed revenue">
              <Table head={['Account', 'Won deals', 'Revenue']} rightAlign={[1, 2]}
                rows={topAccounts.map((r) => [r.company_name, String(r.won_deals), formatBDT(r.revenue)])} />
            </Section>

            <Section title="Activity volume">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Table head={['Type', 'Count']} rightAlign={[1]}
                  rows={activity!.byType.map((r) => [ACTIVITY_TYPE_LABELS[r.label as ActivityType] ?? r.label, String(r.count)])} />
                <Table head={['Rep', 'Count']} rightAlign={[1]}
                  rows={activity!.byRep.map((r) => [r.label, String(r.count)])} />
              </div>
            </Section>

            <Section title="Sector breakdown">
              <Table head={['Sector', 'Accounts', 'Closed revenue']} rightAlign={[1, 2]}
                rows={sectors.map((r) => [r.sector, String(r.accounts), formatBDT(r.revenue)])} />
            </Section>

            <Link href="/crm" className="inline-block text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>{children}</div>)
}

function Table({ head, rows, rightAlign = [] }: { head: string[]; rows: string[][]; rightAlign?: number[] }) {
  if (rows.length === 0) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No data.</div>
  const ra = new Set(rightAlign)
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-medium ${ra.has(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} className={`px-4 py-2 ${ra.has(ci) ? 'text-right tabular-nums' : 'text-gray-700'}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubTable({ title, rows }: { title: string; rows: { label: string; won: number; lost: number; rate: number | null }[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">{title}</div>
      {rows.length === 0 ? <p className="p-4 text-center text-xs text-gray-400">No closed deals.</p> : (
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 text-gray-700">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{r.won}W/{r.lost}L</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">{r.rate != null ? `${r.rate}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
