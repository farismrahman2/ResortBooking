import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus, LsTag } from '@/components/landscaping/LsStatus'
import { RequisitionActions } from '@/components/landscaping/RequisitionActions'
import { BillForm } from '@/components/landscaping/BillForm'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { LinkButton, LsEmpty, LsSection, Money, NextStep, StatTile } from '@/components/landscaping/ui'
import { EditPaymentButton, RequisitionSlipButton } from '@/components/landscaping/PaymentRecordActions'
import { listPaymentRecords } from '@/lib/queries/landscaping-payments'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getRequisition, listSuppliers } from '@/lib/queries/landscaping'
import { editRule, formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null

export default async function RequisitionPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data, suppliers] = await Promise.all([getLsMe(), getRequisition(params.id), listSuppliers()])
  if (!data || !me) notFound()
  const { req, items, bills, spend, names } = data
  const payments = req.status === 'approved' ? await listPaymentRecords({ reqNo: req.req_no }) : []
  const mine = req.prepared_by === me.user_id
  const canBill = req.status === 'approved' && (me.can_prepare || me.can_pay || me.is_admin)
  const canEdit = editRule(req.status, mine, me.is_admin).ok
  const leftToBill = Math.max(0, spend.approved - spend.billed)
  const billForm = canBill ? <BillForm fixedRequisitionId={req.id} fixedLeft={spend.remainingBudget} requisitions={[]} suppliers={suppliers} /> : null

  // What happens next, in one line, for this person.
  const next = (() => {
    switch (req.status) {
      case 'draft': return { tone: 'warn' as const, text: <><b>Not sent yet.</b> Check the items, then tap <b>Send for checking</b>.</> }
      case 'rejected': return { tone: 'bad' as const, text: <><b>Sent back{names.rejected ? ` by ${names.rejected}` : ''}:</b> {req.reject_note ?? 'needs changes'}. Edit it and send again.</> }
      case 'submitted': return { tone: 'info' as const, text: <><b>Waiting for a checker.</b>{canEdit ? ' Spotted a mistake? You can still edit it until it is checked.' : ''}</> }
      case 'checked': return { tone: 'info' as const, text: <><b>Checked{names.checked ? ` by ${names.checked}` : ''}</b> — waiting for approval.</> }
      case 'approved':
        if (bills.length === 0) return { tone: 'good' as const, text: <><b>Approved.</b> Order the items, then add the supplier bill here.</>, action: billForm }
        if (spend.overBudget) return null
        if (leftToBill > 0.5) return { tone: 'good' as const, text: <>Approved · billed {formatBDT(spend.billed)} · <b>{formatBDT(leftToBill)} left to bill</b>.</> }
        return spend.unpaid > 0.5 ? { tone: 'warn' as const, text: <>Fully billed · <b>{formatBDT(spend.unpaid)} still due</b> to suppliers.</> } : { tone: 'good' as const, text: <>Fully billed and paid.</> }
      case 'cancelled': return { tone: 'bad' as const, text: <>Cancelled — not used for ordering.</> }
      default: return null
    }
  })()

  const projectLabel = req.project ? `${req.project.parent ? `${req.project.parent.code} › ` : ''}${req.project.code} · ${req.project.title}` : null
  const sign = (label: string, slipName: string | null, inApp: string | null, at: string | null) => (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{slipName ?? inApp ?? '—'}</p>
      <p className="text-xs text-gray-500">{req.from_paper ? 'Signed on paper' : at ? `In the app${inApp && inApp !== slipName ? `: ${inApp}` : ''} · ${when(at)}` : 'Not yet'}</p>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Requisition ${formatReqNo(req.req_no)}`} subtitle={req.description} />
      <LsPage tab="requisitions">
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-bold text-gray-900">{formatReqNo(req.req_no)}</span>
            <LsStatus status={req.status} />
            {req.from_paper && <LsTag>Entered from paper{names.prepared ? ` by ${names.prepared}` : ''}</LsTag>}
            {req.slip_photo_path && <ViewPhoto path={req.slip_photo_path} label="Approved slip" />}
          </div>
          <p className="text-sm text-gray-700">
            {projectLabel ? <Link href={`/landscaping/projects/${req.project.id}`} className="font-medium text-forest-700 hover:underline">{projectLabel}</Link> : 'No project'}
            <span className="text-gray-500"> · {req.req_date}</span>
          </p>
          <RequisitionActions req={req} me={me} hasBills={bills.length > 0} />
        </div>

        {next && <NextStep tone={next.tone} action={'action' in next ? next.action : undefined}>{next.text}</NextStep>}
        {spend.overBudget && (
          <NextStep tone="bad"><span className="inline-flex items-center gap-1.5 font-medium"><AlertTriangle size={15} /> Bills are {formatBDT(spend.overBy)} over the approved amount.</span></NextStep>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Approved" value={formatBDT(spend.approved)} />
          <StatTile label="Billed" value={formatBDT(spend.billed)} tone={spend.overBudget ? 'bad' : 'neutral'} />
          <StatTile label="Paid" value={formatBDT(spend.paid)} tone={spend.paid > 0 ? 'good' : 'neutral'} />
          <StatTile label="Due" value={formatBDT(spend.unpaid)} tone={spend.unpaid > 0.5 ? 'owed' : 'neutral'} />
        </div>

        <LsSection title="Slip details">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-2">
            <div className="flex gap-2"><dt className="text-gray-500">Work category:</dt><dd className="font-medium">{req.department ?? '—'}</dd></div>
            <div className="flex gap-2"><dt className="text-gray-500">Requested by:</dt><dd className="font-medium">{req.requested_by_name ?? '—'}</dd></div>
            {req.area_note && <div className="flex gap-2 sm:col-span-2"><dt className="text-gray-500">Area:</dt><dd>{req.area_note}</dd></div>}
          </dl>
          {/* Phones: one card per item. Larger screens: a table. */}
          <ul className="divide-y divide-gray-100 border-t border-gray-100 sm:hidden">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{i.line_no}. {i.description}</p>
                  <p className="text-xs text-gray-500">{i.qty.toLocaleString('en-IN')} {i.unit ?? ''} × {formatBDT(i.unit_price)}</p>
                </div>
                <span className="font-semibold tabular-nums">{formatBDT(i.amount)}</span>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm sm:table">
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
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-gray-200 bg-forest-50 px-4 py-2.5">
            <span className="font-semibold text-forest-900">Total</span><span className="text-lg font-bold tabular-nums text-forest-900">{formatBDT(req.total)}</span>
          </div>
          {req.remarks && <p className="border-t border-gray-100 px-4 py-2 text-sm text-gray-600">Remarks: {req.remarks}</p>}
          <div className="grid grid-cols-1 gap-2 border-t border-gray-100 p-3 sm:grid-cols-3">
            {sign('Prepared by', req.paper_prepared_by, names.prepared, req.submitted_at)}
            {sign('Checked by', req.paper_checked_by, names.checked, req.checked_at)}
            {sign('Approved by', req.paper_approved_by, names.approved, req.approved_at)}
          </div>
        </LsSection>

        {req.status === 'approved' && (
          <LsSection title="Payment proof" meta={payments.length ? `${payments.length} payment${payments.length === 1 ? '' : 's'} · ${formatBDT(payments.reduce((s, p) => s + p.amount, 0))}` : undefined}
            action={me.can_pay ? <LinkButton href={`/landscaping/payments/new?req=${req.id}`} variant="primary">Upload payment</LinkButton> : undefined}>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm">
              <span className="font-medium text-gray-700">Approved requisition slip:</span>
              {req.slip_photo_path ? <ViewPhoto path={req.slip_photo_path} label="View" /> : <span className="text-amber-700">not attached yet</span>}
              <span className="ml-auto"><RequisitionSlipButton requisitionId={req.id} hasSlip={!!req.slip_photo_path} isAdmin={me.is_admin} /></span>
            </div>
            {payments.length === 0 ? (
              <LsEmpty title="No payments yet." hint="Upload each payment with its slip (receipt / challan) as proof." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold tabular-nums">{formatBDT(p.amount)} <span className="font-normal text-gray-500">· {p.pay_date} · {p.method}{p.supplier_name ? ` · ${p.supplier_name}` : ''}</span></p>
                      {p.note && <p className="text-xs text-gray-600">{p.note}</p>}
                      <p className="text-[11px] text-gray-400">Uploaded by {p.uploaded_by ?? '—'} · {new Date(p.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {p.photo_path ? <ViewPhoto path={p.photo_path} label="Payment slip" /> : <span className="text-xs text-amber-700">No slip</span>}
                    <EditPaymentButton payment={p} isAdmin={me.is_admin} canEdit={me.is_admin || p.created_by === me.user_id} />
                  </li>
                ))}
              </ul>
            )}
          </LsSection>
        )}

        <LsSection title="Supplier bills" meta={bills.length ? `${bills.length} · ${formatBDT(spend.billed)}` : undefined} action={bills.length > 0 ? billForm : undefined}>
          {req.status !== 'approved' ? (
            <LsEmpty title="Bills can be added once this requisition is approved." />
          ) : bills.length === 0 ? (
            <LsEmpty title="No bills yet." hint="When the supplier delivers, add their bill or challan here with a photo." action={billForm} />
          ) : (
            <ul className="divide-y divide-gray-100">
              {bills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/landscaping/suppliers/${b.supplier_id}`} className="font-medium text-forest-700 hover:underline">{b.supplier_name}</Link>
                      <LsStatus status={b.status} />
                      {b.photo_path && <ViewPhoto path={b.photo_path} />}
                    </div>
                    <p className="text-xs text-gray-500">Bill {b.bill_no ?? '—'} · {b.bill_date}{b.note ? ` · ${b.note}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatBDT(b.amount)}</p>
                    {b.status !== 'paid' && <p className="text-xs">due <Money value={b.amount - b.paid} kind="owed" /></p>}
                  </div>
                  {b.status !== 'paid' && (me.can_pay || me.is_admin) && <PayBillButton billId={b.id} due={b.amount - b.paid} label={`${b.supplier_name} bill ${b.bill_no ?? ''}`} />}
                </li>
              ))}
            </ul>
          )}
        </LsSection>
      </LsPage>
    </div>
  )
}
