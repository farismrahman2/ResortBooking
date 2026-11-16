import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, landscapingOverview } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

/** Landscaping → Overview: what's waiting for me, what's owed, cash in hand. */
export default async function LandscapingOverview() {
  await requirePermission('landscaping', 'read')
  const me = await getLsMe()
  const o = await landscapingOverview(me)
  const waiting = [...o.toApprove.map((r) => ({ ...r, step: 'approve' })), ...o.toCheck.map((r) => ({ ...r, step: 'check' }))]
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Landscaping" subtitle="Garden Centre — a separate business from the resort" />
      <LsPage tab="overview">
        <div className="flex flex-wrap gap-2">
          <Link href="/landscaping/requisitions/new" className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-sm font-medium text-white"><Plus size={14} /> New requisition</Link>
          <Link href="/landscaping/bills" className="inline-flex min-h-[38px] items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">Add a bill</Link>
          <Link href="/landscaping/cash" className="inline-flex min-h-[38px] items-center rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">Labour / food</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([['Money in this month', o.moneyInMonth], ['Money out this month', o.moneyOutMonth], ['Unpaid supplier bills', o.unpaidTotal], ['Cash with accountants', o.floats.reduce((s, f) => s + f.balance, 0)]] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">{l}</p><p className="text-xl font-semibold tabular-nums">{formatBDT(v)}</p></div>
          ))}
        </div>

        {waiting.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50">
            <h3 className="flex items-center gap-1.5 border-b border-sky-200 px-4 py-3 text-sm font-semibold text-sky-900"><ClipboardCheck size={15} /> Waiting for you</h3>
            <ul className="divide-y divide-sky-100">{waiting.map((r) => (
              <li key={r.id}><Link href={`/landscaping/requisitions/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-sky-100/50">
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">{r.step === 'approve' ? 'Approve' : 'Check'}</span>
                <span className="font-mono font-semibold">{formatReqNo(r.req_no)}</span><span className="min-w-0 flex-1 truncate">{r.description}</span>
                <span className="tabular-nums">{formatBDT(r.total)}</span>
              </Link></li>
            ))}</ul>
          </div>
        )}

        {o.overBudget.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Bills over the approved requisition</p>
            <ul className="mt-1 space-y-0.5">{o.overBudget.map((r) => (
              <li key={r.id}><Link href={`/landscaping/requisitions/${r.id}`} className="hover:underline">Req {formatReqNo(r.req_no)} — billed {formatBDT(r.billed)} of {formatBDT(r.total)} approved</Link></li>
            ))}</ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Active projects</h3>
            {o.projects.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">No active projects. <Link href="/landscaping/projects" className="text-forest-700 underline">Add one</Link>.</p> : (
              <ul className="divide-y divide-gray-100">{o.projects.map((p) => (
                <li key={p.id}><Link href={`/landscaping/projects/${p.id}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50">
                  <span className="font-semibold">{p.code}</span><span className="min-w-0 flex-1 truncate text-gray-600">{p.title}</span>
                  <span className="text-xs text-gray-500">spent {p.f.spentPct ?? 0}% · client owes {formatBDT(p.f.owedByClient)}</span>
                </Link></li>
              ))}</ul>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold">Unpaid supplier bills</h3>
            {o.unpaidBills.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">All paid.</p> : (
              <ul className="divide-y divide-gray-100">{o.unpaidBills.slice(0, 8).map((b) => (
                <li key={b.id} className="flex items-center gap-2 px-4 py-2 text-sm"><span>{b.supplier_name}</span><span className="text-xs text-gray-500">Req {b.req_no ? formatReqNo(b.req_no) : '—'}</span><span className="ml-auto tabular-nums">{formatBDT(b.amount - b.paid)}</span></li>
              ))}</ul>
            )}
          </div>
        </div>
      </LsPage>
    </div>
  )
}
