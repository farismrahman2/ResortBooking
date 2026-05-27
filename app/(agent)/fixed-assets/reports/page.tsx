import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import {
  getRegisterByCategory, getMonthlyDepreciationTotal, getMaintenanceCostByCategory,
  getDisposalSummary, getComingUpForReplacement,
} from '@/lib/queries/fixed-assets'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function FixedAssetReportsPage() {
  await requirePermission('fixed_assets', 'read')
  const thisMonth = new Date().toISOString().slice(0, 10)

  let migrationError: string | null = null
  let register: Awaited<ReturnType<typeof getRegisterByCategory>> = []
  let monthlyDep = 0
  let maint: Awaited<ReturnType<typeof getMaintenanceCostByCategory>> = []
  let disposals: Awaited<ReturnType<typeof getDisposalSummary>> = []
  let replacement: Awaited<ReturnType<typeof getComingUpForReplacement>> = []

  try {
    [register, monthlyDep, maint, disposals, replacement] = await Promise.all([
      getRegisterByCategory(), getMonthlyDepreciationTotal(thisMonth),
      getMaintenanceCostByCategory(), getDisposalSummary(), getComingUpForReplacement(12),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const totalAcq = register.reduce((s, r) => s + r.acquisition, 0)
  const totalNbv = register.reduce((s, r) => s + r.nbv, 0)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Fixed Asset Reports" subtitle="Register · depreciation · maintenance · disposals" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-6">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <Section title="Asset register — by category">
              <Table head={['Category', 'Assets', 'Acquisition', 'Net book value']} rightAlign={[1, 2, 3]}
                rows={[
                  ...register.map((r) => [r.category, String(r.count), formatBDT(r.acquisition), formatBDT(r.nbv)]),
                  ['Total', String(register.reduce((s, r) => s + r.count, 0)), formatBDT(totalAcq), formatBDT(totalNbv)],
                ]} />
            </Section>

            <Section title="Depreciation">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Depreciation expense (this month)</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-800">{formatBDT(monthlyDep)}</p>
                <p className="mt-1 text-xs text-gray-400">Straight-line across all active, not-fully-depreciated assets.</p>
              </div>
            </Section>

            <Section title="Maintenance cost — by category">
              <Table head={['Category', 'Events', 'Total cost']} rightAlign={[1, 2]}
                rows={maint.map((r) => [r.label, String(r.count), formatBDT(r.total)])} />
            </Section>

            <Section title="Disposal summary — by year">
              <Table head={['Year', 'Disposals', 'Proceeds', 'NBV', 'Gain / Loss']} rightAlign={[1, 2, 3, 4]}
                rows={disposals.map((r) => [String(r.year), String(r.count), formatBDT(r.proceeds), formatBDT(r.nbv), `${r.gain_loss >= 0 ? '+' : '−'}${formatBDT(Math.abs(r.gain_loss))}`])} />
            </Section>

            <Section title="Coming up for replacement (≤ 12 months remaining)">
              <Table head={['Asset', 'Category', 'Remaining', 'Net book value']} rightAlign={[2, 3]}
                rows={replacement.map((r) => [`${r.name} (${r.asset_tag})`, r.category, `${r.remaining_months} mo`, formatBDT(r.nbv)])} />
            </Section>

            <Link href="/fixed-assets" className="inline-block text-sm text-zinc-700 hover:underline">← Back to Fixed Assets</Link>
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
