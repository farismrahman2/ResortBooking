import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { ViewPhotos } from '@/components/landscaping/ViewPhotos'
import { EditPaymentButton } from '@/components/landscaping/PaymentRecordActions'
import { LinkButton, LsEmpty, LsSection, StatTile, TAP } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getRequisition } from '@/lib/queries/landscaping'
import { listPaymentRecords } from '@/lib/queries/landscaping-payments'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
const num = (v?: string) => (v && Number(v) >= 0 ? Number(v) : undefined)
const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtStamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const METHOD: Record<string, string> = { cash: 'Cash', bkash: 'bKash', bank: 'Bank', cheque: 'Cheque' }
const box = `${TAP} w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200`
const lbl = 'mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'

/**
 * Payment records: every payment with its payment slip, linked to its approved
 * requisition and the signed requisition slip. Search by Req. No., dates, amount.
 */
export default async function PaymentRecordsPage({ searchParams }: {
  searchParams: { req?: string; from?: string; to?: string; min?: string; max?: string; missing?: string }
}) {
  await requirePermission('landscaping', 'read')
  const reqNo = Number((searchParams.req ?? '').replace(/\D/g, '')) || undefined
  const filter = {
    reqNo, from: day(searchParams.from), to: day(searchParams.to),
    min: num(searchParams.min), max: num(searchParams.max), missingSlip: searchParams.missing === '1',
  }
  const [me, rows] = await Promise.all([getLsMe(), listPaymentRecords(filter)])
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const missing = rows.filter((r) => !r.photo_path).length
  const filtered = !!(reqNo || filter.from || filter.to || filter.min !== undefined || filter.max !== undefined || filter.missingSlip)

  // Searching one requisition: show what was requisitioned and approved, with its slip.
  const single = reqNo && rows[0] ? await getRequisition(rows[0].requisition_id) : null

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Payment records" subtitle="Approved requisitions with their payment slips — proof of every payment" />
      <LsPage tab="payments">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-gray-600">Search a requisition number to see what was approved, the signed slip, what was paid and the payment slips.</p>
          {me?.can_pay && <LinkButton href="/landscaping/payments/new" variant="primary"><Plus size={15} /> Upload payment</LinkButton>}
        </div>

        <form action="/landscaping/payments" className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:grid-cols-6 sm:items-end">
          <label className="col-span-2 block sm:col-span-1"><span className={lbl}>Requisition No.</span>
            <input name="req" inputMode="numeric" placeholder="00039" defaultValue={searchParams.req ?? ''} className={box} /></label>
          <label className="block"><span className={lbl}>From</span><input type="date" name="from" defaultValue={filter.from ?? ''} className={box} /></label>
          <label className="block"><span className={lbl}>To</span><input type="date" name="to" defaultValue={filter.to ?? ''} className={box} /></label>
          <label className="block"><span className={lbl}>Min Tk</span><input name="min" type="number" inputMode="decimal" step="any" defaultValue={searchParams.min ?? ''} className={box} /></label>
          <label className="block"><span className={lbl}>Max Tk</span><input name="max" type="number" inputMode="decimal" step="any" defaultValue={searchParams.max ?? ''} className={box} /></label>
          <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
            <button type="submit" className={`${TAP} inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forest-700 px-4 text-sm font-medium text-white`}><Search size={15} /> Search</button>
            {filtered && <Link href="/landscaping/payments" className={`${TAP} inline-flex items-center px-2 text-sm text-gray-600 hover:underline`}>Clear</Link>}
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 sm:col-span-6">
            <input type="checkbox" name="missing" value="1" defaultChecked={filter.missingSlip} className="h-5 w-5 rounded border-gray-300" /> Only payments without a slip yet
          </label>
        </form>

        {single && (
          <LsSection title={<>Requisition {formatReqNo(single.req.req_no)} · {single.req.description}</>}
            action={<LinkButton href={`/landscaping/requisitions/${single.req.id}`}>Open requisition</LinkButton>}>
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
              <StatTile label="Approved" value={formatBDT(single.spend.approved)} />
              <StatTile label="Billed" value={formatBDT(single.spend.billed)} tone={single.spend.overBudget ? 'bad' : 'neutral'} />
              <StatTile label="Paid" value={formatBDT(single.spend.paid)} tone="good" />
              <StatTile label="Due" value={formatBDT(single.spend.unpaid)} tone={single.spend.unpaid > 0.5 ? 'owed' : 'neutral'} />
            </div>
            <ul className="divide-y divide-gray-100 border-t border-gray-100 text-sm">
              {single.items.map((i) => (
                <li key={i.id} className="flex gap-3 px-4 py-2"><span className="min-w-0 flex-1">{i.line_no}. {i.description} <span className="text-xs text-gray-500">{i.qty.toLocaleString('en-IN')} {i.unit ?? ''} × {formatBDT(i.unit_price)}</span></span><span className="tabular-nums">{formatBDT(i.amount)}</span></li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-2 text-sm">
              <span className="text-gray-600">Approved slip:</span>
              <ViewPhotos paths={[single.req.slip_photo_path, ...(single.req.extra_photo_paths ?? [])]} label="View requisition slip" empty={<span className="text-amber-700">not attached yet</span>} />
              <span className="ml-auto text-xs text-gray-500">{single.req.department ?? ''}{single.req.requested_by_name ? ` · requested by ${single.req.requested_by_name}` : ''}</span>
            </div>
          </LsSection>
        )}

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Payments" value={rows.length.toLocaleString('en-IN')} />
          <StatTile label="Total paid" value={formatBDT(total)} />
          <StatTile label="Without slip" value={missing} tone={missing ? 'warn' : 'neutral'} href={missing && !filter.missingSlip ? '/landscaping/payments?missing=1' : undefined} />
        </div>

        <LsSection title="Requisition history" meta={filtered ? 'filtered' : 'newest first'}>
          {rows.length === 0 ? (
            <LsEmpty title={filtered ? 'No payments match.' : 'No payments yet.'}
              hint={filtered ? 'Check the requisition number, or widen the dates or amounts.' : 'Upload the first payment with its slip.'}
              action={!filtered && me?.can_pay ? <LinkButton href="/landscaping/payments/new" variant="primary"><Plus size={15} /> Upload payment</LinkButton> : undefined} />
          ) : (
            <>
              {/* Phones: one card per payment */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
                    <div className="flex items-baseline gap-2">
                      <Link href={`/landscaping/requisitions/${r.requisition_id}`} className="font-mono font-semibold text-forest-700 hover:underline">{formatReqNo(r.req_no)}</Link>
                      <span className="ml-auto font-semibold tabular-nums">{formatBDT(r.amount)}</span>
                    </div>
                    <p className="text-gray-700">{r.req_description}</p>
                    <p className="text-xs text-gray-500">{fmtDate(r.pay_date)} · {METHOD[r.method] ?? r.method}{r.supplier_name ? ` · ${r.supplier_name}` : ''}{r.reference ? ` · ${r.reference}` : ''}</p>
                    {r.note && <p className="text-xs text-gray-600">{r.note}</p>}
                    <div className="flex flex-wrap items-center gap-1">
                      <ViewPhotos paths={[r.req_slip_path, ...r.req_slip_extra]} label="Requisition slip" empty={<span className="px-1.5 text-xs text-amber-700">No requisition slip</span>} />
                      <ViewPhotos paths={[r.photo_path, ...r.extra_photo_paths]} label="Payment slip" empty={<span className="px-1.5 text-xs text-amber-700">No payment slip</span>} />
                      <span className="ml-auto"><EditPaymentButton payment={r} isAdmin={!!me?.is_admin} canEdit={!!me && (me.is_admin || r.created_by === me.user_id)} /></span>
                    </div>
                    <p className="text-[11px] text-gray-400">Uploaded by {r.uploaded_by ?? '—'} · {fmtStamp(r.created_at)}</p>
                  </li>
                ))}
              </ul>
              {/* Larger screens: the table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Requisition No.</th><th className="px-2 py-2 text-right">Payment amount</th><th className="px-2 py-2">Payment date</th>
                      <th className="px-2 py-2">Requisition photo</th><th className="px-2 py-2">Payment slip</th><th className="px-2 py-2">Uploaded by</th><th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-2">
                          <Link href={`/landscaping/requisitions/${r.requisition_id}`} className="font-mono font-semibold text-forest-700 hover:underline">{formatReqNo(r.req_no)}</Link>
                          <p className="max-w-[260px] text-xs text-gray-500">{r.req_description}{r.supplier_name ? ` · ${r.supplier_name}` : ''}</p>
                          {r.note && <p className="max-w-[260px] text-xs text-gray-600">{r.note}</p>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">{formatBDT(r.amount)}<p className="text-xs font-normal text-gray-500">{METHOD[r.method] ?? r.method}{r.reference ? ` · ${r.reference}` : ''}</p></td>
                        <td className="whitespace-nowrap px-2 py-2">{fmtDate(r.pay_date)}</td>
                        <td className="px-2 py-1"><ViewPhotos paths={[r.req_slip_path, ...r.req_slip_extra]} empty={<span className="text-xs text-amber-700">Not attached</span>} /></td>
                        <td className="px-2 py-1"><ViewPhotos paths={[r.photo_path, ...r.extra_photo_paths]} empty={<span className="text-xs text-amber-700">Not attached</span>} /></td>
                        <td className="px-2 py-2 text-xs text-gray-600">{r.uploaded_by ?? '—'}<p className="text-gray-400">{fmtStamp(r.created_at)}</p></td>
                        <td className="px-4 py-1 text-right"><EditPaymentButton payment={r} isAdmin={!!me?.is_admin} canEdit={!!me && (me.is_admin || r.created_by === me.user_id)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>
      </LsPage>
    </div>
  )
}
