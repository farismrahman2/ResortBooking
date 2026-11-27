import Link from 'next/link'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { LsEmpty, LsSection, Money } from '@/components/landscaping/ui'
import { ProjectForm } from '@/components/landscaping/ProjectForms'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listClients, projectsWithFinancials } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

/** Small label + number pair used in the phone cards. */
const Fig = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
    <p className="text-sm font-medium tabular-nums text-gray-900">{children}</p>
  </div>
)

/** No contract value entered yet: profit would read as a big false loss. */
const noContract = (p: { f: { contractTotal: number } }) => p.f.contractTotal <= 0.005
const NotSet = () => <span className="font-normal text-gray-400">Not set</span>

export default async function ProjectsPage() {
  await requirePermission('landscaping', 'read')
  const [me, projects, clients] = await Promise.all([getLsMe(), projectsWithFinancials(), listClients()])
  const manage = !!me && (me.is_admin || me.can_approve)
  const mainCount = projects.filter((p) => !p.parent_id).length
  return (
    <LsPage tab="projects" title="Projects" subtitle="Contract, received, spent and profit"
      actions={manage ? <ProjectForm clients={clients} mains={projects.filter((p) => !p.parent_id)} /> : undefined}>
        <LsSection title="All projects" meta={mainCount ? `${mainCount} project${mainCount === 1 ? '' : 's'}` : undefined}>
          {projects.length === 0 ? <LsEmpty title="No projects yet" hint={manage ? 'Add the first project (e.g. ASU) with “New project” at the top.' : 'An approver adds projects here.'} /> : (
            <>
              {/* Phones: one card per project */}
              <ul className="divide-y divide-gray-100 sm:hidden">
                {projects.map((p) => p.parent_id ? (
                  <li key={p.id} className="bg-gray-50/60">
                    <Link href={`/landscaping/projects/${p.id}`} className="block py-3 pl-8 pr-4 hover:bg-gray-50">
                      <p className="text-sm"><span className="font-medium text-forest-700">↳ {p.code}</span> <span className="text-gray-600">{p.title}</span></p>
                      <div className="mt-1.5 grid grid-cols-3 gap-2">
                        <Fig label="Budget">{formatBDT(p.budget?.budget ?? 0)}</Fig>
                        <Fig label="Spent">{formatBDT(p.ownF.spent)}</Fig>
                        <Fig label="Left">{p.budget ? <Money value={p.budget.remaining} kind="profit" /> : '—'}</Fig>
                      </div>
                    </Link>
                  </li>
                ) : (
                  <li key={p.id}>
                    <Link href={`/landscaping/projects/${p.id}`} className="block px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-sm"><span className="font-semibold text-forest-700">{p.code}</span> · <span className="text-gray-800">{p.title}</span>
                          {p.client_name && <span className="block text-xs text-gray-500">{p.client_name}{p.subIds.length ? ` · incl. ${p.subIds.length} sub-project${p.subIds.length === 1 ? '' : 's'}` : ''}</span>}</p>
                        <LsStatus status={p.status} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                        <Fig label="Contract">{noContract(p) ? <NotSet /> : formatBDT(p.f.contractTotal)}</Fig>
                        <Fig label="Received">{formatBDT(p.f.received)}</Fig>
                        <Fig label="Spent">{formatBDT(p.f.spent)}{p.f.spentPct !== null && <span className="ml-1 text-xs font-normal text-gray-500">{p.f.spentPct}%</span>}</Fig>
                        <Fig label="Profit">{noContract(p) ? <NotSet /> : <><Money value={p.f.profit} kind="profit" />{p.f.margin !== null && <span className="ml-1 text-xs font-normal text-gray-500">{p.f.margin}%</span>}</>}</Fig>
                      </div>
                      {noContract(p)
                        ? <p className="mt-1.5 text-xs text-gray-500">Enter the contract value to see profit.</p>
                        : p.f.owedByClient > 0.005 && <p className="mt-1.5 text-xs text-gray-600">Client owes <Money value={p.f.owedByClient} kind="owed" /></p>}
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Tablet / desktop: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
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
                        <td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.ownF.spent)}{p.budget && p.budget.usedPct !== null ? <span className={`block text-[11px] ${p.budget.overBudget ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{p.budget.usedPct}% of budget</span> : null}</td>
                        <td className="px-4 py-2 text-right text-xs">{p.budget ? <><Money value={p.budget.remaining} kind={p.budget.remaining < 0 ? 'profit' : 'plain'} className={p.budget.remaining < 0 ? '' : 'text-gray-600'} /> left</> : ''}</td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-4 py-2.5"><Link href={`/landscaping/projects/${p.id}`} className="font-semibold text-forest-700 hover:underline">{p.code}</Link> <LsStatus status={p.status} />
                          <div className="text-xs text-gray-500">{p.title}{p.client_name ? ` · ${p.client_name}` : ''}{p.subIds.length ? ` · incl. ${p.subIds.length} sub-project${p.subIds.length === 1 ? '' : 's'}` : ''}</div></td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{noContract(p) ? <NotSet /> : formatBDT(p.f.contractTotal)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.received)}</td>
                        <td className="px-2 py-2.5 text-right">{noContract(p) ? <span className="text-xs text-gray-400">—</span> : <Money value={p.f.owedByClient} kind="owed" />}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(p.f.spent)}{p.f.spentPct !== null ? <span className="block text-[11px] text-gray-500">{p.f.spentPct}% of contract</span> : null}</td>
                        <td className="px-4 py-2.5 text-right">{noContract(p)
                          ? <><NotSet /><span className="block text-[11px] text-gray-500">needs contract value</span></>
                          : <><Money value={p.f.profit} kind="profit" />{p.f.margin !== null ? <span className="block text-[11px] text-gray-500">{p.f.margin}%</span> : null}</>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>
    </LsPage>
  )
}
