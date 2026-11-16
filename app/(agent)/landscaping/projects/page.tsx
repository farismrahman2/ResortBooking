import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { ProjectForm } from '@/components/landscaping/ProjectForms'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listClients, projectsWithFinancials } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  await requirePermission('landscaping', 'read')
  const [me, projects, clients] = await Promise.all([getLsMe(), projectsWithFinancials(), listClients()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Projects" subtitle="Landscaping · contract, received, spent and profit per project" />
      <LsPage tab="projects">
        {me && (me.is_admin || me.can_approve) && <div className="flex justify-end"><ProjectForm clients={clients} mains={projects.filter((p) => !p.parent_id)} /></div>}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          {projects.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">No projects yet — add ASU first.</p> : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr><th className="px-4 py-2">Project</th><th className="px-2 py-2 text-right">Contract</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Client owes</th><th className="px-2 py-2 text-right">Spent</th><th className="px-4 py-2 text-right">Profit</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => p.parent_id ? (
                  // A sub-project: measured against its own budget.
                  <tr key={p.id} className="border-t border-gray-100 bg-gray-50/60">
                    <td className="py-2 pl-9 pr-4"><Link href={`/landscaping/projects/${p.id}`} className="font-medium text-forest-700 hover:underline">↳ {p.code}</Link> <span className="text-xs text-gray-500">{p.title}</span></td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-gray-500">budget {formatBDT(p.budget?.budget ?? 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.ownF.received ? formatBDT(p.ownF.received) : '—'}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-400">—</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.ownF.spent)}{p.budget?.usedPct !== null && p.budget ? <span className={`block text-[10px] ${p.budget.overBudget ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{p.budget.usedPct}% of budget</span> : null}</td>
                    <td className={`px-4 py-2 text-right text-xs tabular-nums ${p.budget && p.budget.remaining < 0 ? 'font-semibold text-red-600' : 'text-gray-600'}`}>{p.budget ? `${formatBDT(p.budget.remaining)} left` : ''}</td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5"><Link href={`/landscaping/projects/${p.id}`} className="font-semibold text-forest-700 hover:underline">{p.code}</Link> <LsStatus status={p.status} />
                      <div className="text-xs text-gray-500">{p.title}{p.client_name ? ` · ${p.client_name}` : ''}{p.subIds.length ? ` · incl. ${p.subIds.length} sub-project${p.subIds.length === 1 ? '' : 's'}` : ''}</div></td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.contractTotal)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.received)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.owedByClient)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.spent)}{p.f.spentPct !== null ? <span className="block text-[10px] text-gray-500">{p.f.spentPct}% of contract</span> : null}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${p.f.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatBDT(p.f.profit)}{p.f.margin !== null ? <span className="block text-[10px] font-normal text-gray-500">{p.f.margin}%</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </LsPage>
    </div>
  )
}
