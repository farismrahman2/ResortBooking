import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { BillForm } from '@/components/landscaping/BillForm'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { requirePermission } from '@/lib/auth/permissions'
import { approvedRequisitions, getLsMe, listBills, listSuppliers } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import type { BillStatus } from '@/lib/landscaping/money'

export const dynamic = 'force-dynamic'

const FILTERS: Array<{ key: '' | BillStatus; label: string }> = [
  { key: '', label: 'All' }, { key: 'unpaid', label: 'Unpaid' }, { key: 'part_paid', label: 'Part paid' }, { key: 'paid', label: 'Paid' },
]

export default async function BillsPage({ searchParams }: { searchParams: { status?: BillStatus } }) {
  await requirePermission('landscaping', 'read')
  const status = searchParams.status
  const [me, bills, suppliers, reqs] = await Promise.all([getLsMe(), listBills(status ? { status } : {}), listSuppliers(), approvedRequisitions()])
  const due = bills.reduce((s, b) => s + (b.amount - b.paid), 0)
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Supplier bills" subtitle="Landscaping · bills against approved requisitions" />
      <LsPage tab="bills">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key ? `/landscaping/bills?status=${f.key}` : '/landscaping/bills'}
              className={`rounded-full border px-3 py-1 text-xs ${(status ?? '') === f.key ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 bg-white text-gray-600'}`}>{f.label}</Link>
          ))}
          <span className="text-xs text-gray-500">Still to pay here: <b className="text-gray-900">{formatBDT(due)}</b></span>
          {me && (me.can_prepare || me.can_pay || me.is_admin) && <div className="ml-auto"><BillForm requisitions={reqs} suppliers={suppliers} /></div>}
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {bills.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">No bills here.</p> : (
            <ul className="divide-y divide-gray-100">
              {bills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <LsStatus status={b.status} />
                  <Link href={`/landscaping/suppliers/${b.supplier_id}`} className="font-medium text-gray-900 hover:underline">{b.supplier_name}</Link>
                  <span className="text-xs text-gray-500">Bill {b.bill_no ?? '—'} · {b.bill_date}</span>
                  <Link href={`/landscaping/requisitions/${b.requisition_id}`} className="text-xs text-forest-700 hover:underline">Req {b.req_no ? formatReqNo(b.req_no) : '—'}{b.project_code ? ` · ${b.project_code}` : ''}</Link>
                  {b.photo_path && <ViewPhoto path={b.photo_path} />}
                  <span className="ml-auto tabular-nums">{formatBDT(b.amount)}{b.paid > 0 && b.status !== 'paid' ? ` · due ${formatBDT(b.amount - b.paid)}` : ''}</span>
                  {b.status !== 'paid' && me && (me.can_pay || me.is_admin) && <PayBillButton billId={b.id} due={b.amount - b.paid} label={`${b.supplier_name} bill ${b.bill_no ?? ''}`} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </LsPage>
    </div>
  )
}
