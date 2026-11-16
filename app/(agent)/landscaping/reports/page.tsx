import { Download } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { requirePermission } from '@/lib/auth/permissions'
import { cashFloats, listSuppliers, monthlyPnl, projectsWithFinancials } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const Box = ({ title, csv, children }: { title: string; csv?: string; children: React.ReactNode }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <div className="flex items-center border-b border-gray-100 px-4 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {csv && <a href={`/api/landscaping/export?report=${csv}`} className="ml-auto inline-flex items-center gap-1 text-xs text-forest-700 hover:underline"><Download size={12} /> CSV</a>}
    </div>
    {children}
  </div>
)

export default async function LandscapingReports() {
  await requirePermission('landscaping', 'read')
  const [months, projects, suppliers, { floats }] = await Promise.all([monthlyPnl(), projectsWithFinancials(), listSuppliers(), cashFloats()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Reports" subtitle="Landscaping only — never mixed with the resort" />
      <LsPage tab="reports">
        <Box title="Money in and out by month (cash basis)" csv="monthly">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Month</th><th className="px-2 py-2 text-right">Client payments</th><th className="px-2 py-2 text-right">Supplier bills paid</th><th className="px-2 py-2 text-right">Labour</th><th className="px-2 py-2 text-right">Food</th><th className="px-2 py-2 text-right">Other</th><th className="px-4 py-2 text-right">Net</th></tr></thead>
            <tbody>{months.map((m) => (
              <tr key={m.month} className="border-t border-gray-100"><td className="px-4 py-2">{m.month}</td>
                {[m.moneyIn, m.bills, m.labour, m.food, m.other].map((v, k) => <td key={k} className="px-2 py-2 text-right tabular-nums">{formatBDT(v)}</td>)}
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${m.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatBDT(m.net)}</td></tr>
            ))}</tbody>
          </table>
        </Box>
        <Box title="Profit by project" csv="projects">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Project</th><th className="px-2 py-2 text-right">Contract</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Spent</th><th className="px-4 py-2 text-right">Profit</th></tr></thead>
            <tbody>{projects.map((p) => p.parent_id ? (
              <tr key={p.id} className="border-t border-gray-100 bg-gray-50/60 text-xs"><td className="py-2 pl-9 pr-4">↳ {p.code} · {p.title}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-500">budget {formatBDT(p.budget?.budget ?? 0)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.ownF.received ? formatBDT(p.ownF.received) : '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.ownF.spent)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${p.budget && p.budget.remaining < 0 ? 'font-semibold text-red-600' : 'text-gray-600'}`}>{p.budget ? `${formatBDT(p.budget.remaining)} left of budget` : ''}</td></tr>
            ) : (
              <tr key={p.id} className="border-t border-gray-100"><td className="px-4 py-2">{p.code} · {p.title}{p.subIds.length ? <span className="text-xs text-gray-500"> (incl. sub-projects)</span> : null}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.f.contractTotal)}</td><td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.f.received)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.f.spent)}</td>
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${p.f.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatBDT(p.f.profit)}{p.f.margin !== null ? ` (${p.f.margin}%)` : ''}</td></tr>
            ))}</tbody>
          </table>
        </Box>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Box title="Owed to suppliers" csv="suppliers">
            <ul className="divide-y divide-gray-100">{suppliers.filter((s) => s.owed > 0).map((s) => (
              <li key={s.id} className="flex px-4 py-2 text-sm"><span>{s.name}</span><span className="ml-auto font-semibold tabular-nums text-red-600">{formatBDT(s.owed)}</span></li>
            ))}</ul>
          </Box>
          <Box title="Cash with each accountant">
            <ul className="divide-y divide-gray-100">{floats.map((f) => (
              <li key={f.holder} className="flex px-4 py-2 text-sm"><span>{f.name}</span><span className="ml-auto font-semibold tabular-nums">{formatBDT(f.balance)}</span></li>
            ))}</ul>
          </Box>
        </div>
      </LsPage>
    </div>
  )
}
