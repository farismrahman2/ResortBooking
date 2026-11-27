import Link from 'next/link'
import { Search } from 'lucide-react'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { BillForm } from '@/components/landscaping/BillForm'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { StampedPhotos } from '@/components/landscaping/StampedPhotos'
import { FilterChips, LinkButton, LsEmpty, LsSection, Money, TAP, fmtDay } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listBills } from '@/lib/queries/landscaping'
import { billableRequisitions, myCashInHand, searchBills, supplierNames } from '@/lib/queries/landscaping-extra-bills'
import { formatReqNo } from '@/lib/landscaping/money'
import type { BillStatus } from '@/lib/landscaping/money'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: '' | BillStatus; label: string }> = [
  { key: '', label: 'All' }, { key: 'unpaid', label: 'Unpaid' }, { key: 'part_paid', label: 'Part paid' }, { key: 'paid', label: 'Paid' },
]
const STATUSES: BillStatus[] = ['unpaid', 'part_paid', 'paid']

function href(status: string, q: string) {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  if (q) p.set('q', q)
  const s = p.toString()
  return s ? `/landscaping/bills?${s}` : '/landscaping/bills'
}

export default async function BillsPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requirePermission('landscaping', 'read')
  const status = STATUSES.includes(searchParams.status as BillStatus) ? (searchParams.status as BillStatus) : undefined
  const q = (searchParams.q ?? '').trim()
  const me = await getLsMe()
  const canAdd = !!me && (me.can_prepare || me.can_pay || me.is_admin)
  const canPay = !!me && (me.can_pay || me.is_admin)
  const [all, suppliers, reqs, cash] = await Promise.all([
    listBills(), canAdd ? supplierNames() : Promise.resolve([]), canAdd ? billableRequisitions() : Promise.resolve([]), myCashInHand(me),
  ])
  const searched = searchBills(all, q)
  const bills = status ? searched.filter((b) => b.status === status) : searched
  const due = bills.reduce((s, b) => s + (b.amount - b.paid), 0)
  /** Keep a Pay column (so amounts line up) only when something on screen can be paid. */
  const anyUnpaid = bills.some((b) => b.status !== 'paid')
  const count = (k: '' | BillStatus) => (k ? searched.filter((b) => b.status === k).length : searched.length)

  return (
    <LsPage tab="bills" title="Supplier bills" subtitle="Bills against approved requisitions"
      actions={canAdd ? <BillForm requisitions={reqs} suppliers={suppliers} /> : undefined}>
        <form action="/landscaping/bills" method="get" className="flex items-center gap-2" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search bills</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" name="q" defaultValue={q} placeholder="Supplier, bill no. or req no."
              className={cn(TAP, 'w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200')} />
          </label>
          <button type="submit" className={cn(TAP, 'flex-shrink-0 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50')}>Search</button>
        </form>

        <FilterChips current={status ?? ''} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: href(f.key, q), count: count(f.key) }))} />

        <LsSection
          title={q ? <>Bills matching &ldquo;{q}&rdquo;</> : 'Bills'}
          meta={<>{bills.length} bill{bills.length === 1 ? '' : 's'} · due <Money value={due} kind="owed" /></>}
          action={q ? <Link href={href(status ?? '', '')} className={cn(TAP, 'inline-flex items-center rounded-lg px-2 text-xs font-medium text-forest-700 hover:bg-forest-50')}>Clear search</Link> : undefined}
        >
          {bills.length === 0 ? (
            <LsEmpty
              title={q ? 'No bills match your search' : status ? 'No bills with this status' : 'No bills yet'}
              hint={q ? 'Try part of the supplier name, the bill number, or the requisition number.' : 'Bills are added against an approved requisition.'}
              action={q || status ? <LinkButton href="/landscaping/bills">Show all bills</LinkButton> : undefined}
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {bills.map((b) => {
                const owe = b.amount - b.paid
                const unpaid = b.status !== 'paid'
                return (
                  <li key={b.id} className="flex items-start gap-3 px-4 pb-1.5 pt-3 sm:items-center sm:gap-4">
                    {/* Who, status, which bill and requisition */}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/landscaping/suppliers/${b.supplier_id}`} className="min-w-0 truncate text-sm font-semibold text-gray-900 hover:text-forest-700 hover:underline">{b.supplier_name}</Link>
                        <LsStatus status={b.status} />
                      </div>
                      {/* Phone: bill no. and date on one line, the links under it. Computer: all on one line. */}
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500 sm:gap-x-1.5">
                        <span className="w-full pt-0.5 sm:w-auto sm:pt-0">Bill {b.bill_no ?? '—'} · {fmtDay(b.bill_date)}</span>
                        <span aria-hidden className="hidden sm:inline">·</span>
                        <Link href={`/landscaping/requisitions/${b.requisition_id}`} className={cn(TAP, 'inline-flex items-center font-medium text-forest-700 hover:underline')}>
                          Req {b.req_no ? formatReqNo(b.req_no) : '—'}{b.project_code ? ` · ${b.project_code}` : ''} →
                        </Link>
                        {b.req_no ? <StampedPhotos paths={[b.photo_path, ...(b.extra_photo_paths ?? [])]} reqNo={b.req_no} label="Bill" kind={`bill${b.bill_no ? `-${b.bill_no.replace(/[^A-Za-z0-9]+/g, '')}` : ''}`} /> : null}
                      </div>
                    </div>
                    {/* Amount and what is still due; Pay sits beside it on a computer, under it on a phone */}
                    <div className="flex flex-shrink-0 flex-col items-end gap-1 pb-1.5 sm:flex-row sm:items-center sm:gap-4 sm:pb-0">
                      <div className="text-right sm:w-32">
                        <Money value={b.amount} className="block text-sm font-semibold text-gray-900" />
                        {unpaid
                          ? <span className="block text-xs text-gray-500">Due <Money value={owe} kind="owed" /></span>
                          : <span className="block text-xs text-gray-400">Paid in full</span>}
                      </div>
                      {canPay && anyUnpaid && (
                        <div className="flex sm:w-20 sm:justify-end">
                          {unpaid && <PayBillButton billId={b.id} due={owe} label={`${b.supplier_name} bill ${b.bill_no ?? ''}`} cashInHand={cash} />}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </LsSection>
    </LsPage>
  )
}
