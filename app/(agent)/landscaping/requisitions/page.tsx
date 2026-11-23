import { Plus, AlertTriangle, Search } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus, LsTag } from '@/components/landscaping/LsStatus'
import { FilterChips, LinkButton, ListRow, LsEmpty, LsSection, TAP } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listRequisitions, type LsRequisitionRow } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: string; label: string; test: (r: LsRequisitionRow, me: string) => boolean }> = [
  // Cancelled requisitions are hidden everywhere except their own filter.
  { key: '', label: 'All', test: (r) => r.status !== 'cancelled' },
  { key: 'mine', label: 'Mine', test: (r, me) => r.prepared_by === me && r.status !== 'cancelled' },
  { key: 'submitted', label: 'Waiting check', test: (r) => r.status === 'submitted' },
  { key: 'checked', label: 'Waiting approval', test: (r) => r.status === 'checked' },
  { key: 'approved', label: 'Approved', test: (r) => r.status === 'approved' },
  { key: 'to_bill', label: 'Not fully billed', test: (r) => r.status === 'approved' && r.billed < r.total - 0.5 },
  { key: 'draft', label: 'Drafts', test: (r) => r.status === 'draft' },
  { key: 'rejected', label: 'Sent back', test: (r) => r.status === 'rejected' },
]

export default async function RequisitionsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requirePermission('landscaping', 'read')
  const status = searchParams.status ?? ''
  const q = (searchParams.q ?? '').trim().toLowerCase()
  const [all, me] = await Promise.all([listRequisitions(), getLsMe()])
  const meId = me?.user_id ?? ''
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0]
  const qDigits = q.replace(/\D/g, '')
  const rows = all.filter((r) => filter.test(r, meId)).filter((r) => !q
    || (qDigits && String(r.req_no).includes(String(Number(qDigits))))
    || r.description.toLowerCase().includes(q)
    || (r.department ?? '').toLowerCase().includes(q)
    || (r.requested_by_name ?? '').toLowerCase().includes(q)
    || (r.project_code ?? '').toLowerCase().includes(q))
  const href = (s: string) => `/landscaping/requisitions?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Requisitions" subtitle="Landscaping · prepared → checked → approved → ordered" />
      <LsPage tab="requisitions">
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative min-w-0 flex-1 sm:max-w-sm" action="/landscaping/requisitions">
            {status && <input type="hidden" name="status" value={status} />}
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Search no., item, project, person…" aria-label="Search requisitions"
              className={`${TAP} w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200`} />
          </form>
          <div className="ml-auto flex gap-2">
            {me?.is_admin && <LinkButton href="/landscaping/requisitions/past">Record past slip</LinkButton>}
            {me?.can_prepare && <LinkButton href="/landscaping/requisitions/new" variant="primary"><Plus size={15} /> New requisition</LinkButton>}
          </div>
        </div>
        <FilterChips current={filter.key} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href(f.key), count: f.key && f.key !== 'approved' ? all.filter((r) => f.test(r, meId)).length : undefined }))} />

        <LsSection title={`${rows.length} requisition${rows.length === 1 ? '' : 's'}`} meta={q ? `matching “${searchParams.q}”` : undefined}>
          {rows.length === 0 ? (
            <LsEmpty title={q ? 'Nothing matches that search.' : 'No requisitions here yet.'}
              hint={q ? 'Try the Req. No. or one word from the item or project.' : 'A requisition is the slip you fill in before ordering materials.'}
              action={!q && me?.can_prepare ? <LinkButton href="/landscaping/requisitions/new" variant="primary"><Plus size={15} /> New requisition</LinkButton> : undefined} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <ListRow key={r.id} href={`/landscaping/requisitions/${r.id}`}
                  amount={formatBDT(r.total)}
                  sub={r.billCount ? <>billed {formatBDT(r.billed)}{r.overBudget && <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-red-600"><AlertTriangle size={11} /> over</span>}</> : r.status === 'approved' ? 'no bills yet' : undefined}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-gray-900">{formatReqNo(r.req_no)}</span>
                    <LsStatus status={r.status} />
                    {r.from_paper && <LsTag>Paper</LsTag>}
                    {r.self_approved && <LsTag>Self-approved</LsTag>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-700">{r.description}</p>
                  <p className="text-xs text-gray-500">{[r.project_code, r.department, r.requested_by_name, r.req_date, r.status === 'approved' && r.approved_by_name ? `approved by ${r.approved_by_name}` : null].filter(Boolean).join(' · ')}</p>
                </ListRow>
              ))}
            </ul>
          )}
        </LsSection>
      </LsPage>
    </div>
  )
}
