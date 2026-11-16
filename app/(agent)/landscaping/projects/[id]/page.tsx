import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { LinkButton, LsEmpty, LsSection, Money, StatTile } from '@/components/landscaping/ui'
import { ClientReceiptForm, ProjectForm, VariationForm } from '@/components/landscaping/ProjectForms'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getProject, listClients } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'
const CAT: Record<string, string> = { labour: 'Daily labour', food: 'Food', transport: 'Transport', tools: 'Tools', other: 'Other', before_system: 'Before the system' }

const Bar = ({ pct, over }: { pct: number | null; over?: boolean }) => (
  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
    <div className={`h-full ${over || (pct ?? 0) > 100 ? 'bg-red-500' : (pct ?? 0) > 90 ? 'bg-amber-500' : 'bg-forest-600'}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
  </div>
)

/** One landscaping project — or a sub-project of one (e.g. ASU › Parking). */
export default async function ProjectPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data, clients] = await Promise.all([getLsMe(), getProject(params.id), listClients()])
  if (!data) notFound()
  const { project: p, parent, subProjects, variations, receipts, requisitions, expenseByCategory, account } = data
  const f = p.f
  const isSub = !!p.parent_id
  const manage = !!me && (me.is_admin || me.can_approve)
  const canPrepare = !!me && (me.can_prepare || me.is_admin)
  const hasSubs = subProjects.length > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vars = variations as any[], recs = receipts as any[]
  const lines = [...account.lines].reverse().slice(0, 200)
  const newReq = `/landscaping/requisitions/new?project=${p.id}`

  return (
    <div className="flex h-full flex-col">
      <Topbar title={isSub ? `${parent?.code ?? ''} › ${p.code}` : `${p.code} · ${p.title}`}
        subtitle={isSub ? `Sub-project of ${parent?.title ?? 'a project'} · ${p.title}` : [p.client_name, p.site].filter(Boolean).join(' · ') || 'Landscaping project'} />
      <LsPage tab="projects">
        {isSub && parent && (
          <Link href={`/landscaping/projects/${parent.id}`} className="inline-flex min-h-[40px] items-center gap-1 text-sm text-forest-700 hover:underline">
            {parent.code} · {parent.title} <ChevronRight size={14} /> {p.code}
          </Link>
        )}

        {/* Header + actions: wrap onto as many lines as the phone needs. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2"><LsStatus status={p.status} /></div>
          <div className="flex flex-wrap gap-2 sm:ml-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {canPrepare && <LinkButton href={newReq} variant="primary"><Plus size={14} /> New requisition for this project</LinkButton>}
            {me && (me.can_pay || me.is_admin) && <ClientReceiptForm projectId={p.id} />}
            {manage && !isSub && <VariationForm projectId={p.id} />}
            {manage && !isSub && <ProjectForm clients={clients} parentId={p.id} label="+ Sub-project" />}
            {manage && <ProjectForm clients={clients} project={p} />}
          </div>
        </div>

        {isSub && p.budget ? (
          // A sub-project: its own budget, its own spending, its own account.
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Budget" value={formatBDT(p.budget.budget)} />
            <StatTile label="Spent" value={formatBDT(p.budget.spent)} />
            <StatTile label="Left in budget" value={formatBDT(p.budget.remaining)} tone={p.budget.remaining < 0 ? 'bad' : 'good'} />
            <StatTile label="Supplier bills due" value={formatBDT(f.billsUnpaid)} tone={f.billsUnpaid > 0.005 ? 'owed' : 'neutral'} />
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm lg:col-span-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Budget used</p>
              <Bar pct={p.budget.usedPct} over={p.budget.overBudget} />
              <p className="mt-1 text-xs text-gray-600">{p.budget.usedPct ?? 0}% · bills {formatBDT(f.billed)} · labour / food / other {formatBDT(f.expenses)}{f.received ? ` · money in ${formatBDT(f.received)}` : ''}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Contract (with changes)" value={formatBDT(f.contractTotal)} />
            <StatTile label="Received from client" value={formatBDT(f.received)} />
            <StatTile label="Client still owes" value={formatBDT(f.owedByClient)} tone={f.owedByClient > 0.005 ? 'owed' : 'neutral'} />
            <StatTile label={hasSubs ? 'Spent (incl. sub-projects)' : 'Spent so far'} value={formatBDT(f.spent)} />
            <StatTile label="Profit (contract − spent)" value={formatBDT(f.profit)} sub={f.margin !== null ? `${f.margin}% margin` : undefined} tone={f.profit < 0 ? 'bad' : 'good'} />
            <StatTile label="Supplier bills due" value={formatBDT(f.billsUnpaid)} tone={f.billsUnpaid > 0.005 ? 'owed' : 'neutral'} />
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Contract used</p>
              <Bar pct={f.spentPct} />
              <p className="mt-1 text-xs text-gray-600">{f.spentPct ?? 0}% of the contract spent · bills {formatBDT(f.billed)} · labour / food / other {formatBDT(f.expenses)}</p>
            </div>
          </div>
        )}

        {hasSubs && (
          <LsSection title="Sub-projects" meta="each tracked separately">
            {/* Phones: cards */}
            <ul className="divide-y divide-gray-100 sm:hidden">
              {subProjects.map((s) => (
                <li key={s.id}>
                  <Link href={`/landscaping/projects/${s.id}`} className="block px-4 py-3 hover:bg-gray-50">
                    <p className="text-sm"><span className="font-medium text-forest-700">{s.code}</span> <span className="text-gray-600">{s.title}</span></p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600">
                      <span>Budget <b className="tabular-nums text-gray-900">{formatBDT(s.budget?.budget ?? 0)}</b></span>
                      <span>Spent <b className="tabular-nums text-gray-900">{formatBDT(s.ownF.spent)}</b></span>
                      <span>Left <Money value={s.budget?.remaining ?? 0} kind={(s.budget?.remaining ?? 0) < 0 ? 'profit' : 'plain'} className="font-semibold" /></span>
                    </div>
                    <Bar pct={s.budget?.usedPct ?? null} over={s.budget?.overBudget} />
                    <span className="text-[11px] text-gray-500">{s.budget?.usedPct ?? 0}% used</span>
                  </Link>
                </li>
              ))}
              <li className="px-4 py-2.5 text-xs text-gray-600">{p.code} itself (not in a sub-project): spent <b className="tabular-nums">{formatBDT(p.ownF.spent)}</b></li>
            </ul>
            {/* Tablet / desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Sub-project</th><th className="px-2 py-2 text-right">Budget</th><th className="px-2 py-2 text-right">Spent</th><th className="px-2 py-2 text-right">Left</th><th className="px-4 py-2">Used</th></tr></thead>
                <tbody>
                  {subProjects.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5"><Link href={`/landscaping/projects/${s.id}`} className="font-medium text-forest-700 hover:underline">{s.code}</Link> <span className="text-xs text-gray-500">{s.title}</span></td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.budget?.budget ?? 0)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.ownF.spent)}</td>
                      <td className="px-2 py-2.5 text-right"><Money value={s.budget?.remaining ?? 0} kind={(s.budget?.remaining ?? 0) < 0 ? 'profit' : 'plain'} /></td>
                      <td className="w-40 px-4 py-2.5"><Bar pct={s.budget?.usedPct ?? null} over={s.budget?.overBudget} /><span className="text-[11px] text-gray-500">{s.budget?.usedPct ?? 0}%</span></td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-100 text-xs text-gray-600"><td className="px-4 py-2" colSpan={2}>{p.code} itself (not in a sub-project)</td><td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.ownF.spent)}</td><td colSpan={2} /></tr>
                </tbody>
              </table>
            </div>
          </LsSection>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LsSection title={`Requisitions${hasSubs ? ' (incl. sub-projects)' : ''}`}
            action={canPrepare && requisitions.length > 0 ? <LinkButton href={newReq} className="px-3"><Plus size={14} /> New</LinkButton> : undefined}>
            {requisitions.length === 0 ? (
              <LsEmpty title="No requisitions yet" hint="A requisition asks for materials or work for this project."
                action={canPrepare ? <LinkButton href={newReq} variant="primary"><Plus size={14} /> New requisition for this project</LinkButton> : undefined} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {requisitions.map((r) => (
                  <li key={r.id}><Link href={`/landscaping/requisitions/${r.id}`} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-gray-50">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{formatReqNo(r.req_no)}</span><LsStatus status={r.status} />
                        {hasSubs && r.project_code && <span className="text-xs text-gray-500">{r.project_code}</span>}
                        {r.overBudget && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><AlertTriangle size={13} /> Over budget</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-gray-700">{r.description}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-gray-900">{formatBDT(r.total)}</p>
                      <p className="text-xs tabular-nums text-gray-500">billed {formatBDT(r.billed)}</p>
                    </div>
                  </Link></li>
                ))}
              </ul>
            )}
          </LsSection>
          <div className="space-y-4">
            <LsSection title="Labour / food / other" action={<Link href="/landscaping/cash" className="inline-flex min-h-[40px] items-center px-1 text-xs font-medium text-forest-700 hover:underline">Cash page</Link>}>
              {Object.keys(expenseByCategory).length === 0 ? <LsEmpty title="Nothing recorded yet." hint="Daily labour, food and small spending show here once recorded on the Cash page." /> : (
                <ul className="divide-y divide-gray-100">{Object.entries(expenseByCategory).map(([k, v]) => (
                  <li key={k} className="flex px-4 py-2.5 text-sm"><span>{CAT[k] ?? k}</span><Money value={v as number} className="ml-auto" /></li>
                ))}</ul>
              )}
            </LsSection>
            {vars.length > 0 && (
              <LsSection title="Contract changes">
                <ul className="divide-y divide-gray-100">{vars.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1"><p className="text-gray-800">{v.description}</p><p className="text-xs text-gray-500">{v.var_date}</p></div>
                    <Money value={Number(v.amount)} kind={Number(v.amount) < 0 ? 'profit' : 'plain'} className="flex-shrink-0" />
                  </li>
                ))}</ul>
              </LsSection>
            )}
            {recs.length === 0 && !isSub && <p className="text-xs text-gray-500">No client payments yet — use “Record client payment”.</p>}
          </div>
        </div>

        {/* The project's own account: every taka in and out, with a running balance. */}
        <LsSection title={isSub ? `${p.code} account` : hasSubs ? `${p.code} account (incl. sub-projects)` : `${p.code} account`}
          meta={<>In <Money value={account.totalIn} className="text-emerald-700" /> · Out <Money value={account.totalOut} /> · <b>Balance <Money value={account.balance} className={account.balance < 0 ? 'text-red-600' : 'text-gray-900'} /></b></>}>
          {account.lines.length === 0 ? <LsEmpty title="No money in or out yet." /> : (
            <>
              {/* Phones: one line per entry, with the running balance always visible */}
              <ul className="divide-y divide-gray-100 sm:hidden">
                {lines.map((l, k) => (
                  <li key={k} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-gray-800">{l.label}</p>
                      <p className="text-xs text-gray-500">{l.date}{hasSubs ? ` · ${l.where ?? p.code}` : ''}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <Money value={l.amount} kind={l.direction === 'in' ? 'in' : 'out'} className="block font-medium" />
                      <p className="text-xs text-gray-500">Bal. <Money value={l.balance} className={l.balance < 0 ? 'font-semibold text-red-600' : 'text-gray-700'} /></p>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Tablet / desktop: statement table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Date</th><th className="px-2 py-2">Entry</th>{hasSubs && <th className="px-2 py-2">Where</th>}<th className="px-2 py-2 text-right">In</th><th className="px-2 py-2 text-right">Out</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
                  <tbody>{lines.map((l, k) => (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">{l.date}</td>
                      <td className="px-2 py-2">{l.label}</td>
                      {hasSubs && <td className="px-2 py-2 text-xs text-gray-500">{l.where ?? p.code}</td>}
                      <td className="px-2 py-2 text-right">{l.direction === 'in' ? <Money value={l.amount} className="text-emerald-700" /> : ''}</td>
                      <td className="px-2 py-2 text-right">{l.direction === 'out' ? <Money value={l.amount} /> : ''}</td>
                      <td className="px-4 py-2 text-right font-medium"><Money value={l.balance} className={l.balance < 0 ? 'text-red-600' : ''} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>
      </LsPage>
    </div>
  )
}
