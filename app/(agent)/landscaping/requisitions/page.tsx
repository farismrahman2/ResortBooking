import Link from 'next/link'
import { Plus, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listRequisitions } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const FILTERS = [
  { key: '', label: 'All' }, { key: 'submitted', label: 'Waiting check' }, { key: 'checked', label: 'Waiting approval' },
  { key: 'approved', label: 'Approved' }, { key: 'draft', label: 'Drafts' }, { key: 'rejected', label: 'Sent back' },
]

export default async function RequisitionsPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePermission('landscaping', 'read')
  const status = searchParams.status ?? ''
  const [rows, me] = await Promise.all([listRequisitions(status ? { status } : {}), getLsMe()])
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Requisitions" subtitle="Landscaping · prepared → checked → approved → ordered" />
      <LsPage tab="requisitions">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key ? `/landscaping/requisitions?status=${f.key}` : '/landscaping/requisitions'}
              className={`rounded-full border px-3 py-1 text-xs ${status === f.key ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 bg-white text-gray-600'}`}>
              {f.label}
            </Link>
          ))}
          {me?.is_admin && (
            <Link href="/landscaping/requisitions/past" className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
              Record past requisition
            </Link>
          )}
          <Link href="/landscaping/requisitions/new" className={`${me?.is_admin ? '' : 'ml-auto '}inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-sm font-medium text-white`}>
            <Plus size={14} /> New requisition
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {rows.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">No requisitions here yet.</p> : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/landscaping/requisitions/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-50">
                    <span className="font-mono text-sm font-semibold text-gray-900">{formatReqNo(r.req_no)}</span>
                    <LsStatus status={r.status} />
                    {r.from_paper && <span className="rounded border border-gray-300 px-1.5 text-[10px] font-semibold uppercase text-gray-500">paper</span>}
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{r.description}</span>
                    <span className="text-xs text-gray-500">{r.project_code ?? '—'} · {r.req_date}</span>
                    <span className="w-full text-xs text-gray-500 sm:w-auto">
                      Approved {formatBDT(r.total)}{r.billCount ? ` · billed ${formatBDT(r.billed)} · paid ${formatBDT(r.paid)}` : ''}
                      {r.overBudget && <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-red-600"><AlertTriangle size={11} /> over budget</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </LsPage>
    </div>
  )
}
