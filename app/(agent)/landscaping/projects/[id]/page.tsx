import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { ClientReceiptForm, ProjectForm, VariationForm } from '@/components/landscaping/ProjectForms'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getProject, listClients } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'
const CAT: Record<string, string> = { labour: 'Daily labour', food: 'Food', transport: 'Transport', tools: 'Tools', other: 'Other' }

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-lg font-semibold tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</p>
  </div>
)
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
  const hasSubs = subProjects.length > 0

  return (
    <div className="flex h-full flex-col">
      <Topbar title={isSub ? `${parent?.code ?? ''} › ${p.code}` : `${p.code} · ${p.title}`}
        subtitle={isSub ? `Sub-project of ${parent?.title ?? 'a project'} · ${p.title}` : [p.client_name, p.site].filter(Boolean).join(' · ') || 'Landscaping project'} />
      <LsPage tab="projects">
        {isSub && parent && (
          <Link href={`/landscaping/projects/${parent.id}`} className="inline-flex items-center gap-1 text-xs text-forest-700 hover:underline">
            {parent.code} · {parent.title} <ChevronRight size={12} /> {p.code}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <LsStatus status={p.status} />
          <div className="ml-auto flex flex-wrap gap-2">
            {me && (me.can_pay || me.is_admin) && <ClientReceiptForm projectId={p.id} />}
            {manage && !isSub && <VariationForm projectId={p.id} />}
            {manage && !isSub && <ProjectForm clients={clients} parentId={p.id} label="+ Sub-project" />}
            {manage && <ProjectForm clients={clients} project={p} />}
          </div>
        </div>

        {isSub && p.budget ? (
          // A sub-project: its own budget, its own spending, its own account.
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Budget" value={formatBDT(p.budget.budget)} />
            <Stat label="Spent" value={formatBDT(p.budget.spent)} />
            <Stat label="Left in budget" value={formatBDT(p.budget.remaining)} tone={p.budget.remaining < 0 ? 'bad' : 'good'} />
            <Stat label="Supplier bills unpaid" value={formatBDT(f.billsUnpaid)} />
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3 lg:col-span-4">
              <p className="text-xs text-gray-500">Budget used</p>
              <Bar pct={p.budget.usedPct} over={p.budget.overBudget} />
              <p className="mt-1 text-xs text-gray-600">{p.budget.usedPct ?? 0}% · bills {formatBDT(f.billed)} · labour/food/other {formatBDT(f.expenses)}{f.received ? ` · money in ${formatBDT(f.received)}` : ''}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Contract (with changes)" value={formatBDT(f.contractTotal)} />
            <Stat label="Received from client" value={formatBDT(f.received)} />
            <Stat label="Client still owes" value={formatBDT(f.owedByClient)} />
            <Stat label={hasSubs ? 'Spent (incl. sub-projects)' : 'Spent so far'} value={formatBDT(f.spent)} />
            <Stat label="Profit (contract − spent)" value={`${formatBDT(f.profit)}${f.margin !== null ? ` · ${f.margin}%` : ''}`} tone={f.profit < 0 ? 'bad' : 'good'} />
            <Stat label="Supplier bills unpaid" value={formatBDT(f.billsUnpaid)} />
            <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Contract used</p>
              <Bar pct={f.spentPct} />
              <p className="mt-1 text-xs text-gray-600">{f.spentPct ?? 0}% of the contract spent · bills {formatBDT(f.billed)} · labour/food/other {formatBDT(f.expenses)}</p>
            </div>
          </div>
        )}

        {hasSubs && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Sub-projects — each tracked separately</h3>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Sub-project</th><th className="px-2 py-2 text-right">Budget</th><th className="px-2 py-2 text-right">Spent</th><th className="px-2 py-2 text-right">Left</th><th className="px-4 py-2">Used</th></tr></thead>
              <tbody>
                {subProjects.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5"><Link href={`/landscaping/projects/${s.id}`} className="font-medium text-forest-700 hover:underline">{s.code}</Link> <span className="text-xs text-gray-500">{s.title}</span></td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.budget?.budget ?? 0)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatBDT(s.ownF.spent)}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${s.budget && s.budget.remaining < 0 ? 'font-semibold text-red-600' : ''}`}>{formatBDT(s.budget?.remaining ?? 0)}</td>
                    <td className="w-40 px-4 py-2.5"><Bar pct={s.budget?.usedPct ?? null} over={s.budget?.overBudget} /><span className="text-[10px] text-gray-500">{s.budget?.usedPct ?? 0}%</span></td>
                  </tr>
                ))}
                <tr className="border-t border-gray-100 text-xs text-gray-600"><td className="px-4 py-2" colSpan={2}>{p.code} itself (not in a sub-project)</td><td className="px-2 py-2 text-right tabular-nums">{formatBDT(p.ownF.spent)}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* The project's own account: every taka in and out, with a running balance. */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold">{isSub ? `${p.code} account` : hasSubs ? `${p.code} account (incl. sub-projects)` : `${p.code} account`}</h3>
            <span className="text-xs text-gray-600">In {formatBDT(account.totalIn)} · Out {formatBDT(account.totalOut)} · <b className={account.balance < 0 ? 'text-red-600' : 'text-gray-900'}>Balance {formatBDT(account.balance)}</b></span>
          </div>
          {account.lines.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">No money in or out yet.</p> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Date</th><th className="px-2 py-2">Entry</th>{hasSubs && <th className="px-2 py-2">Where</th>}<th className="px-2 py-2 text-right">In</th><th className="px-2 py-2 text-right">Out</th><th className="px-4 py-2 text-right">Balance</th></tr></thead>
              <tbody>{[...account.lines].reverse().slice(0, 200).map((l, k) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-xs text-gray-600">{l.date}</td>
                  <td className="px-2 py-2">{l.label}</td>
                  {hasSubs && <td className="px-2 py-2 text-xs text-gray-500">{l.where ?? p.code}</td>}
                  <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{l.direction === 'in' ? formatBDT(l.amount) : ''}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.direction === 'out' ? formatBDT(l.amount) : ''}</td>
                  <td className={`px-4 py-2 text-right font-medium tabular-nums ${l.balance < 0 ? 'text-red-600' : ''}`}>{formatBDT(l.balance)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Requisitions{hasSubs ? ' (incl. sub-projects)' : ''}</h3>
            {requisitions.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {requisitions.map((r) => (
                  <li key={r.id}><Link href={`/landscaping/requisitions/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50">
                    <span className="font-mono font-semibold">{formatReqNo(r.req_no)}</span><LsStatus status={r.status} />
                    {hasSubs && r.project_code && <span className="text-xs text-gray-500">{r.project_code}</span>}
                    <span className="min-w-0 flex-1 truncate text-gray-700">{r.description}</span>
                    <span className="text-xs tabular-nums text-gray-600">{formatBDT(r.total)} · billed {formatBDT(r.billed)}</span>
                    {r.overBudget && <AlertTriangle size={13} className="text-red-600" />}
                  </Link></li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Labour, food & other</h3>
              {Object.keys(expenseByCategory).length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet.</p> : (
                <ul className="divide-y divide-gray-100">{Object.entries(expenseByCategory).map(([k, v]) => (
                  <li key={k} className="flex px-4 py-2 text-sm"><span>{CAT[k] ?? k}</span><span className="ml-auto tabular-nums">{formatBDT(v as number)}</span></li>
                ))}</ul>
              )}
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(variations as any[]).length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Contract changes</h3>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <ul className="divide-y divide-gray-100">{(variations as any[]).map((v) => (
                  <li key={v.id} className="flex gap-2 px-4 py-2 text-sm"><span className="text-xs text-gray-500">{v.var_date}</span><span>{v.description}</span><span className={`ml-auto tabular-nums ${Number(v.amount) < 0 ? 'text-red-600' : ''}`}>{formatBDT(Number(v.amount))}</span></li>
                ))}</ul>
              </div>
            )}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(receipts as any[]).length === 0 && !isSub && <p className="text-xs text-gray-500">No client payments yet — use “Record client payment”.</p>}
          </div>
        </div>
      </LsPage>
    </div>
  )
}
