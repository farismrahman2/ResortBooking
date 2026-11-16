import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { RequisitionActions } from '@/components/landscaping/RequisitionActions'
import { BillForm } from '@/components/landscaping/BillForm'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getRequisition, listSuppliers } from '@/lib/queries/landscaping'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

export default async function RequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data, suppliers] = await Promise.all([getLsMe(), getRequisition(params.id), listSuppliers()])
  if (!data || !me) notFound()
  const { req, items, bills, spend, names } = data

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Requisition ${formatReqNo(req.req_no)}`} subtitle={req.description} />
      <LsPage tab="requisitions">
        <div className="flex flex-wrap items-center gap-3">
          <LsStatus status={req.status} />
          <span className="text-sm text-gray-600">{req.project ? `${req.project.code} · ${req.project.title}` : 'No project'} · {req.req_date}</span>
          <div className="ml-auto"><RequisitionActions req={req} me={me} hasBills={bills.length > 0} /></div>
        </div>

        {req.status === 'rejected' && req.reject_note && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Sent back by {names.rejected ?? 'someone'}: {req.reject_note}</p>
        )}
        {spend.overBudget && (
          <p className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <AlertTriangle size={15} /> Bills are {formatBDT(spend.overBy)} over the approved amount.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Approved', spend.approved], ['Billed', spend.billed], ['Paid', spend.paid], ['Still unpaid', spend.unpaid]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">{l}</p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{formatBDT(v as number)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="grid grid-cols-1 gap-2 border-b border-gray-100 px-4 py-3 text-sm sm:grid-cols-2">
            <p><span className="text-gray-500">Department:</span> {req.department ?? '—'}</p>
            <p><span className="text-gray-500">Requested by:</span> {req.requested_by_name ?? '—'}</p>
            {req.area_note && <p className="sm:col-span-2"><span className="text-gray-500">Area:</span> {req.area_note}</p>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr><th className="px-4 py-2">Item</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{i.line_no}. {i.description}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{i.qty.toLocaleString('en-IN')} {i.unit ?? ''}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBDT(i.unit_price)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatBDT(i.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 bg-forest-50"><td colSpan={3} className="px-4 py-2 font-semibold text-forest-900">Total</td><td className="px-4 py-2 text-right font-bold tabular-nums text-forest-900">{formatBDT(req.total)}</td></tr>
            </tbody>
          </table>
          {req.remarks && <p className="border-t border-gray-100 px-4 py-2 text-sm text-gray-600">Remarks: {req.remarks}</p>}
          <div className="grid grid-cols-1 gap-2 border-t border-gray-100 px-4 py-3 text-xs text-gray-600 sm:grid-cols-3">
            <p><b className="text-gray-800">Prepared</b> {names.prepared ?? '—'}{req.submitted_at ? ` · ${when(req.submitted_at)}` : ''}</p>
            <p><b className="text-gray-800">Checked</b> {names.checked ?? '—'}{req.checked_at ? ` · ${when(req.checked_at)}` : ''}</p>
            <p><b className="text-gray-800">Approved</b> {names.approved ?? '—'}{req.approved_at ? ` · ${when(req.approved_at)}` : ''}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Supplier bills</h3>
            {req.status === 'approved' && (me.can_prepare || me.can_pay || me.is_admin) && (
              <div className="ml-auto"><BillForm fixedRequisitionId={req.id} requisitions={[]} suppliers={suppliers} /></div>
            )}
          </div>
          {req.status !== 'approved' && <p className="px-4 py-3 text-xs text-gray-500">Bills can be added once this requisition is approved.</p>}
          {bills.length === 0 ? (req.status === 'approved' && <p className="px-4 py-4 text-sm text-gray-500">No bills yet.</p>) : (
            <ul className="divide-y divide-gray-100">
              {bills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <LsStatus status={b.status} />
                  <span className="font-medium text-gray-900">{b.supplier_name}</span>
                  <span className="text-xs text-gray-500">Bill {b.bill_no ?? '—'} · {b.bill_date}</span>
                  {b.photo_path && <ViewPhoto path={b.photo_path} />}
                  <span className="ml-auto tabular-nums">{formatBDT(b.amount)}{b.paid > 0 && b.status !== 'paid' ? ` · paid ${formatBDT(b.paid)}` : ''}</span>
                  {b.status !== 'paid' && (me.can_pay || me.is_admin) && <PayBillButton billId={b.id} due={b.amount - b.paid} label={`${b.supplier_name} bill ${b.bill_no ?? ''}`} />}
                  {b.note && <p className="w-full text-xs text-gray-500">{b.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </LsPage>
    </div>
  )
}
