import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
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

export default async function ProjectPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data, clients] = await Promise.all([getLsMe(), getProject(params.id), listClients()])
  if (!data) notFound()
  const { project: p, variations, receipts, requisitions, expenseByCategory } = data
  const f = p.f
  const manage = !!me && (me.is_admin || me.can_approve)
  return (
    <div className="flex h-full flex-col">
      <Topbar title={`${p.code} · ${p.title}`} subtitle={[p.client_name, p.site].filter(Boolean).join(' · ') || 'Landscaping project'} />
      <LsPage tab="projects">
        <div className="flex flex-wrap items-center gap-2">
          <LsStatus status={p.status} />
          <div className="ml-auto flex flex-wrap gap-2">
            {me && (me.can_pay || me.is_admin) && <ClientReceiptForm projectId={p.id} />}
            {manage && <VariationForm projectId={p.id} />}
            {manage && <ProjectForm clients={clients} project={p} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([['Contract (with changes)', f.contractTotal], ['Received from client', f.received], ['Client still owes', f.owedByClient], ['Spent so far', f.spent]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">{l}</p><p className="text-lg font-semibold tabular-nums">{formatBDT(v)}</p></div>
          ))}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">Profit (contract − spent)</p>
            <p className={`text-lg font-semibold tabular-nums ${f.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatBDT(f.profit)}{f.margin !== null ? ` · ${f.margin}%` : ''}</p></div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">Supplier bills unpaid</p><p className="text-lg font-semibold tabular-nums">{formatBDT(f.billsUnpaid)}</p></div>
          <div className="col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">Budget used</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${f.spentPct !== null && f.spentPct > 90 ? 'bg-red-500' : 'bg-forest-600'}`} style={{ width: `${Math.min(100, f.spentPct ?? 0)}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-600">{f.spentPct ?? 0}% of the contract spent · bills {formatBDT(f.billed)} · labour/food/other {formatBDT(f.expenses)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Requisitions</h3>
            {requisitions.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet.</p> : (
              <ul className="divide-y divide-gray-100">
                {requisitions.map((r) => (
                  <li key={r.id}><Link href={`/landscaping/requisitions/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50">
                    <span className="font-mono font-semibold">{formatReqNo(r.req_no)}</span><LsStatus status={r.status} />
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
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Client payments</h3>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {receipts.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet.</p> : <ul className="divide-y divide-gray-100">{(receipts as any[]).map((r) => (
                <li key={r.id} className="flex gap-2 px-4 py-2 text-sm"><span className="text-xs text-gray-500">{r.receipt_date}</span><span>{r.method}{r.reference ? ` · ${r.reference}` : ''}</span><span className="ml-auto tabular-nums">{formatBDT(Number(r.amount))}</span></li>
              ))}</ul>}
            </div>
            {variations.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Contract changes</h3>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <ul className="divide-y divide-gray-100">{(variations as any[]).map((v) => (
                  <li key={v.id} className="flex gap-2 px-4 py-2 text-sm"><span className="text-xs text-gray-500">{v.var_date}</span><span>{v.description}</span><span className={`ml-auto tabular-nums ${Number(v.amount) < 0 ? 'text-red-600' : ''}`}>{formatBDT(Number(v.amount))}</span></li>
                ))}</ul>
              </div>
            )}
          </div>
        </div>
      </LsPage>
    </div>
  )
}
